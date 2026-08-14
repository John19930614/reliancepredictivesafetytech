// What a line item's QUANTITY actually means — and therefore how it is priced.
//
// Pure: no DOM, no I/O, no module state, no imports. Everything here reads
// untrusted persisted values (a proposal's line items live inside
// `client_proposals.form_data` JSONB, which a browser posts) and every entry
// point coerces rather than trusts. Nothing throws on garbage input.
//
// WHY THIS EXISTS
//
// `unit` was a decorative label. The row's amount was always qty × price, so
// two genuinely different billing models were being crushed into one:
//
//   PER SESSION — a lockout/tagout or confined-space class is $1,000 for the
//   session, up to the seats the room holds. The price does not move with the
//   headcount. Three classes booked and one cancelled bills two sessions:
//   2 × $1,000 = $2,000. The QUANTITY is the number of classes delivered.
//
//   PER ATTENDEE — bloodborne pathogens is quoted per head. Ten attendees at
//   $105 is $1,050, and the per-head rate can step down as the headcount rises.
//   The QUANTITY is the number of people.
//
// Both scale linearly, but they scale on different things, and a document that
// prints "10" against a per-session price has quoted a class ten times over.
// The basis names the thing, drives the printed label, and — for `flat` — stops
// the quantity from scaling the price at all.
//
// BACKWARD COMPATIBILITY IS THE CONSTRAINT
//
// Real signed proposals are stored in this format. A row saved before any of
// this existed carries no basis, and `resolveQtyBasis()` therefore falls back
// to the row's own `unit` string — the one that already travels with the price.
// That fallback can never produce `flat`, so a legacy row can never stop
// multiplying: it prices to the cent exactly as it did the day it was sent.

/* -------------------------------------------------------------------------- */
/* The enum                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The four billing bases. `session`, `attendee` and `hour` scale linearly
 * (qty × rate) and differ only in what they count and what they print. `flat`
 * does NOT scale: the quantity is not billed at all.
 */
export const qtyBases = Object.freeze(["session", "attendee", "hour", "flat"] as const);

export type QtyBasis = (typeof qtyBases)[number];

/** Bases whose quantity multiplies the rate. Everything except `flat`. */
export const linearQtyBases: readonly QtyBasis[] = Object.freeze(["session", "attendee", "hour"] as const);

export function isQtyBasis(value: unknown): value is QtyBasis {
  return typeof value === "string" && (qtyBases as readonly string[]).includes(value);
}

/**
 * A persisted basis, or null when there isn't a usable one.
 *
 * Null is the legacy behaviour — linear qty × price labelled by `unit` — so an
 * absent, misspelled, renamed, or hand-crafted value degrades to exactly what
 * the platform did before the enum existed. It never throws and never invents
 * `flat`, because inventing `flat` would silently drop a multiplier off a
 * signed proposal's total.
 */
export function coerceQtyBasis(value: unknown): QtyBasis | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isQtyBasis(normalized) ? normalized : null;
}

/* -------------------------------------------------------------------------- */
/* Catalog units -> basis                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The catalog's existing `unit` vocabulary mapped onto the enum, rather than a
 * parallel one invented beside it. catalog.ts already says "Session", "Person"
 * and "Hour" on every service; those three ARE the three linear bases.
 *
 * Units with no entry here — Day, Mile, Night, Project, Document, Audit, Year,
 * Block, Site, Package, User, Unit — deliberately map to null. They are real
 * billing units that keep printing themselves verbatim and keep multiplying.
 * Mapping any of them to `flat` would reprice every proposal already sent that
 * quoted two of them.
 *
 * Plurals and the obvious synonyms are accepted because `unit` is stored free
 * text: a row can carry a unit a seller's earlier catalog wrote, not just one
 * of today's.
 */
const unitBasisByUnit: Readonly<Record<string, QtyBasis>> = Object.freeze({
  session: "session",
  sessions: "session",
  class: "session",
  classes: "session",
  course: "session",
  courses: "session",
  person: "attendee",
  persons: "attendee",
  people: "attendee",
  attendee: "attendee",
  attendees: "attendee",
  participant: "attendee",
  participants: "attendee",
  seat: "attendee",
  seats: "attendee",
  student: "attendee",
  students: "attendee",
  hour: "hour",
  hours: "hour",
  hr: "hour",
  hrs: "hour",
  flat: "flat",
  "flat fee": "flat",
  "fixed fee": "flat",
  "lump sum": "flat",
});

/** The basis a `unit` string implies, or null when it implies none. */
export function unitToQtyBasis(unit: unknown): QtyBasis | null {
  if (typeof unit !== "string") return null;
  const key = unit.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(unitBasisByUnit, key) ? unitBasisByUnit[key] : null;
}

/** The catalog `unit` word a basis corresponds to, for a row that has none. */
export const qtyBasisUnits: Readonly<Record<QtyBasis, string>> = Object.freeze({
  session: "Session",
  attendee: "Person",
  hour: "Hour",
  flat: "Flat",
});

/**
 * The basis for a row: what it stored, else what its unit implies.
 *
 * THE BASIS MUST TRAVEL WITH THE PRICE, for the same reason `unit` does. A
 * stored basis always wins over the unit, and the unit stored on the row always
 * wins over today's catalog, so repricing a course from per-session to
 * per-attendee cannot reach backwards into a document already sent.
 */
export function resolveQtyBasis(storedBasis: unknown, unit: unknown): QtyBasis | null {
  return coerceQtyBasis(storedBasis) ?? unitToQtyBasis(unit);
}

/* -------------------------------------------------------------------------- */
/* Delivery mode                                                               */
/* -------------------------------------------------------------------------- */

/** How an instructor-led course is delivered. Affects wording, never price. */
export const deliveryModes = Object.freeze(["in_person", "virtual"] as const);

export type DeliveryMode = (typeof deliveryModes)[number];

/** Client-facing wording. Printed verbatim on the document. */
export const deliveryModeLabels: Readonly<Record<DeliveryMode, string>> = Object.freeze({
  in_person: "Instructor-led course — in person",
  virtual: "Instructor-led course — virtual",
});

export function isDeliveryMode(value: unknown): value is DeliveryMode {
  return typeof value === "string" && (deliveryModes as readonly string[]).includes(value);
}

/** Persisted delivery mode, or null. Unknown values degrade to "unstated". */
export function coerceDeliveryMode(value: unknown): DeliveryMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return isDeliveryMode(normalized) ? normalized : null;
}

export function deliveryModeLabel(mode: DeliveryMode | null): string {
  return mode ? deliveryModeLabels[mode] : "";
}

/* -------------------------------------------------------------------------- */
/* Tiered rates                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One step of a volume rate ladder: from `min_qty` upwards, each unit is
 * `price`.
 *
 * VOLUME, NOT GRADUATED. The matching tier reprices the WHOLE quantity, which
 * is how a per-head discount is actually quoted ("20 or more and it's $95 a
 * head" means all twenty are $95, not twenty at $105 plus the rest at $95).
 *
 * Snake_case because this is a persisted JSON shape, like `qty_basis` itself.
 *
 * NO THRESHOLDS ARE DEFINED ANYWHERE IN THIS CODEBASE. The ladder is empty by
 * default and every line stays at its single flat rate until someone with the
 * authority to set prices puts numbers on it. This module supplies the model
 * and the arithmetic, not the price book.
 */
export interface QtyTier {
  /** Quantity at which this rate starts applying, inclusive. */
  readonly min_qty: number;
  /** Per-unit rate from that quantity up. */
  readonly price: number;
}

/**
 * Normalizes a persisted tier ladder: drops anything malformed, clamps to
 * non-negative, sorts ascending, and collapses duplicate thresholds to their
 * LOWEST rate.
 *
 * Duplicates are malformed input, and resolving them downwards means a
 * hand-crafted payload cannot inflate a total by injecting a second tier at a
 * threshold that already exists. An empty result means "no ladder" — the row's
 * own price is the rate — which is what every row saved to date has.
 */
export function coerceQtyTiers(value: unknown): QtyTier[] {
  if (!Array.isArray(value)) return [];
  const byThreshold = new Map<number, number>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const raw = entry as { min_qty?: unknown; price?: unknown };
    if (typeof raw.min_qty !== "number" || !Number.isFinite(raw.min_qty)) continue;
    if (typeof raw.price !== "number" || !Number.isFinite(raw.price)) continue;
    const minQty = Math.max(0, raw.min_qty);
    const price = Math.max(0, raw.price);
    const existing = byThreshold.get(minQty);
    if (existing === undefined || price < existing) byThreshold.set(minQty, price);
  }
  return [...byThreshold.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([min_qty, price]) => Object.freeze({ min_qty, price }));
}

/**
 * The per-unit rate for a quantity: the highest threshold at or below `qty`,
 * else the row's own price.
 *
 * A ladder is not required to step DOWN — the arithmetic does not police the
 * direction, because a seller quoting a surcharge above a threshold is entitled
 * to. It only guarantees that exactly one rate applies and that it is decided
 * by the quantity.
 */
export function rateForQty(price: number, qty: number, tiers: readonly QtyTier[] = []): number {
  const base = Number.isFinite(price) ? Math.max(0, price) : 0;
  if (tiers.length === 0) return base;
  const quantity = Number.isFinite(qty) ? Math.max(0, qty) : 0;
  let rate = base;
  for (const tier of tiers) {
    if (quantity >= tier.min_qty) rate = tier.price;
  }
  return rate;
}

/* -------------------------------------------------------------------------- */
/* The math                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The quantity actually billed.
 *
 * `flat` bills ONE, whatever the row says — that is the whole meaning of the
 * basis, and it holds at qty 0 too. A flat fee is removed by deleting the line,
 * not by typing zero into a box the document does not bill from; making 0 mean
 * "free" would turn a stray keystroke into an unpriced deliverable.
 */
export function billableQty(basis: QtyBasis | null, qty: unknown): number {
  if (basis === "flat") return 1;
  const value = typeof qty === "number" ? qty : Number(qty);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export interface PricedQty {
  /** Quantity as billed — the stored quantity, or 1 for a flat line. */
  qty: number;
  /** Per-unit rate after the tier ladder. Equals `price` when untiered. */
  rate: number;
  /** qty × rate, unrounded. Callers round to cents. */
  amount: number;
}

/**
 * The arithmetic the whole feature exists for.
 *
 *   flat                     -> amount = rate            (quantity ignored)
 *   session|attendee|hour    -> amount = qty × rate
 *   no basis (legacy row)    -> amount = qty × rate      (identical to before)
 *
 * where rate is the row's price stepped by the tier ladder, if it has one.
 * Tiers are meaningless without a quantity, so `flat` ignores them.
 */
export function priceQty(basis: QtyBasis | null, qty: unknown, price: unknown, tiers: readonly QtyTier[] = []): PricedQty {
  const listPrice = typeof price === "number" && Number.isFinite(price) ? Math.max(0, price) : 0;
  const billable = billableQty(basis, qty);
  const rate = basis === "flat" ? listPrice : rateForQty(listPrice, billable, tiers);
  return { qty: billable, rate, amount: billable * rate };
}

/* -------------------------------------------------------------------------- */
/* The label                                                                   */
/* -------------------------------------------------------------------------- */

const qtyBasisNouns: Readonly<Record<QtyBasis, { one: string; many: string }>> = Object.freeze({
  session: Object.freeze({ one: "session", many: "sessions" }),
  attendee: Object.freeze({ one: "attendee", many: "attendees" }),
  hour: Object.freeze({ one: "hour", many: "hours" }),
  flat: Object.freeze({ one: "Flat fee", many: "Flat fee" }),
});

/**
 * What the fee table prints in its Qty column.
 *
 * A basis labels itself — "2 sessions", "10 attendees", "8 hours" — so the
 * number can never be read against the wrong thing. `flat` prints "Flat fee"
 * and no number at all, because there is no quantity to show.
 *
 * With NO basis this is character-for-character what the document already
 * printed: the quantity, then the row's unit when it has one. That is what
 * makes adopting this label safe for every proposal already in a client's
 * hands.
 */
export function formatQtyLabel(basis: QtyBasis | null, qty: number, unit = ""): string {
  if (basis === "flat") return qtyBasisNouns.flat.one;
  if (basis) {
    const noun = qtyBasisNouns[basis];
    return `${qty} ${qty === 1 ? noun.one : noun.many}`;
  }
  return unit ? `${qty} ${unit}` : String(qty);
}

/** Editor-facing label for the Qty control, e.g. "Attendees" / "Flat fee". */
export function qtyFieldLabel(basis: QtyBasis | null, unit = ""): string {
  if (basis === "flat") return "Flat fee — qty not billed";
  if (basis) {
    const noun = qtyBasisNouns[basis];
    return noun.many.charAt(0).toUpperCase() + noun.many.slice(1);
  }
  return unit || "Unit";
}
