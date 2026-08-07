// Pure rules for the EHS Talent Engine's web sourcing sweep: the lead review
// graph, URL normalisation and the dedup key built from it, runtime validation
// of one AI-emitted lead, the per-run cap and the staleness window.
//
// This file imports nothing but ./types on purpose. It sits between an AI
// agent's output and the database, so it must be trivially unit-testable and
// carry no Supabase, Next.js or React dependency — lib/talent-engine/sourcing.ts
// (the search + extraction layer) and the server actions both code against it.
//
// The governing rule, from CLAUDE.md's Human Authority Rule: nothing here
// promotes a lead. `canTransitionLead` says whether a HUMAN's decision is legal;
// `validateLeadCandidate` says whether a lead is even fit to be shown to that
// human. Neither is a substitute for the review itself.

import {
  maxHourlyRate,
  minHourlyRate,
  sourcingLeadStaleDays,
  sourcingLeadStatuses,
  sourcingMaxLeadsPerRun,
  sourcingRunTypes,
  type SourcingLeadRow,
  type SourcingLeadStatus,
  type SourcingRunType,
} from "./types";

/**
 * Structurally identical to the `GateResult` in ./policy. It is redeclared
 * rather than imported so this module's only dependency stays ./types; TypeScript
 * is structural, so the two are interchangeable at every call site.
 */
export interface GateResult {
  ok: boolean;
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Lead review graph                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Allowed lead transitions. Anything not listed is rejected.
 *
 *   new       — waiting for a human. Can go either way.
 *   accepted  — TERMINAL. Accepting is the act that created a talent_candidates
 *               or talent_job_orders row and stamped created_record_id; letting
 *               the lead move again would leave the queue disagreeing with the
 *               record it produced. The way to undo an acceptance is to work on
 *               that record (or delete it), not to rewind the lead.
 *   dismissed — may go back to `new`. A human dismissed it, so a human may
 *               resurrect it; the sweep itself cannot, because the dedup key
 *               makes a re-found lead a no-op rather than a fresh row.
 */
export const sourcingLeadTransitions: Record<SourcingLeadStatus, readonly SourcingLeadStatus[]> = {
  new: ["accepted", "dismissed"],
  accepted: [],
  dismissed: ["new"],
};

function isSourcingLeadStatus(value: unknown): value is SourcingLeadStatus {
  return sourcingLeadStatuses.includes(value as SourcingLeadStatus);
}

function isSourcingRunType(value: unknown): value is SourcingRunType {
  return sourcingRunTypes.includes(value as SourcingRunType);
}

export function canTransitionLead(from: SourcingLeadStatus, to: SourcingLeadStatus): GateResult {
  if (!isSourcingLeadStatus(from) || !isSourcingLeadStatus(to)) {
    return { ok: false, reason: "That is not a sourcing lead status." };
  }
  if (from === to) return { ok: false, reason: "The lead is already in that status." };
  if (sourcingLeadTransitions[from].length === 0) {
    return { ok: false, reason: `A lead that is already ${from} is final and cannot change status.` };
  }
  if (!sourcingLeadTransitions[from].includes(to)) {
    return { ok: false, reason: `A ${from} lead cannot move to ${to}.` };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Source URL normalisation — the dedup key                                   */
/* -------------------------------------------------------------------------- */

/**
 * Upper bound on a stored source_url.
 *
 * This is not cosmetic. `talent_sourcing_leads` carries a UNIQUE constraint on
 * (lead_type, source_url), which Postgres backs with a btree index, and a btree
 * entry over roughly 2700 bytes fails at INSERT time. Rejecting the URL here
 * turns a runtime database error on a scraped page into a lead that is simply
 * not surfaced.
 */
export const maxSourceUrlLength = 2000;

/**
 * Canonical form of a lead's public source URL, or null if it is not a usable
 * one. This backs the dedup key, so it has to be deterministic: the same page
 * found on Tuesday and again on Friday must produce byte-identical output.
 *
 * Normalisation applied:
 *   * surrounding whitespace trimmed;
 *   * scheme must be http or https — a `javascript:`, `data:`, `file:` or
 *     `mailto:` "source" is not a public web page and is refused outright;
 *   * host lowercased (the URL parser does this, we assert it anyway);
 *   * fragment dropped — `#results` addresses a scroll position, not a page;
 *   * every `utm_*` parameter dropped, case-insensitively. This is the one that
 *     matters: search results routinely carry a fresh campaign tail on each
 *     fetch, so without stripping them the unique constraint would let the same
 *     job posting into the review queue over and over.
 *
 * Remaining query parameters are KEPT and left in their original order — on a
 * job board `?id=12345` is the posting, and reordering or dropping it would
 * collapse unrelated leads onto one key.
 */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;

  const trimmed = url.trim();
  if (trimmed === "" || trimmed.length > maxSourceUrlLength) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.hostname === "") return null;

  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
  }
  // Reassigning the serialised query drops a now-empty "?" as well, so
  // `https://x.test/a?utm_source=y` and `https://x.test/a` land on one key.
  parsed.search = parsed.searchParams.toString();

  const normalized = parsed.toString();
  return normalized.length > maxSourceUrlLength ? null : normalized;
}

/**
 * The value the (lead_type, source_url) unique constraint compares, as one
 * string the caller can hold in a Set while de-duplicating a run in memory —
 * before the database ever sees it. Null when either half is unusable.
 *
 * lead_type is part of the key because one page can legitimately be both: a
 * consultancy's staff listing is a candidate source, and its careers page is a
 * job-order source.
 */
export function leadDedupKey(
  leadType: SourcingRunType,
  sourceUrl: string | null | undefined,
): string | null {
  if (!isSourcingRunType(leadType)) return null;
  const normalized = normalizeSourceUrl(sourceUrl);
  return normalized === null ? null : `${leadType}:${normalized}`;
}

/* -------------------------------------------------------------------------- */
/* AI lead validation                                                         */
/* -------------------------------------------------------------------------- */

/** Field-length ceilings, matching the review UI and keeping a run bounded. */
export const maxLeadTitleLength = 200;
export const maxLeadFieldLength = 160;
export const maxLeadSummaryLength = 500;
export const maxLeadCertificationLength = 80;
export const maxLeadCertifications = 10;

/**
 * The subset of SourcingLeadRow an AI sweep actually produces. Everything else
 * on the row — id, run_id, lead_type, status, the review stamps,
 * created_record_id, created_at — is set by the orchestrator or by a human, and
 * is deliberately outside anything the model can influence.
 */
export type ParsedSourcingLead = Pick<
  SourcingLeadRow,
  | "title"
  | "organization"
  | "location"
  | "vertical"
  | "certifications"
  | "rate_signal"
  | "source_url"
  | "summary"
>;

export type LeadValidationResult =
  | { ok: true; lead: ParsedSourcingLead }
  | { ok: false; reason: string };

/**
 * Trimmed text, or null when absent/blank. Rejects a non-string and anything
 * over `max` rather than silently truncating: a 4 KB "location" means the model
 * put something else in that field, and quietly storing the first 160 characters
 * of it would hide that.
 */
function optionalText(
  value: unknown,
  max: number,
  field: string,
): { ok: true; value: string | null } | { ok: false; reason: string } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, reason: `Lead ${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, reason: `Lead ${field} is longer than ${max} characters.` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Runtime gate over ONE lead as emitted by the model. Returns the row-shaped
 * value to insert, or the reason it was thrown away.
 *
 * Everything is checked rather than trusted, because the input crossed the
 * network from a language model reading pages we do not control — the same
 * posture as requiresHumanApproval() in ./policy. A field that is missing,
 * blank, or of the wrong type is either normalised to null (the optional text
 * fields) or fatal (title, source_url); nothing is coerced. In particular
 * `rate_signal` accepts a number and only a number: a quoted "85" is a
 * malformed model response, and silently parsing it would hide the fault while
 * putting a number the model never really committed to in front of a reviewer.
 *
 * `source_url` comes back NORMALISED, so the caller's dedup set and the row it
 * writes agree with the database's unique constraint.
 */
export function validateLeadCandidate(raw: unknown): LeadValidationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "Lead is not an object." };
  }

  const row = raw as Record<string, unknown>;

  // --- title: the one thing a reviewer cannot review without ---------------
  if (typeof row.title !== "string") return { ok: false, reason: "Lead title is required." };
  const title = row.title.trim();
  if (title === "") return { ok: false, reason: "Lead title is required." };
  if (title.length > maxLeadTitleLength) {
    return { ok: false, reason: `Lead title is longer than ${maxLeadTitleLength} characters.` };
  }

  // --- source_url: no verifiable source, no lead ---------------------------
  const sourceUrl = normalizeSourceUrl(row.source_url as string | null | undefined);
  if (sourceUrl === null) {
    return { ok: false, reason: "Lead source URL is missing or is not a public http(s) address." };
  }

  // --- free-text fields ----------------------------------------------------
  const organization = optionalText(row.organization, maxLeadFieldLength, "organization");
  if (!organization.ok) return organization;
  const location = optionalText(row.location, maxLeadFieldLength, "location");
  if (!location.ok) return location;
  const vertical = optionalText(row.vertical, maxLeadFieldLength, "vertical");
  if (!vertical.ok) return vertical;
  const summary = optionalText(row.summary, maxLeadSummaryLength, "summary");
  if (!summary.ok) return summary;

  // --- certifications ------------------------------------------------------
  let certifications: string[] = [];
  const rawCerts = row.certifications;
  if (rawCerts !== null && rawCerts !== undefined) {
    if (!Array.isArray(rawCerts)) {
      return { ok: false, reason: "Lead certifications must be a list." };
    }
    if (rawCerts.length > maxLeadCertifications) {
      return {
        ok: false,
        reason: `Lead lists more than ${maxLeadCertifications} certifications.`,
      };
    }
    for (const entry of rawCerts) {
      if (typeof entry !== "string") {
        return { ok: false, reason: "Lead certifications must all be text." };
      }
      const cert = entry.trim();
      if (cert === "") continue;
      if (cert.length > maxLeadCertificationLength) {
        return {
          ok: false,
          reason: `A lead certification is longer than ${maxLeadCertificationLength} characters.`,
        };
      }
      certifications.push(cert);
    }
  }
  certifications = certifications.slice(0, maxLeadCertifications);

  // --- rate_signal ---------------------------------------------------------
  // Bounded by the same minHourlyRate/maxHourlyRate the rest of the money layer
  // uses, and rounded to the numeric(10,2) the column stores.
  let rateSignal: number | null = null;
  const rawRate = row.rate_signal;
  if (rawRate !== null && rawRate !== undefined) {
    if (typeof rawRate !== "number" || !Number.isFinite(rawRate)) {
      return { ok: false, reason: "Lead rate signal must be a number." };
    }
    if (rawRate <= minHourlyRate || rawRate > maxHourlyRate) {
      return {
        ok: false,
        reason: `Lead rate signal must be between ${minHourlyRate} and ${maxHourlyRate} per hour.`,
      };
    }
    rateSignal = Math.round(rawRate * 100) / 100;
  }

  return {
    ok: true,
    lead: {
      title,
      organization: organization.value,
      location: location.value,
      vertical: vertical.value,
      certifications,
      rate_signal: rateSignal,
      source_url: sourceUrl,
      summary: summary.value,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Run limits                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Hard ceiling on what one sweep may add to the review queue. A runaway search
 * — a broad query, a paginated board, a model that will not stop enumerating —
 * must not put 400 rows in front of a human, because a queue nobody can finish
 * is a queue nobody reads, and that is how leads start getting rubber-stamped.
 *
 * A non-array or an unusable `max` falls back rather than throwing: this is the
 * last thing between a sweep and the database, and it fails closed.
 */
export function capLeads<T>(leads: T[], max: number = sourcingMaxLeadsPerRun): T[] {
  if (!Array.isArray(leads)) return [];
  const limit =
    typeof max === "number" && Number.isFinite(max)
      ? Math.max(0, Math.floor(max))
      : sourcingMaxLeadsPerRun;
  return leads.slice(0, limit);
}

/**
 * True when a lead has been sitting in the queue longer than the staleness
 * window. Purely a UI signal — the review UI badges these so an untouched lead
 * does not age out of sight — and it never changes a lead's status on its own.
 *
 * An unparseable or missing timestamp returns FALSE, matching certExpiringSoon()
 * in ./policy: a badge that fires on rows we cannot date teaches the reviewer to
 * ignore the badge.
 */
export function isStaleLead(
  createdAt: string,
  now: Date,
  days: number = sourcingLeadStaleDays,
): boolean {
  if (typeof createdAt !== "string" || createdAt.trim() === "") return false;

  const trimmed = createdAt.trim();
  const created = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed,
  );
  if (Number.isNaN(created)) return false;

  const reference = now instanceof Date ? now.getTime() : Date.parse(String(now));
  if (Number.isNaN(reference)) return false;

  const staleDays = Number.isFinite(days) ? Math.max(0, days) : sourcingLeadStaleDays;
  return created <= reference - staleDays * 24 * 60 * 60 * 1000;
}
