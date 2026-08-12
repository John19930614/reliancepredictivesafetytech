// Numeric drift between the proposal's FIELDS and the proposal's PROSE.
//
// The document derives every structured number at render time — the package
// pills, the intro paragraph, the fee table — so those always agree with what
// the seller typed. What does NOT re-derive is the narrative: the executive
// summary, the assumptions/exclusions block, and the per-line scope
// descriptions are free text, stored verbatim, and they keep whatever numbers
// were written the day they were written.
//
// That is the "I set 50 users and the document still says 20 everywhere"
// report. On the Wondfo proposal, `includedUsers` was 50 while four line-item
// descriptions still read "up to 20 users" and two said "at one jobsite"
// against `includedSites` = 5. Section 02 said 50, section 03 said 20, and the
// fee table's description column said 20 — all on the same page.
//
// This module finds those contradictions deterministically. It is deliberately
// NOT the AI's job: a regex that knows what the fields say can be trusted to
// spot the mismatch every time, and the model is then asked only to rewrite the
// sentence. Findings are advisory — nothing here blocks a save, because a
// seller may have a reason to write a number the fields do not carry.

import {
  lookupPhase,
  lookupService,
  lookupPackage,
  packageData,
  defaultPackageKey,
  isNoPlatformPackageKey,
} from "./catalog";
import type { GeneratorItem, GeneratorState } from "./generator-state";
import { computeProposalTotals, formatMoney } from "./pricing";
import { parseProposalTerm } from "./term";
import { proposalTypeLabelFromState } from "./transaction-templates";

/* -------------------------------------------------------------------------- */
/* Field access — a persisted state is untrusted input                         */
/* -------------------------------------------------------------------------- */

function readField(state: GeneratorState | null | undefined, id: string): unknown {
  if (!state || typeof state !== "object") return undefined;
  const fields = (state as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  return (fields as Record<string, unknown>)[id];
}

function fieldText(state: GeneratorState | null | undefined, id: string, fallback = ""): string {
  const raw = readField(state, id);
  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  return text === "" ? fallback : text;
}

function fieldCount(state: GeneratorState | null | undefined, id: string, fallback: number): number {
  const raw = readField(state, id);
  const parsed =
    typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(parsed));
}

function readItems(value: unknown): GeneratorItem[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as GeneratorItem[]) : [];
}

/* -------------------------------------------------------------------------- */
/* The authoritative facts                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every number the document states structurally, in one object.
 *
 * This is both what the scanner checks prose against AND what the AI rewriter
 * is given as ground truth. One derivation, so the warning the seller sees and
 * the instruction the model gets can never disagree.
 */
export interface ProposalFacts {
  /**
   * True when this proposal sells NO platform subscription — a training
   * calendar, three written programs, a block of consulting hours, a monthly
   * advisory retainer. Everything a subscription implies is then absent rather
   * than zero: `users`, `sites`, `packageName` and `packagePrice` are not
   * quantities the seller left blank, they are quantities this deal does not
   * have. Consumers must branch on this rather than printing "0 users" or a
   * "$0 base subscription", which is what the AI reviewer was being told.
   */
  servicesOnly: boolean;
  /** "Training Services", "Fixed-Price Services"… or null if no type is stamped. */
  proposalTypeLabel: string | null;
  users: number;
  sites: number;
  /** Inclusive month count, or null when the term is unset/reversed. */
  termMonths: number | null;
  /** "August 2026 – December 2026", or null. */
  termRangeLabel: string | null;
  /** "" on a services-only engagement: there is no package. */
  packageName: string;
  packagePrice: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  deposit: number;
  billingTerm: string;
  paymentTerms: string;
  validDays: string;
  /**
   * The HEADLINE currency figures: base subscription, subtotal, discount, tax,
   * total, deposit. A dollar amount in the executive summary is quoting the
   * price of the deal, and one that matches none of these is quoting a price
   * the document does not offer.
   *
   * Per-line unit prices are deliberately NOT in this set. Nearly every
   * proposal carries a no-cost line, which puts 0 in the set and lets the exact
   * defect this check exists for — a summary reading "priced at $0.00" over a
   * $5,000 pilot — pass as legitimate.
   */
  moneyFigures: number[];
}

export function collectProposalFacts(state: GeneratorState | null | undefined): ProposalFacts {
  const totals = computeProposalTotals(state);
  const term = parseProposalTerm(state?.fields);

  const packageRow = totals.lineItems.find((row) => row.source === "package") ?? null;

  const moneyFigures = new Set<number>([
    packageRow?.price ?? 0,
    totals.subtotal,
    totals.discount,
    totals.tax,
    totals.total,
    totals.deposit,
  ]);
  // Discount, tax and deposit are zero on most proposals, which would put 0 in
  // the accepted set and wave through "priced at $0.00" on a $5,000 pilot —
  // the exact sentence this check was written for. Zero is only a legitimate
  // headline price when the engagement genuinely costs nothing.
  if (totals.total !== 0) moneyFigures.delete(0);

  // A services-only engagement sells no seats and no jobsites, and the document
  // prints neither (buildProposalDocumentModel zeroes them the same way). The
  // asset nonetheless leaves 50 / 2 sitting in form_data from its own field
  // defaults, so without this guard a training proposal handed the AI reviewer
  // "Included users: 50 · Included jobsites: 2" as AUTHORITATIVE FACTS — under
  // a prompt rule telling it never to introduce a number that is not in that
  // block. The reviewer was being invited to write seats into a class roster.
  //
  // READ FROM THE STATE, NOT FROM THE ROW. buildPackageLine() returns null for a
  // services engagement — the row is omitted rather than priced at zero — so
  // `packageRow?.key ?? ""` asked isNoPlatformPackageKey("") and got false, and
  // this guard never once fired on the proposals it was written for.
  const selectedPackageKey = fieldText(state, "packageSelect", defaultPackageKey);
  const servicesOnly = isNoPlatformPackageKey(packageRow?.key ?? selectedPackageKey);
  // Null rather than a package on a services deal: lookupPackage("") used to
  // fall through to the default package and report "Platform Services" as the
  // base subscription of a training proposal.
  const packageOption = servicesOnly
    ? null
    : lookupPackage(packageRow?.key ?? selectedPackageKey) ?? packageData[defaultPackageKey];

  const proposalTypeLabel = proposalTypeLabelFromState(state?.fields);

  return {
    servicesOnly,
    proposalTypeLabel,
    users: packageOption ? fieldCount(state, "includedUsers", packageOption.users) : 0,
    sites: packageOption ? fieldCount(state, "includedSites", packageOption.sites) : 0,
    termMonths: term.months,
    termRangeLabel: term.rangeLabel,
    packageName: packageOption?.name ?? "",
    packagePrice: packageRow?.price ?? 0,
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total,
    deposit: totals.deposit,
    // "One-time (pilot)" is the asset's selected <option>, so it is what an
    // untyped proposal showed and must keep showing. On a typed proposal it is
    // a different deal's billing cadence, and handing it to the AI as an
    // AUTHORITATIVE FACT invited the reviewer to write "pilot" into a training
    // document. Same rule as documentTermDefaults.billingTerm.
    billingTerm: fieldText(state, "billingTerm", proposalTypeLabel ? "" : "One-time (pilot)"),
    paymentTerms: fieldText(state, "paymentTerms", "Net 30 from invoice date"),
    validDays: fieldText(state, "validDays", "60"),
    moneyFigures: [...moneyFigures],
  };
}

/* -------------------------------------------------------------------------- */
/* Narrative regions — the free text the document prints verbatim              */
/* -------------------------------------------------------------------------- */

export type NarrativeRegionKind = "field" | "phase" | "service";

export interface NarrativeRegion {
  /** Stable address: "field:customSummary", "phase:0", "service:2". */
  id: string;
  kind: NarrativeRegionKind;
  /** For fields, the generator field id. For items, the array index as a string. */
  target: string;
  /** Human label for the editor panel, e.g. "Phase 1: Discovery & Intake". */
  label: string;
  /** The text exactly as the document renders it (catalog fallback applied). */
  text: string;
  /** True when `text` is still the untouched catalog boilerplate for this key. */
  isCatalogDefault: boolean;
  /** Catalog key of the line item; "" for field regions. */
  key: string;
}

/** The two free-text fields, in document order. */
export const narrativeFieldIds = Object.freeze(["customSummary", "customExclusions"] as const);

const narrativeFieldLabels: Record<string, string> = {
  customSummary: "Executive summary",
  customExclusions: "Assumptions & exclusions",
};

/**
 * Every region of the document whose text is stored rather than derived.
 *
 * Item descriptions are resolved through the catalog exactly as
 * pricing.buildItemLine() does, because a row that stored only a key still
 * PRINTS the catalog sentence — and if that sentence carries a count, the
 * client reads it as this proposal's count.
 */
export function collectNarrativeRegions(state: GeneratorState | null | undefined): NarrativeRegion[] {
  const regions: NarrativeRegion[] = [];

  for (const fieldId of narrativeFieldIds) {
    const text = fieldText(state, fieldId);
    if (text === "") continue;
    regions.push({
      id: `field:${fieldId}`,
      kind: "field",
      target: fieldId,
      label: narrativeFieldLabels[fieldId] ?? fieldId,
      text,
      isCatalogDefault: false,
      key: "",
    });
  }

  readItems(state?.phases).forEach((item, index) => {
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const option = lookupPhase(key);
    const name = (typeof item.name === "string" && item.name.trim()) || option?.name || `Phase ${index + 1}`;
    const desc = (typeof item.desc === "string" && item.desc.trim()) || option?.desc || "";
    if (desc === "") return;
    regions.push({
      id: `phase:${index}`,
      kind: "phase",
      target: String(index),
      label: `Phase ${index + 1}: ${name}`,
      text: desc,
      isCatalogDefault: option?.desc === desc,
      key,
    });
  });

  readItems(state?.services).forEach((item, index) => {
    const key = typeof item.key === "string" ? item.key.trim() : "";
    const option = lookupService(key);
    const name = (typeof item.name === "string" && item.name.trim()) || option?.name || `Service line ${index + 1}`;
    const desc = (typeof item.desc === "string" && item.desc.trim()) || option?.desc || "";
    if (desc === "") return;
    regions.push({
      id: `service:${index}`,
      kind: "service",
      target: String(index),
      label: `Service line ${index + 1}: ${name}`,
      text: desc,
      isCatalogDefault: option?.desc === desc,
      key,
    });
  });

  return regions;
}

/* -------------------------------------------------------------------------- */
/* Counting words                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Written-out numbers matter here more than digits. The Wondfo summary says
 * "five jobsites" and a line says "at one jobsite" — a digits-only scan reads
 * both as clean and the client still gets the wrong number.
 */
const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

const tensWords: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Longest-first so "twenty" cannot win the match against "twenty-five".
const wordAlternation = [
  ...Object.keys(tensWords).flatMap((tens) =>
    Object.keys(numberWords)
      .filter((unit) => numberWords[unit] >= 1 && numberWords[unit] <= 9)
      .map((unit) => `${tens}[-\\s]${unit}`),
  ),
  ...Object.keys(numberWords),
].sort((a, b) => b.length - a.length).join("|");

/** A digit run (with thousands separators) or a written-out number. */
const countToken = `\\d[\\d,]*|${wordAlternation}`;

/** Parses either form to a number, or null when the token is not a count. */
export function parseCountToken(token: string): number | null {
  const clean = token.trim().toLowerCase();
  if (clean === "") return null;

  if (/^\d[\d,]*$/.test(clean)) {
    const parsed = Number(clean.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const compound = /^([a-z]+)[-\s]([a-z]+)$/.exec(clean);
  if (compound && tensWords[compound[1]] !== undefined && numberWords[compound[2]] !== undefined) {
    return tensWords[compound[1]] + numberWords[compound[2]];
  }

  return numberWords[clean] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                    */
/* -------------------------------------------------------------------------- */

export type ConsistencyTopic = "users" | "sites" | "term_months" | "money";

export interface ConsistencyFinding {
  /** Which narrative region the phrase sits in. */
  regionId: string;
  regionLabel: string;
  topic: ConsistencyTopic;
  /** The matched phrase, e.g. "up to 20 users". */
  quote: string;
  /** What the prose claims. */
  claimed: number;
  /** What the proposal's own fields say. */
  expected: number;
  /** One sentence, ready to render in the editor panel. */
  message: string;
}

interface TopicRule {
  topic: Exclude<ConsistencyTopic, "money">;
  pattern: RegExp;
  noun: string;
  fieldLabel: string;
  /** Service/phase keys whose text is about increments, not the included total. */
  exemptKeys: readonly string[];
}

/**
 * `(?:up to |as many as )?` is captured into the quote so the panel shows the
 * phrase as it reads on the page rather than two bare words.
 */
function buildRules(): TopicRule[] {
  return [
    {
      topic: "users",
      pattern: new RegExp(
        `\\b((?:up\\s+to\\s+|as\\s+many\\s+as\\s+)?(?:${countToken})\\s+(?:additional\\s+|named\\s+|licensed\\s+|active\\s+|platform\\s+)?(?:users?|seats?|user\\s+seats?|user\\s+accounts?))\\b`,
        "gi",
      ),
      noun: "users",
      fieldLabel: "Included Users",
      // "Additional User Block (25)" quotes a block size on purpose.
      exemptKeys: ["extraUsers", "perUser"],
    },
    {
      topic: "sites",
      pattern: new RegExp(
        `\\b((?:up\\s+to\\s+|as\\s+many\\s+as\\s+)?(?:${countToken})\\s+(?:additional\\s+)?(?:jobsites?|job\\s+sites?|worksites?|work\\s+sites?|sites?|locations?))\\b`,
        "gi",
      ),
      noun: "jobsites",
      fieldLabel: "Included Jobsites",
      exemptKeys: ["extraSites"],
    },
    {
      topic: "term_months",
      pattern: new RegExp(`\\b((?:${countToken})[-\\s]month)\\b`, "gi"),
      noun: "months",
      fieldLabel: "the Engagement Term",
      exemptKeys: [],
    },
  ];
}

/**
 * The count the rule is checking against, or null when it is not knowable.
 *
 * Seats and jobsites are not knowable on a services-only engagement: there is
 * no Included Users field in play, so the answer is "this deal has none", not
 * "this deal has zero". Comparing prose against 0 there turns every ordinary
 * sentence into a finding — a training proposal saying sessions run "at three
 * locations" was flagged as contradicting an Included Jobsites count that the
 * document does not print and the seller never set. The term rule still
 * applies: a services engagement can absolutely have dates.
 */
function expectedFor(topic: TopicRule["topic"], facts: ProposalFacts): number | null {
  if (topic === "users") return facts.servicesOnly ? null : facts.users;
  if (topic === "sites") return facts.servicesOnly ? null : facts.sites;
  return facts.termMonths;
}

/** Leading token of a match, so "up to 20 users" yields 20. */
function firstCountIn(phrase: string): number | null {
  const match = new RegExp(`(${countToken})`, "i").exec(phrase.replace(/^\s*(?:up\s+to|as\s+many\s+as)\s+/i, ""));
  return match ? parseCountToken(match[1]) : null;
}

const moneyPattern = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g;

/** Cent-level equality, so 5000 and 5000.00 are the same figure. */
function sameMoney(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Scans every narrative region for numbers that contradict the fields.
 *
 * Skips regions still carrying untouched catalog boilerplate: those sentences
 * are the price book's, not this proposal's, and flagging "Adds 25 additional
 * user seats" on a 50-user proposal would be noise the seller learns to ignore.
 *
 * Money is checked only in the two narrative FIELDS. A line description
 * quoting a rate ("billed at $1,250 per day") is normal and belongs to its own
 * row; a dollar figure in the executive summary is claiming a headline price,
 * and one the fee table does not contain is the "$0.00" defect.
 */
export function scanProposalConsistency(state: GeneratorState | null | undefined): ConsistencyFinding[] {
  const facts = collectProposalFacts(state);
  const regions = collectNarrativeRegions(state);
  const rules = buildRules();
  const findings: ConsistencyFinding[] = [];

  for (const region of regions) {
    if (region.isCatalogDefault) continue;

    for (const rule of rules) {
      if (rule.exemptKeys.includes(region.key)) continue;
      const expected = expectedFor(rule.topic, facts);
      if (expected === null) continue;

      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(region.text)) !== null) {
        const quote = match[1];
        const claimed = firstCountIn(quote);
        if (claimed === null || claimed === expected) continue;
        findings.push({
          regionId: region.id,
          regionLabel: region.label,
          topic: rule.topic,
          quote: quote.trim(),
          claimed,
          expected,
          message:
            rule.topic === "term_months"
              ? `Says “${quote.trim()}” but the Engagement Term is ${expected} months.`
              : `Says “${quote.trim()}” but ${rule.fieldLabel} is ${expected}.`,
        });
      }
    }

    if (region.kind !== "field") continue;

    moneyPattern.lastIndex = 0;
    let money: RegExpExecArray | null;
    while ((money = moneyPattern.exec(region.text)) !== null) {
      const claimed = Number(money[1].replace(/,/g, ""));
      if (!Number.isFinite(claimed)) continue;
      if (facts.moneyFigures.some((figure) => sameMoney(figure, claimed))) continue;
      findings.push({
        regionId: region.id,
        regionLabel: region.label,
        topic: "money",
        quote: money[0].trim(),
        claimed,
        expected: facts.total,
        // There is no base subscription to cite on a services engagement, and
        // naming one at $0.00 in the warning made the seller hunt for a line
        // the document does not contain.
        message: facts.servicesOnly
          ? `Quotes ${money[0].trim()}, which is not on the pricing schedule — the total is ${formatMoney(facts.total)}.`
          : `Quotes ${money[0].trim()}, which is not on the pricing schedule — ` +
            `the total is ${formatMoney(facts.total)} and the base subscription is ${formatMoney(facts.packagePrice)}.`,
      });
    }
  }

  return findings;
}

/** Regions that carry at least one finding, in document order. */
export function regionsWithFindings(
  regions: readonly NarrativeRegion[],
  findings: readonly ConsistencyFinding[],
): NarrativeRegion[] {
  const flagged = new Set(findings.map((finding) => finding.regionId));
  return regions.filter((region) => flagged.has(region.id));
}
