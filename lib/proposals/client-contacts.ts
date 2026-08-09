// The people a proposal is addressed to, and the client company's address.
//
// Pure functions only — no Supabase, no I/O — so the encoding is unit testable
// and so this module can be imported from both the client editor and the server
// renderer. The database side lives in company-server.ts.
//
// STORAGE SHAPE
// A generator field value must be a scalar (isGeneratorFieldValue rejects
// objects and arrays, which is what stops a hand-crafted POST from smuggling
// structured data into the generator's DOM). The addressees are therefore
// stored as ONE newline-separated string in `state.fields.clientContacts`, one
// record per line:
//
//     Kevin Sanducker | Safety Director | kevin@hunzinger.com | 262-555-0134
//
// WHY A SNAPSHOT RATHER THAN CONTACT IDS
// The team picker stores teammate IDs and resolves bios at render time on
// purpose: a bio edited today should improve every proposal that prints it.
// The client block is the opposite case. It names the people a commercial
// document is addressed to, and a proposal a client signed in March must still
// say in December what it said when they signed it. Deleting a contact from the
// CRM, or fixing a typo in their title, must not silently rewrite an executed
// document. So the picker resolves the contacts once, at selection time, and
// what lands in form_data is text.

/** One addressee, as it prints in the document's Prepared For block. */
export interface ProposalClientContact {
  name: string;
  /** Role line printed after the name. "" when unknown. */
  title: string;
  email: string;
  phone: string;
}

/** Generator field ids the client panel writes into `state.fields`. */
export const clientFieldIds = Object.freeze({
  /** Newline-separated addressee records (see the encoding above). */
  contacts: "clientContacts",
  company: "clientCompany",
  address: "clientAddress",
  /** Legacy single-contact fields, kept only for the migration fallback. */
  legacyContact: "clientContact",
  legacyTitle: "clientTitle",
  legacyEmail: "clientEmail",
} as const);

/**
 * Hard cap on addressees.
 *
 * The Prepared For cell is a table cell on page one, not a distribution list.
 * Past about six names it stops reading as "addressed to" and starts pushing
 * the document's first section onto a second sheet.
 */
export const maxClientContacts = 6;

const FIELD_SEPARATOR = " | ";

/**
 * Strips the characters the encoding uses as structure.
 *
 * A pipe or a newline inside a name would split one record into two, so both
 * are replaced with a space rather than escaped: an escaping scheme is one more
 * thing to get wrong on both sides, and no real person's name needs a pipe.
 */
function sanitize(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const fieldLimits = Object.freeze({ name: 160, title: 160, email: 254, phone: 40 });

/** True when a record carries at least a name — the one field that must exist. */
export function isRenderableContact(contact: ProposalClientContact): boolean {
  return contact.name !== "";
}

/** Normalizes one record, trimming and stripping the separator characters. */
export function normalizeClientContact(input: Partial<ProposalClientContact>): ProposalClientContact {
  return {
    name: sanitize(input.name, fieldLimits.name),
    title: sanitize(input.title, fieldLimits.title),
    email: sanitize(input.email, fieldLimits.email),
    phone: sanitize(input.phone, fieldLimits.phone),
  };
}

/**
 * Serializes a selection back into the single scalar field the state stores.
 *
 * Drops nameless records and truncates at `maxClientContacts`, so the value
 * written is always one the parser will read back identically.
 */
export function serializeClientContacts(contacts: readonly Partial<ProposalClientContact>[]): string {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const raw of contacts) {
    const contact = normalizeClientContact(raw);
    if (!isRenderableContact(contact)) continue;
    // Two rows for the same person — easy to produce by ticking a CRM contact
    // and also typing them in by hand — would print the name twice.
    const identity = `${contact.name.toLowerCase()}|${contact.email.toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    // Positional encoding, so an absent title cannot shift the email into the
    // title's slot. Trailing empty fields ARE dropped — a contact with only a
    // name stores as "Kevin Sanducker", not "Kevin Sanducker |  |  | " — which
    // keeps the value readable in a revision diff.
    const parts = [contact.name, contact.title, contact.email, contact.phone];
    while (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
    kept.push(parts.join(FIELD_SEPARATOR));
    if (kept.length >= maxClientContacts) break;
  }
  return kept.join("\n");
}

/**
 * Parses the addressees out of a generator state's fields.
 *
 * Falls back to the legacy single-contact fields when `clientContacts` is
 * absent or blank, so a proposal saved before the multi-contact panel existed
 * still prints its addressee. Always returns an array, never null.
 */
export function parseClientContacts(fields: Record<string, unknown> | null | undefined): ProposalClientContact[] {
  const raw = fields?.[clientFieldIds.contacts];

  if (typeof raw === "string" && raw.trim() !== "") {
    const contacts: ProposalClientContact[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      const [name, title, email, phone] = line.split("|").map((part) => part.trim());
      const contact = normalizeClientContact({ name, title, email, phone });
      if (isRenderableContact(contact)) contacts.push(contact);
      if (contacts.length >= maxClientContacts) break;
    }
    if (contacts.length > 0) return contacts;
  }

  const legacy = normalizeClientContact({
    name: fields?.[clientFieldIds.legacyContact] as string | undefined,
    title: fields?.[clientFieldIds.legacyTitle] as string | undefined,
    email: fields?.[clientFieldIds.legacyEmail] as string | undefined,
  });
  return isRenderableContact(legacy) ? [legacy] : [];
}

/**
 * One addressee as a single document line: "Kevin Sanducker — Safety Director".
 *
 * The email is appended with a middle dot rather than given its own line: the
 * Prepared For block is a table cell, and six contacts on three lines each
 * would crowd out the address underneath it. The phone is deliberately NOT
 * printed — it is captured for the CRM, and a proposal is not a contact sheet.
 */
export function formatClientContactLine(contact: ProposalClientContact): string {
  const identity = [contact.name, contact.title].filter((part) => part !== "").join(" — ");
  return contact.email ? `${identity} · ${contact.email}` : identity;
}

/* -------------------------------------------------------------------------- */
/* Company address                                                             */
/* -------------------------------------------------------------------------- */

/** The address columns on `company_clients`, as the panel reads them. */
export interface CompanyAddress {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/**
 * Formats a structured address into the lines a document prints.
 *
 * Every part is optional and blank parts collapse rather than leaving a stray
 * comma — a company with only a city and state renders "Sussex, Wisconsin", not
 * ", Sussex, Wisconsin ,". Returns [] when nothing at all is set, which the
 * document treats as "no address on file" rather than printing an empty line.
 */
export function formatAddressLines(address: CompanyAddress | null | undefined): string[] {
  if (!address) return [];
  const text = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

  const lines: string[] = [];
  const line1 = text(address.address_line1);
  const line2 = text(address.address_line2);
  if (line1) lines.push(line1);
  if (line2) lines.push(line2);

  const city = text(address.city);
  const state = text(address.state);
  const postal = text(address.postal_code);
  // "Milwaukee, WI 53202" — the comma belongs to the city/state pair only, and
  // the ZIP is space-separated from the state, not comma-separated.
  const locality = [[city, state].filter((part) => part !== "").join(", "), postal]
    .filter((part) => part !== "")
    .join(" ");
  if (locality) lines.push(locality);

  const country = text(address.country);
  // Domestic addresses omit the country. Printing "United States" on a proposal
  // between two Wisconsin companies is noise.
  if (country && country.toLowerCase() !== "united states" && country.toLowerCase() !== "usa") {
    lines.push(country);
  }

  return lines;
}

/** The same address as the multi-line text the generator's textarea holds. */
export function formatAddressText(address: CompanyAddress | null | undefined): string {
  return formatAddressLines(address).join("\n");
}

/* -------------------------------------------------------------------------- */
/* Shapes shared between the server loader and the client editor               */
/* -------------------------------------------------------------------------- */
//
// Declared HERE, in the pure module, rather than in company-server.ts. That
// module carries `import "server-only"`, and the proposal editor is a client
// component: keeping the types out of it means the editor can never acquire an
// import that only fails once someone bundles for the browser.

/** One person on a client company, as the editor's picker needs them. */
export interface ClientContactOption extends ProposalClientContact {
  id: string;
  isPrimary: boolean;
}

/** The assigned client company, with everything the Prepared For block needs. */
export interface ClientCompanyDetail {
  id: string;
  name: string;
  /** Formatted address ready for the generator's textarea. "" when none set. */
  addressText: string;
  /** People on the company record, primary first. */
  contacts: ClientContactOption[];
  /** Legacy single contact from company_clients, when no contact rows exist. */
  legacyContactName: string;
  legacyContactEmail: string;
}

/**
 * The addressees a brand-new proposal should open with.
 *
 * Prefers the contacts marked primary; falls back to the whole list when none
 * is, and to the legacy `company_clients.contact_name` when the company has no
 * contact rows at all. Returns [] when there is genuinely nobody on file, which
 * leaves the panel empty and prompting rather than inventing a name.
 */
export function defaultContactsForCompany(company: ClientCompanyDetail | null | undefined): ProposalClientContact[] {
  if (!company) return [];

  if (company.contacts.length > 0) {
    const primary = company.contacts.filter((contact) => contact.isPrimary);
    const chosen = primary.length > 0 ? primary : company.contacts.slice(0, 1);
    return chosen.slice(0, maxClientContacts).map(normalizeClientContact);
  }

  const legacy = normalizeClientContact({
    name: company.legacyContactName,
    email: company.legacyContactEmail,
  });
  return isRenderableContact(legacy) ? [legacy] : [];
}
