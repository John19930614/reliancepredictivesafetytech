// Pure helpers for the Proposal Generator's serialized form state. The shape is
// produced by the bridge injected in scripts/build-proposal-generator.mjs:
//   { v: 1, fields: { <elementId>: string | boolean }, phases: Item[], services: Item[] }

import { companyDocumentName, formatSellerContactBlock, type CompanyProfile } from "@/lib/company/profile";
import {
  clientFieldIds,
  defaultContactsForCompany,
  serializeClientContacts,
  type ClientCompanyDetail,
} from "./client-contacts";

export interface GeneratorItem {
  type: string;
  key: string;
  name: string;
  qty: number;
  price: number;
  desc: string;
  unit: string;
}

/** Scalar values a form field may hold. Never objects/arrays/null. */
export type GeneratorFieldValue = string | number | boolean;

export interface GeneratorState {
  v: number;
  fields: Record<string, GeneratorFieldValue>;
  phases: GeneratorItem[];
  services: GeneratorItem[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Optional string members may be absent, but must never be a non-string. */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/**
 * A field value must be a scalar. Rejecting objects/arrays here stops a
 * hand-crafted POST from smuggling structured data into the generator, where it
 * would be written straight back into DOM input values.
 */
export function isGeneratorFieldValue(value: unknown): value is GeneratorFieldValue {
  if (typeof value === "string" || typeof value === "boolean") return true;
  return isFiniteNumber(value);
}

/**
 * Deep guard for a single phase/service line item.
 *
 * `qty` and `price` MUST be finite numbers — never numeric-looking strings.
 * They are interpolated into the generator's `innerHTML` templates, so allowing
 * a string there is a stored-XSS vector even though the asset now coerces
 * defensively at the interpolation site.
 */
export function isGeneratorItem(value: unknown): value is GeneratorItem {
  if (!isPlainRecord(value)) return false;
  if (typeof value.type !== "string") return false;
  if (typeof value.key !== "string") return false;
  if (!isOptionalString(value.name)) return false;
  if (!isOptionalString(value.desc)) return false;
  if (!isOptionalString(value.unit)) return false;
  if (!isFiniteNumber(value.qty)) return false;
  if (!isFiniteNumber(value.price)) return false;
  return true;
}

export function isGeneratorState(value: unknown): value is GeneratorState {
  if (!isPlainRecord(value)) return false;
  if (!isFiniteNumber(value.v)) return false;
  if (!isPlainRecord(value.fields)) return false;
  for (const fieldValue of Object.values(value.fields)) {
    if (!isGeneratorFieldValue(fieldValue)) return false;
  }
  if (!Array.isArray(value.phases)) return false;
  if (!Array.isArray(value.services)) return false;
  if (!value.phases.every((item) => isGeneratorItem(item))) return false;
  if (!value.services.every((item) => isGeneratorItem(item))) return false;
  return true;
}

function fieldText(state: GeneratorState, id: string): string {
  const value = state.fields[id];
  return typeof value === "string" ? value.trim() : "";
}

/** Proposal title shown in the platform list: "<Client Co> — Platform Proposal". */
export function deriveTitleFromState(state: GeneratorState | null, fallback: string): string {
  if (!state) return fallback;
  const company = fieldText(state, "clientCompany");
  if (!company) return fallback;
  return `${company} — Platform Proposal`;
}

/** Short list-view summary, e.g. "RPST-2026-001 · pilot · 12 line items". */
export function deriveSummaryFromState(state: GeneratorState | null): string | null {
  if (!state) return null;
  const parts: string[] = [];
  const no = fieldText(state, "proposalNo");
  if (no) parts.push(no);
  const pkg = fieldText(state, "packageSelect");
  if (pkg) parts.push(pkg);
  const items = state.phases.length + state.services.length;
  if (items > 0) parts.push(`${items} line item${items === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Everything a brand-new proposal can be filled in from before anyone types.
 *
 * All of it is optional and all of it is data the platform already holds. The
 * point is that a proposal should open knowing who it is for, where they are,
 * who we are and what our address is — none of which a seller should have to
 * retype, and none of which the generator should invent.
 */
export interface ProposalPrefill {
  /** The assigned client company: name, address and the people on the record. */
  company?: ClientCompanyDetail | null;
  /** Our own company record, for the Prepared By block. */
  companyProfile?: CompanyProfile | null;
  /** Display name of the signed-in employee, for "Prepared By". */
  preparedBy?: string | null;
  /** The reference the database allocated to this proposal, e.g. RPS-2026-0007. */
  proposalNumber?: string | null;
  /**
   * Today as `YYYY-MM-DD`.
   *
   * Passed in rather than read from `new Date()` so this module stays pure and
   * the printed date is decided by ONE clock. The document formats calendar
   * dates by parsing the string parts precisely to avoid a timezone shift, and
   * a `new Date()` here would reintroduce it.
   */
  today?: string | null;
}

/**
 * Initial state for a proposal that has no saved form data yet.
 *
 * Deliberately omits phases/services so the generator keeps its default line
 * items — the bridge only replaces item lists when they are present as arrays.
 * Returns null when there is genuinely nothing to prefill.
 *
 * Only NON-EMPTY values are written. A blank stays absent rather than being set
 * to "", so a field the platform knows nothing about shows the generator's
 * placeholder and reads as "needs filling in" instead of as an answered
 * question. That distinction is the whole reason this function exists: the
 * generator used to ship its inputs pre-filled with example text
 * ("Street Address / City, State ZIP", "client@email.com"), the autosave
 * persisted it, and the document printed it as though it were real.
 */
export function buildPrefillState(prefill: ProposalPrefill | null | undefined): {
  v: number;
  fields: Record<string, string>;
} | null {
  if (!prefill) return null;
  const fields: Record<string, string> = {};

  const put = (id: string, value: string | null | undefined) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text !== "") fields[id] = text;
  };

  const { company, companyProfile } = prefill;

  put(clientFieldIds.company, company?.name);
  put(clientFieldIds.address, company?.addressText);
  put(clientFieldIds.contacts, serializeClientContacts(defaultContactsForCompany(company)));

  if (companyProfile) {
    put("sellerName", companyDocumentName(companyProfile));
    put("sellerContact", formatSellerContactBlock(companyProfile));
  }

  put("preparedBy", prefill.preparedBy);
  put("proposalNo", prefill.proposalNumber);
  put("proposalDate", prefill.today);

  if (Object.keys(fields).length === 0) return null;
  return { v: 1, fields };
}
