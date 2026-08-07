// EHS Talent Engine — web sourcing (the twice-weekly Sourcing Agent sweep).
//
// This is the ONE module in the talent engine that talks to a model over the
// network. It asks the OpenAI Responses API, with the web_search tool, for
// publicly posted EHS professionals or publicly posted EHS contract/staffing
// openings, and hands back parsed, validated, gateway-cleared LEADS.
//
// It reads no database and writes nothing. It promotes nothing. Every lead it
// returns lands in `talent_sourcing_leads` with status 'new' and waits there
// for a human to accept or dismiss it. That is the Human Authority Rule from
// CLAUDE.md applied to sourcing: a sweep is Tier 1 gathering, and the gate that
// admits a lead into talent_candidates / talent_job_orders is a person.
//
// The house pattern for the Responses API + web search is lib/legal/research.ts;
// client construction, model resolution, the incomplete-response guard and the
// output-text extraction here mirror it deliberately, and it reuses the same
// OPENAI_API_KEY / OPENAI_RESEARCH_MODEL environment variables. No new env var
// is introduced by this module.
//
// ===========================================================================
// EEO / PRIVACY CONTRACT (SourcingLeadRow in ./types)
// ===========================================================================
// A candidate lead carries only PUBLIC PROFESSIONAL information: the name or
// handle as published, the professional title, claimed certifications, the
// vertical, the location, a published pay ask, and the public source URL.
//
// Protected attributes are never requested, never extracted and never stored.
// `sourcingProtectedAttributeClause` is the literal instruction that says so,
// it goes into BOTH prompts, and sourcing.test.ts pins it verbatim and asserts
// that nothing else in either prompt asks for a protected attribute. Treat that
// test as the contract, not as coverage: weakening the clause is the failure
// mode this module exists to prevent.
//
// ===========================================================================
// AI GATEWAY (CLAUDE.md → AI GATEWAY RULES)
// ===========================================================================
// Lead text crossed the network from a language model that was reading pages we
// do not control, so every surviving lead's title + summary goes through
// `validateAIOutput()` before it can reach a reviewer. A BLOCK (empty output, or
// an injection pattern picked up off a scraped page) drops the lead. A FAIL
// drops it too — the fail conditions are PII in the text and unresolved
// {{placeholders}}, and neither belongs in a review queue governed by the
// privacy contract above. A WARN is kept: leads are already human-gated, and
// suppressing every terse summary would just empty the queue.
// ===========================================================================

import "server-only";
import OpenAI from "openai";

import { validateAIOutput, type GatewayValidationResult } from "@/lib/ai/gateway";
import { sanitizeLabel } from "./ai";
import {
  capLeads,
  leadDedupKey,
  validateLeadCandidate,
  type ParsedSourcingLead,
} from "./sourcing-policy";
import { sourcingMaxLeadsPerRun, type SourcingRunType } from "./types";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The sweep cannot run at all — currently only "no API key configured".
 *
 * Typed rather than a bare Error so the orchestrator can tell "this deployment
 * has no model access" (record it on the run row, do not retry, do not page
 * anyone) apart from "the search ran and went wrong".
 */
export class SourcingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourcingUnavailableError";
    // Keeps `instanceof` working if this ever compiles down past ES2015.
    Object.setPrototypeOf(this, SourcingUnavailableError.prototype);
  }
}

/* -------------------------------------------------------------------------- */
/* Search context                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What the desk currently needs filled. Built by the orchestrator from
 * `talent_job_orders` where status = 'open'; this module never queries.
 */
export interface CandidateSearchContext {
  openOrders: Array<{
    title: string;
    vertical: string | null;
    location: string | null;
    certRequirements: string[];
  }>;
}

/** What the desk can staff, used to find new work rather than new people. */
export interface JobOrderSearchContext {
  verticals: string[];
  certifications: string[];
  locations: string[];
}

function isCandidateContext(ctx: unknown): ctx is CandidateSearchContext {
  return (
    !!ctx && typeof ctx === "object" && Array.isArray((ctx as CandidateSearchContext).openOrders)
  );
}

function isJobOrderContext(ctx: unknown): ctx is JobOrderSearchContext {
  return !!ctx && typeof ctx === "object" && !isCandidateContext(ctx);
}

/* -------------------------------------------------------------------------- */
/* Prompt building                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The EEO instruction, verbatim, in both prompts. Exported so the orchestrator
 * can log exactly what the agent was told; pinned character-for-character by
 * sourcing.test.ts.
 */
export const sourcingProtectedAttributeClause =
  "EXCLUDE PROTECTED ATTRIBUTES: do not search for, infer, extract, record or mention age, date of birth, " +
  "gender, sex, race, ethnicity, national origin, citizenship, immigration status, religion, disability, " +
  "health or medical information, pregnancy, marital or family status, sexual orientation, veteran status, " +
  "photographs, or any other protected attribute. If a source shows any of these, ignore them completely and " +
  "never carry them into your answer.";

/** The other half of the privacy contract: where the agent may look at all. */
export const sourcingPublicSourcesClause =
  "USE ONLY PUBLIC PROFESSIONAL SOURCES: publicly posted job boards, publicly posted resumes, public " +
  "professional profiles and public company career pages. Do not use private, paywalled, login-gated or " +
  "purchased personal records. Never guess or infer a field — if something is not publicly published, return " +
  "null for it.";

/** Ceiling on how much context is interpolated into one prompt. */
const maxContextItems = 25;

/**
 * Job titles, verticals and certification names are free text a recruiter typed
 * into the database, so they are an injection surface into the prompt. Reuse the
 * talent engine's existing sanitiser: it strips control characters and template
 * braces, collapses whitespace and caps length.
 */
function labelList(values: readonly unknown[] | null | undefined, max = maxContextItems): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of Array.isArray(values) ? values : []) {
    const label = sanitizeLabel(value, 60);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= max) break;
  }
  return out;
}

function describeOrder(order: CandidateSearchContext["openOrders"][number]): string {
  const parts = [`- ${sanitizeLabel(order?.title, 80) || "EHS role"}`];
  const vertical = sanitizeLabel(order?.vertical, 60);
  if (vertical) parts.push(`vertical: ${vertical}`);
  const location = sanitizeLabel(order?.location, 60);
  if (location) parts.push(`location: ${location}`);
  const certs = labelList(order?.certRequirements, 10);
  if (certs.length > 0) parts.push(`certifications: ${certs.join(", ")}`);
  return parts.join(" | ");
}

function outputFormatClause(): string {
  return (
    `OUTPUT FORMAT: respond with a strict JSON array of at most ${sourcingMaxLeadsPerRun} objects and nothing ` +
    `else. Each object must have exactly these keys: "title", "organization", "location", "vertical", ` +
    `"certifications", "rate_signal", "source_url", "summary". Use null for any value that is not publicly ` +
    `published, and an empty array for "certifications" when none are published. No commentary, no ` +
    `explanation, no markdown code fences, and no text before or after the array. If nothing suitable is ` +
    `found, respond with [].`
  );
}

/**
 * Deterministic: the same open orders always produce byte-identical text, so a
 * run is reproducible from the row it wrote and two sweeps of an unchanged desk
 * cannot silently ask two different questions.
 */
export function buildCandidateSearchPrompt(ctx: CandidateSearchContext): string {
  const orders = (Array.isArray(ctx?.openOrders) ? ctx.openOrders : [])
    .slice(0, maxContextItems)
    .map(describeOrder);

  const orderBlock =
    orders.length > 0
      ? `OPEN ORDERS TO SOURCE AGAINST:\n${orders.join("\n")}`
      : "OPEN ORDERS TO SOURCE AGAINST: none are open right now. Source broadly for experienced EHS " +
        "professionals across the safety verticals.";

  return [
    "You are the Sourcing Agent for an EHS staffing desk. Search the public web for EHS professionals who " +
      "have publicly published that they are open to contract or permanent work.",
    orderBlock,
    [
      "COLLECT ONLY PUBLIC PROFESSIONAL INFORMATION, one object per professional:",
      '- "title": the published name or public handle, exactly as published.',
      '- "organization": the published current employer or affiliation, or null.',
      '- "location": the city and state or region as published, or null.',
      '- "vertical": the EHS vertical they publicly work in, for example Construction, Manufacturing or Oil and Gas, or null.',
      '- "certifications": the certifications they publicly claim, for example CSP, CHST, CIH, ASP, STSC or OSHA 30, as an array of strings.',
      '- "rate_signal": the published pay ask in US dollars per hour as a plain number, or null when no rate is published.',
      '- "source_url": the public URL the information came from.',
      '- "summary": one or two sentences covering the published professional title, the published work history and why this fits an open order above. Write about the role and the credentials only.',
    ].join("\n"),
    sourcingProtectedAttributeClause,
    sourcingPublicSourcesClause,
    outputFormatClause(),
  ].join("\n\n");
}

/** Same contract, pointed at public postings instead of public professionals. */
export function buildJobOrderSearchPrompt(ctx: JobOrderSearchContext): string {
  const verticals = labelList(ctx?.verticals);
  const certifications = labelList(ctx?.certifications);
  const locations = labelList(ctx?.locations);

  const scope = [
    `- Verticals: ${verticals.length > 0 ? verticals.join(", ") : "any EHS vertical"}`,
    `- Certifications this desk can staff: ${certifications.length > 0 ? certifications.join(", ") : "any EHS certification"}`,
    `- Locations: ${locations.length > 0 ? locations.join(", ") : "anywhere in the United States"}`,
  ].join("\n");

  return [
    "You are the Sourcing Agent for an EHS staffing desk. Search the public web for open contract, temporary " +
      "and consulting postings for EHS roles that this desk could staff.",
    `SEARCH SCOPE:\n${scope}`,
    [
      "COLLECT ONLY PUBLIC POSTING INFORMATION, one object per posting:",
      '- "title": the role title exactly as posted.',
      '- "organization": the hiring company, staffing firm or client as posted, or null.',
      '- "location": the posted work location, or null.',
      '- "vertical": the industry vertical of the posting, or null.',
      '- "certifications": the certifications the posting requires, as an array of strings.',
      '- "rate_signal": the published bill or contract rate in US dollars per hour as a plain number, or null when no rate is published.',
      '- "source_url": the public URL of the posting.',
      '- "summary": one or two sentences on the scope of the work and why it suits an EHS staffing desk.',
    ].join("\n"),
    sourcingProtectedAttributeClause,
    sourcingPublicSourcesClause,
    outputFormatClause(),
  ].join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Query summary                                                              */
/* -------------------------------------------------------------------------- */

function scopeFragment(label: string, values: string[]): string | null {
  return values.length > 0 ? `${label} ${values.join(", ")}` : null;
}

/**
 * The human-readable "what did this sweep actually go looking for", stored on
 * `talent_sourcing_runs.query_summary` and shown above the review queue. Short
 * enough to render in a row, specific enough that a reviewer can tell why a
 * lead turned up.
 */
export function buildSourcingQuerySummary(
  runType: SourcingRunType,
  ctx: CandidateSearchContext | JobOrderSearchContext,
): string {
  const fragments: Array<string | null> = [];
  let head: string;

  if (runType === "candidates") {
    const orders = isCandidateContext(ctx) ? ctx.openOrders : [];
    head = `Candidate web sweep against ${orders.length} open order${orders.length === 1 ? "" : "s"}`;
    fragments.push(
      scopeFragment("verticals", labelList(orders.map((order) => order?.vertical))),
      scopeFragment("locations", labelList(orders.map((order) => order?.location))),
      scopeFragment(
        "certifications",
        labelList(
          orders.flatMap((order) =>
            Array.isArray(order?.certRequirements) ? order.certRequirements : [],
          ),
        ),
      ),
    );
  } else {
    const scope = isJobOrderContext(ctx) ? ctx : { verticals: [], certifications: [], locations: [] };
    head = "Job order web sweep";
    fragments.push(
      scopeFragment("verticals", labelList(scope.verticals)),
      scopeFragment("certifications", labelList(scope.certifications)),
      scopeFragment("locations", labelList(scope.locations)),
    );
  }

  const scopeText = fragments.filter((part): part is string => Boolean(part)).join("; ");
  return sanitizeLabel(scopeText ? `${head} — ${scopeText}` : `${head} — no scope filters`, 300);
}

/* -------------------------------------------------------------------------- */
/* Gateway                                                                    */
/* -------------------------------------------------------------------------- */

export const sourcingLeadPromptKey = "talent_engine.sourcing_lead";

/**
 * One gateway verdict per lead, over the two fields that carry model prose.
 *
 * Title and summary are checked TOGETHER rather than separately on purpose:
 * `summary` is nullable on the row, and a lead with a real title and no summary
 * must not be thrown away by the gateway's empty-output check.
 */
export function validateSourcingLead(lead: ParsedSourcingLead): GatewayValidationResult {
  const text = [lead?.title, lead?.summary]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .join(" — ");

  return validateAIOutput({
    promptKey: sourcingLeadPromptKey,
    rawOutput: text,
    safetyContext: "ehs_talent_engine.web_sourcing",
  });
}

/** A gateway verdict a lead may not survive. See the AI GATEWAY note up top. */
function gatewayRejects(verdict: GatewayValidationResult): boolean {
  return verdict.status === "blocked" || verdict.status === "fail";
}

/* -------------------------------------------------------------------------- */
/* Response parsing                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every balanced `[...]` slice in `text`, in start order.
 *
 * The prompt asks for a bare JSON array, but a model with a web-search tool
 * routinely narrates ("I found 3 candidates:") or wraps the result in a code
 * fence, and prose can itself contain a bracket. So rather than trusting the
 * first `[`, collect the candidates and let the caller try to parse each in
 * turn. Bounded by `maxAttempts` so a pathological response cannot spin.
 */
function balancedArraySlices(text: string, maxAttempts = 20): string[] {
  const slices: string[] = [];

  for (let from = 0; slices.length < maxAttempts; ) {
    const start = text.indexOf("[", from);
    if (start === -1) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) slices.push(text.slice(start, end + 1));
    from = start + 1;
  }

  return slices;
}

/**
 * The model's text as an array of raw lead objects, or null if no array could be
 * recovered. Nothing here inspects the items — that is validateLeadCandidate's
 * job — so an array of garbage parses fine and is rejected downstream.
 */
export function parseLeadArray(text: string): unknown[] | null {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (trimmed === "") return null;

  const sources = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) sources.push(fence[1].trim());

  const candidates = [...sources];
  for (const source of sources) candidates.push(...balancedArraySlices(source));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not this one — try the next candidate slice.
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Dedup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * In-batch dedup on the same key the database's UNIQUE (lead_type, source_url)
 * constraint compares, so one sweep that finds a posting on two aggregator pages
 * queues it once instead of relying on an insert to fail.
 *
 * `leadType` only namespaces the key and cannot change the outcome within a
 * single-type batch, which is why the parameter is optional — `dedupeLeads(leads)`
 * is the ordinary call. A lead whose URL yields no key is DROPPED rather than
 * kept: an unusable source_url cannot be written to the row anyway.
 */
export function dedupeLeads(
  leads: ParsedSourcingLead[],
  leadType: SourcingRunType = "candidates",
): ParsedSourcingLead[] {
  const seen = new Set<string>();
  const out: ParsedSourcingLead[] = [];

  for (const lead of Array.isArray(leads) ? leads : []) {
    if (!lead) continue;
    const key = leadDedupKey(leadType, lead.source_url);
    if (key === null || seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* The sweep                                                                  */
/* -------------------------------------------------------------------------- */

export interface SourcingSearchResult {
  /** Validated, gateway-cleared, deduped and capped. Ready to insert as 'new'. */
  leads: ParsedSourcingLead[];
  /** For `talent_sourcing_runs.query_summary`. */
  querySummary: string;
  raw: {
    /** Items the model returned. Becomes `leads_found` on the run row. */
    found: number;
    /** Items thrown away as malformed or gateway-rejected. Duplicates and cap
     *  overflow are NOT counted here — those were usable, just surplus. */
    rejected: number;
  };
}

export async function searchSourcingLeads(
  runType: SourcingRunType,
  ctx: CandidateSearchContext | JobOrderSearchContext,
): Promise<SourcingSearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new SourcingUnavailableError(
      "OPENAI_API_KEY is not configured, so the Sourcing Agent cannot search the web. Add it to your " +
        "environment variables and run the sweep again.",
    );
  }

  const querySummary = buildSourcingQuerySummary(runType, ctx);
  const prompt =
    runType === "candidates"
      ? buildCandidateSearchPrompt(isCandidateContext(ctx) ? ctx : { openOrders: [] })
      : buildJobOrderSearchPrompt(
          isJobOrderContext(ctx) ? ctx : { verticals: [], certifications: [], locations: [] },
        );

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    max_output_tokens: 32000,
    input: prompt,
  });

  if (response.status === "incomplete") {
    throw new Error(
      "The sourcing sweep was cut off before it finished (the result was too long). Narrow the run — fewer " +
        "open orders, or one vertical at a time — and try again.",
    );
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const items = parseLeadArray(text);
  if (!items) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `The sourcing sweep finished but the output could not be parsed. Model returned: "${snippet}…". Please try again.`,
    );
  }

  const found = items.length;
  let rejected = 0;
  const accepted: ParsedSourcingLead[] = [];

  for (const item of items) {
    let lead: ParsedSourcingLead | null = null;
    try {
      const verdict = validateLeadCandidate(item);
      if (verdict.ok) lead = verdict.lead;
    } catch {
      // A validator that throws on a hostile shape must not take the whole
      // scheduled sweep down with it. Treat it as a rejected lead.
      lead = null;
    }

    if (!lead || gatewayRejects(validateSourcingLead(lead))) {
      rejected++;
      continue;
    }

    accepted.push(lead);
  }

  // Cap LAST. The gateway is a local pure function, so screening the whole batch
  // costs nothing, and doing it before the cap means a blocked or duplicated
  // lead cannot eat one of the reviewer's limited slots.
  const leads = capLeads(dedupeLeads(accepted, runType), sourcingMaxLeadsPerRun);

  return { leads, querySummary, raw: { found, rejected } };
}

/* -------------------------------------------------------------------------- */
/* Activity log                                                               */
/* -------------------------------------------------------------------------- */

function safeCount(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * One line for `talent_activity_log` (pass it to `buildActivityEntry` from
 * ./ai as the summary). It states plainly that nothing was created, because the
 * feed is the defensible record that the sweep gathered and a human decided.
 */
export function buildSourcingActivitySummary(
  runType: SourcingRunType,
  inserted: number,
  found: number,
): string {
  const label = runType === "job_orders" ? "job orders" : "EHS candidates";
  const foundCount = safeCount(found);
  const insertedCount = safeCount(inserted);

  return (
    `Sourcing Agent web sweep for ${label}: ${foundCount} lead${foundCount === 1 ? "" : "s"} found, ` +
    `${insertedCount} queued for human review. No candidate or job order record was created — a human ` +
    `accepts or dismisses every lead.`
  );
}
