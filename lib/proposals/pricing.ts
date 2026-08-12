// Proposal pricing math — pure functions, no DOM, no I/O, no module state.
//
// Ported from the inline script in assets/proposal-generator-v15.html:
//   * computeDocumentPrice()   <- computeDoc()
//   * computeProposalTotals()  <- the rows/subtotal/discount/tax/total/deposit
//                                 chain inside update()
//
// The generator computes its numbers in the DOM and never persists them, so
// `client_proposals.proposal_value` drifts from what the client-facing document
// actually says. computeProposalTotals() exists so the SERVER can recompute the
// total authoritatively from the saved form state instead of trusting a number
// posted by the browser. It therefore reads nothing outside its argument, and
// coerces every value it does read — a persisted state is untrusted input.

import type { GeneratorItem, GeneratorState } from "./generator-state";
import {
  defaultPackageKey,
  isNoPlatformPackageKey,
  lookupPackage,
  lookupPhase,
  lookupService,
  packageData,
} from "./catalog";
import { parseProposalTerm } from "./term";

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Number coercion that can never yield NaN or Infinity.
 *
 * Mirrors the asset's `Number(el.value || fallback)` for the cases that matter,
 * with two deliberate differences: a non-numeric string falls back instead of
 * producing NaN, and a numeric `0` is kept rather than treated as falsy (form
 * fields hand us the string "0", which is truthy, but a state round-tripped
 * through JSON may hold the number 0).
 */
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Clamps to a sane range so malformed state cannot invert a total. */
function clamp(value: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Rounds to whole cents. Non-finite input (overflow) collapses to 0. */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

/** Checkbox fields serialize as booleans, but tolerate string encodings. */
function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "on" || v === "yes" || v === "1";
  }
  return false;
}

function readField(state: GeneratorState | null | undefined, id: string): unknown {
  if (!state || typeof state !== "object") return undefined;
  const fields = (state as { fields?: unknown }).fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return undefined;
  return (fields as Record<string, unknown>)[id];
}

function fieldNumber(state: GeneratorState | null | undefined, id: string, fallback: number): number {
  return toNumber(readField(state, id), fallback);
}

/** Non-empty trimmed label, else the asset's default (`el.value || 'Medium'`). */
function fieldLabel(value: unknown, fallback: string): string {
  const text = toText(value).trim();
  return text === "" ? fallback : text;
}

function readItems(value: unknown): GeneratorItem[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as GeneratorItem[]) : [];
}

/** Currency formatting identical to the asset's `money()` helper. */
export function formatMoney(value: unknown): string {
  const v = toNumber(value, 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/* -------------------------------------------------------------------------- */
/* Safety document pricing (asset: computeDoc)                                 */
/* -------------------------------------------------------------------------- */

export type DocumentBandName = "Short" | "Medium" | "Long";

/**
 * Page bands, in evaluation order. `maxPages` is inclusive: 35 pages is still
 * Short, 36 is Medium; 60 is still Medium, 61 is Long.
 */
export const documentPageBands = Object.freeze([
  Object.freeze({ band: "Short" as const, maxPages: 35, base: 450 }),
  Object.freeze({ band: "Medium" as const, maxPages: 60, base: 900 }),
  Object.freeze({ band: "Long" as const, maxPages: Number.POSITIVE_INFINITY, base: 1600 }),
]);

export const documentComplexityMultipliers = Object.freeze({ Low: 1, Medium: 1.2, High: 1.5 });
export const documentReviewFees = Object.freeze({ Basic: 0, Standard: 375, Premium: 1000 });
export const documentCustomizationRates = Object.freeze({ None: 0, Light: 0.15, Moderate: 0.3, Heavy: 0.6 });
export const documentRushMultiplier = 1.25;

/** Defaults the asset falls back to when a control is missing or blank. */
export const documentPricingDefaults = Object.freeze({
  complexity: "Medium",
  review: "Standard",
  customization: "None",
});

export interface DocumentPricingInput {
  /** Page count. Coerced to a finite number and floored at 0. */
  pages?: unknown;
  /** "Low" | "Medium" | "High"; anything else scores a ×1 multiplier. */
  complexity?: unknown;
  /** "Basic" | "Standard" | "Premium"; anything else adds no review fee. */
  review?: unknown;
  /** "None" | "Light" | "Moderate" | "Heavy"; anything else adds no uplift. */
  customization?: unknown;
  /** Rush delivery: +25% applied last. */
  rush?: unknown;
}

export interface DocumentPricingResult {
  /** Final price in whole dollars (the asset rounds with Math.round). */
  price: number;
  /** Line-item name the asset writes onto the generated service row. */
  name: string;
  /** Line-item description, showing the full derivation. */
  desc: string;
  pages: number;
  band: DocumentBandName;
  bandBase: number;
  complexity: string;
  complexityMultiplier: number;
  review: string;
  reviewFee: number;
  customization: string;
  customizationRate: number;
  rush: boolean;
}

/**
 * page band -> complexity multiplier -> review fee -> customization % -> rush.
 *
 *   adj      = bandBase × complexityMultiplier
 *   custCost = adj × customizationRate
 *   price    = round((adj + reviewFee + custCost) × (rush ? 1.25 : 1))
 *
 * Note the review fee is NOT multiplied by complexity, and the customization
 * percentage applies to the complexity-adjusted base only — not to the review
 * fee. Rush multiplies everything.
 *
 * DEVIATION from the asset: a non-numeric page count (e.g. "forty") yields NaN
 * there, and because `NaN <= 35` and `NaN <= 60` are both false it silently
 * lands in the most expensive Long band. Here it coerces to 0 pages / Short.
 */
export function computeDocumentPrice(input: DocumentPricingInput = {}): DocumentPricingResult {
  const pages = Math.max(0, toNumber(input.pages, 0));
  const complexity = fieldLabel(input.complexity, documentPricingDefaults.complexity);
  const review = fieldLabel(input.review, documentPricingDefaults.review);
  const customization = fieldLabel(input.customization, documentPricingDefaults.customization);
  const rush = toBoolean(input.rush);

  const bandSpec = documentPageBands.find((b) => pages <= b.maxPages) ?? documentPageBands[documentPageBands.length - 1];
  const bandBase = bandSpec.base;
  const band = bandSpec.band;

  const complexityMultiplier = readRate(documentComplexityMultipliers, complexity, 1);
  const reviewFee = readRate(documentReviewFees, review, 0);
  const customizationRate = readRate(documentCustomizationRates, customization, 0);

  const adj = bandBase * complexityMultiplier;
  const custCost = adj * customizationRate;
  let price = adj + reviewFee + custCost;
  if (rush) price *= documentRushMultiplier;
  price = Math.round(price);
  if (!Number.isFinite(price)) price = 0;

  const name = `Safety Document — ${pages} pg (${band}) · ${complexity} · ${review} review`;
  const desc =
    `Safety document / program. ${pages} pages (${band} band, base ${formatMoney(bandBase)}); ` +
    `complexity ${complexity} (×${complexityMultiplier}); ` +
    `${review} review package${reviewFee ? ` (+${formatMoney(reviewFee)})` : ""}; ` +
    `${customization} customization${customizationRate ? ` (+${Math.round(customizationRate * 100)}%)` : ""}` +
    `${rush ? "; rush delivery (+25%)" : ""}.`;

  return {
    price,
    name,
    desc,
    pages,
    band,
    bandBase,
    complexity,
    complexityMultiplier,
    review,
    reviewFee,
    customization,
    customizationRate,
    rush,
  };
}

function readRate(table: Readonly<Record<string, number>>, key: string, fallback: number): number {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : fallback;
}

/** computeDocumentPrice() driven by the generator's Safety Document controls. */
export function computeDocumentPriceFromState(state: GeneratorState | null | undefined): DocumentPricingResult {
  return computeDocumentPrice({
    pages: readField(state, "docPages"),
    complexity: readField(state, "docComplexity"),
    review: readField(state, "docReview"),
    customization: readField(state, "docCustom"),
    rush: readField(state, "docRush"),
  });
}

/* -------------------------------------------------------------------------- */
/* Proposal totals (asset: the rows/subtotal/... chain in update())            */
/* -------------------------------------------------------------------------- */

export type ProposalLineSource = "package" | "phase" | "service";

export interface ProposalLineItem {
  /** Which section of the generator produced this row. */
  source: ProposalLineSource;
  /** Catalog key (package/phase/service). Empty when the row has none. */
  key: string;
  name: string;
  desc: string;
  qty: number;
  price: number;
  /** qty × price, rounded to cents. */
  amount: number;
}

export interface ProposalTotals {
  /** Fee-table rows in document order: package first, then phases, then services. */
  lineItems: ProposalLineItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  /** Deposit due at acceptance — a percentage of `total`, not of `subtotal`. */
  deposit: number;
}

/**
 * Recomputes the whole fee table from a saved generator state.
 *
 *   subtotal = Σ(qty × price) over every row, including the package row
 *   discount = subtotal × discountPct/100
 *   taxable  = subtotal − discount
 *   tax      = taxable × taxPct/100        (tax applies AFTER the discount)
 *   total    = taxable + tax
 *   deposit  = total × depositPct/100
 *
 * Reads only from `state`. Malformed values are coerced, never trusted:
 * percentages are clamped (discount/deposit to 0–100, tax to ≥ 0) and qty/price
 * to ≥ 0, so a hand-edited payload cannot produce a negative or NaN total. The
 * asset does none of that clamping — it would happily render a negative total
 * from a 150% discount.
 *
 * Each returned figure is rounded to cents independently, which is exactly what
 * the client-facing document shows (its `money()` formatter caps at 2 dp). In
 * rare half-cent cases `total` may therefore differ from
 * `subtotal − discount + tax` by a cent; the printed document has the same
 * property, and matching it is the point.
 *
 * A state with no fields still yields the generator's default package row (its
 * preselected package at the catalog price) because that is what the generator
 * renders for a blank form. Callers persisting `proposal_value` should skip
 * proposals that have no saved state at all rather than storing that default.
 */
export function computeProposalTotals(state: GeneratorState | null | undefined): ProposalTotals {
  // `null` when the proposal carries no platform subscription at all: the row
  // is OMITTED rather than priced at zero, so a training or fixed-price
  // document does not print a "Platform Services" line the client never bought.
  const packageLine = buildPackageLine(state);
  const lineItems: ProposalLineItem[] = packageLine ? [packageLine] : [];

  for (const item of readItems(state?.phases)) {
    lineItems.push(buildItemLine(item, "phase"));
  }
  for (const item of readItems(state?.services)) {
    lineItems.push(buildItemLine(item, "service"));
  }

  const subtotalRaw = lineItems.reduce((sum, row) => sum + row.qty * row.price, 0);
  const discountPct = clamp(fieldNumber(state, "discountPct", 0), 0, 100);
  const taxPct = clamp(fieldNumber(state, "taxPct", 0), 0);
  const depositPct = clamp(fieldNumber(state, "depositPct", 0), 0, 100);

  const discountRaw = subtotalRaw * (discountPct / 100);
  const taxableRaw = subtotalRaw - discountRaw;
  const taxRaw = taxableRaw * (taxPct / 100);
  const totalRaw = taxableRaw + taxRaw;
  const depositRaw = totalRaw * (depositPct / 100);

  return {
    lineItems,
    subtotal: roundCents(subtotalRaw),
    discount: roundCents(discountRaw),
    tax: roundCents(taxRaw),
    total: roundCents(totalRaw),
    deposit: roundCents(depositRaw),
  };
}

/**
 * The base subscription row. The asset reads `packageData[packageSelect]` and
 * throws on an unknown key; here an unknown or missing key falls back to the
 * generator's preselected package. The annualPrice / includedUsers /
 * includedSites fields override the catalog values whenever they are set.
 *
 * The description is derived from the Engagement Term selects, matching the
 * asset's own row (`'Platform access for the '+(term.months?…)+'term — …'`). It
 * used to be the frozen phrase "for the pilot term", which meant the one row
 * every proposal prints announced a pilot on a twelve-month Enterprise deal and
 * ignored the term the seller had just chosen on the left. Users and sites come
 * from the seller's Included Users / Included Jobsites fields rather than the
 * catalog defaults the asset reads, so the row states what was actually quoted.
 */
function buildPackageLine(state: GeneratorState | null | undefined): ProposalLineItem | null {
  const rawKey = toText(readField(state, "packageSelect")).trim();
  const resolvedKey = lookupPackage(rawKey) ? rawKey : defaultPackageKey;

  // Services-only engagement: there is no base subscription to charge for, and
  // a $0 row for one is a line the client has to ask about.
  if (isNoPlatformPackageKey(resolvedKey)) return null;

  const base = lookupPackage(resolvedKey) ?? packageData[defaultPackageKey];

  const price = clamp(fieldNumber(state, "annualPrice", base.price), 0);
  const users = clamp(fieldNumber(state, "includedUsers", base.users), 0);
  const sites = clamp(fieldNumber(state, "includedSites", base.sites), 0);
  const qty = 1;

  const term = parseProposalTerm(state?.fields);
  const termPrefix = term.durationLabel ? `${term.durationLabel} ` : "";

  // Zero counts mean "not set yet" on a blank proposal, so the includes clause
  // is omitted rather than printing "includes 0 users and 0 sites" in the fee
  // table's description column.
  const includesClause = users > 0 || sites > 0 ? ` — includes ${users} users and ${sites} sites` : "";

  return {
    source: "package",
    key: resolvedKey,
    name: base.name,
    desc: `Platform access for the ${termPrefix}term${includesClause}.`,
    qty,
    price,
    amount: roundCents(qty * price),
  };
}

/**
 * A phase or service row. Name and description fall back to the catalog entry
 * for the row's key exactly as the asset's collectItems() does, so a state that
 * only stored keys and quantities still prices and reads correctly.
 */
function buildItemLine(item: GeneratorItem, source: Exclude<ProposalLineSource, "package">): ProposalLineItem {
  const key = toText(item.key).trim();
  const option = source === "phase" ? lookupPhase(key) : lookupService(key);
  const qty = clamp(toNumber(item.qty, 0), 0);
  const price = clamp(toNumber(item.price, 0), 0);
  const name = toText(item.name) || option?.name || "";
  const desc = toText(item.desc) || option?.desc || "";

  return { source, key, name, desc, qty, price, amount: roundCents(qty * price) };
}
