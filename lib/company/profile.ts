// Our own company record — the seller side of every document we issue.
//
// Pure functions only, so the formatting is unit testable and importable from
// both client components and server renderers. The query lives in
// lib/proposals/company-server.ts.
//
// Backed by the single-row `platform_company_profile` table
// (supabase/migrations/20260809101000). Before that table existed, the company
// name, address and contact email were literal strings inside a 255 KB static
// HTML asset, which meant every proposal printed a personal gmail address as
// the company's contact and nobody could correct it without a build step.

import { formatAddressLines, type CompanyAddress } from "@/lib/proposals/client-contacts";

export interface CompanyProfile extends CompanyAddress {
  /** Registered entity name, e.g. "Reliance Predictive Safety Technologies LLC". */
  legal_name: string;
  /** Wordmark across the top of a document — usually the name without "LLC". */
  display_name: string;
  /** Company reply-to address. Never an individual's inbox. */
  email: string;
  phone: string;
  website: string;
}

/**
 * A profile with every field blank.
 *
 * Returned when the row is missing or unreadable so callers never branch on
 * null. A blank profile prefills nothing, which leaves the seller's own fields
 * empty and visibly needing attention — strictly better than falling back to a
 * hardcoded address that may no longer be true.
 */
export const emptyCompanyProfile: CompanyProfile = Object.freeze({
  legal_name: "",
  display_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  email: "",
  phone: "",
  website: "",
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Coerces an untrusted row (a `select *` result) into a CompanyProfile. */
export function toCompanyProfile(row: Record<string, unknown> | null | undefined): CompanyProfile {
  if (!row || typeof row !== "object") return { ...emptyCompanyProfile };
  return {
    legal_name: text(row.legal_name),
    display_name: text(row.display_name),
    address_line1: text(row.address_line1),
    address_line2: text(row.address_line2),
    city: text(row.city),
    state: text(row.state),
    postal_code: text(row.postal_code),
    country: text(row.country),
    email: text(row.email),
    phone: text(row.phone),
    website: text(row.website),
  };
}

/**
 * The name that heads a client-facing document.
 *
 * Prefers the display name, falls back to the legal name, and returns "" when
 * neither is set rather than inventing one — the proposal's own default handles
 * the empty case.
 */
export function companyDocumentName(profile: CompanyProfile): string {
  return profile.display_name || profile.legal_name;
}

/**
 * The seller's "Prepared By" block, as the multi-line text the generator's
 * `sellerContact` textarea holds and the document prints under the name.
 *
 * Order matches how the block reads top to bottom: street, locality, then the
 * ways to reach us. Blank fields are omitted entirely rather than printed as
 * empty lines or labelled placeholders.
 */
export function formatSellerContactBlock(profile: CompanyProfile): string {
  const lines = [...formatAddressLines(profile)];
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  if (profile.website) lines.push(profile.website);
  return lines.join("\n");
}

/** True when the profile has nothing worth prefilling onto a document. */
export function isCompanyProfileBlank(profile: CompanyProfile): boolean {
  return companyDocumentName(profile) === "" && formatSellerContactBlock(profile) === "";
}

/**
 * Which fields an admin still needs to fill in.
 *
 * Surfaced in the settings UI and on the proposal editor's panel: the seeded
 * row deliberately carries no street address or ZIP (see the migration), so
 * without a prompt the gap would simply go unnoticed until a client asked where
 * to mail a check.
 */
export function missingCompanyProfileFields(profile: CompanyProfile): string[] {
  const missing: string[] = [];
  if (!profile.legal_name) missing.push("legal name");
  if (!profile.address_line1) missing.push("street address");
  if (!profile.city) missing.push("city");
  if (!profile.state) missing.push("state");
  if (!profile.postal_code) missing.push("ZIP code");
  if (!profile.email) missing.push("company email");
  if (!profile.phone) missing.push("phone number");
  return missing;
}
