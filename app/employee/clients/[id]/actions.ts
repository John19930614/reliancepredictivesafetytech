"use server";

// Server Actions for a client company's address and its people
// (MODULE_ID: client_proposals — the table contract lives in
// supabase/migrations/20260809100000_company_client_addresses_and_contacts.sql).
//
// These are Server Actions rather than the direct browser writes the rest of
// ClientDetailManager still uses. This data is printed verbatim on commercial
// documents a client signs, so the bounds below are enforced on the server as
// well as by the CHECK constraints — a Server Action is a public POST endpoint,
// and the browser form is a convenience, not a control.
//
// Authorization is RLS plus an explicit getUser() gate: every policy on
// company_client_contacts requires is_company_portal_employee(), so a signed-in
// non-employee gets a zero-row write, which the `.select()` on each statement
// turns into a visible failure rather than a silent success.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import { clientCodeRule, isValidClientCode, normalizeClientCode } from "@/lib/proposals/client-codes";

export interface CompanyActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Set by saveCompanyContact when it created a row. */
  contactId?: string;
}

// Deliberately NOT exported, here and below: a "use server" file may only
// export async functions — any other export makes Next.js throw at module
// evaluation and takes every action in the file down with it
// (lib/guardrails/use-server-exports.test.ts enforces this repo-wide).

/** Mirrors the CHECK constraints on company_client_contacts. */
const contactLimits = Object.freeze({
  name: 160,
  title: 160,
  email: 254,
  phone: 40,
  notes: 1000,
});

/** Mirrors the practical bounds on the company_clients address columns. */
const addressLimits = Object.freeze({
  line: 200,
  city: 120,
  state: 120,
  postalCode: 40,
  country: 120,
  website: 200,
});

function revalidateCompany(clientId: string) {
  revalidatePath(`/employee/clients/${clientId}`);
  revalidatePath("/employee/sales");
  // The proposal editor reads the address and the contact list on every load.
  revalidatePath("/employee/proposals");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function requireEmployee() {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, userId: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CompanyAddressInput {
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  website?: string;
}

/**
 * Saves the company's postal address.
 *
 * Blank fields are stored as NULL rather than "": the document's address
 * formatter drops empty parts, and a row of empty strings is indistinguishable
 * from a row that was never filled in when someone reads the table directly.
 */
export async function saveCompanyAddress(
  clientId: string,
  input: CompanyAddressInput,
): Promise<CompanyActionResult> {
  if (!UUID.test(clientId)) return { ok: false, error: "Missing company id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const patch = {
    address_line1: text(input.address_line1),
    address_line2: text(input.address_line2),
    city: text(input.city),
    state: text(input.state),
    postal_code: text(input.postal_code),
    country: text(input.country),
    website: text(input.website),
  };

  const fieldErrors: Record<string, string> = {};
  const check = (key: keyof typeof patch, max: number, label: string) => {
    if (patch[key].length > max) fieldErrors[key] = `Keep the ${label} to ${max} characters or fewer.`;
  };
  check("address_line1", addressLimits.line, "street address");
  check("address_line2", addressLimits.line, "second address line");
  check("city", addressLimits.city, "city");
  check("state", addressLimits.state, "state");
  check("postal_code", addressLimits.postalCode, "ZIP code");
  check("country", addressLimits.country, "country");
  check("website", addressLimits.website, "website");

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  const { data, error } = await supabase
    .from("company_clients")
    .update({
      address_line1: patch.address_line1 || null,
      address_line2: patch.address_line2 || null,
      city: patch.city || null,
      state: patch.state || null,
      postal_code: patch.postal_code || null,
      country: patch.country || null,
      website: patch.website || null,
    })
    .eq("id", clientId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That company was not found, or you do not have permission to edit it." };

  revalidateCompany(clientId);
  return { ok: true };
}

/**
 * Assigns the company's proposal code (the moniker prefixing every proposal
 * number: HUN-01). Decision of record from the 2026-08-07 build review:
 * whoever writes the client's first proposal assigns the code.
 *
 * Once set, the code is immutable here: proposals already numbered under it
 * are documents a client may be quoting back on a PO, and silently switching
 * the moniker would strand their references. The database rejects duplicates
 * (unique index); that rejection is translated into a human answer.
 *
 * Existing DRAFT proposals for the company are renumbered onto the new scheme
 * by renumber_client_draft_proposals() — sent or accepted ones keep the
 * reference the client was quoted.
 */
export async function assignClientCode(
  clientId: string,
  code: string,
): Promise<CompanyActionResult & { assignedCode?: string; renumbered?: number }> {
  if (!UUID.test(clientId)) return { ok: false, error: "Missing company id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const normalized = normalizeClientCode(code);
  if (!isValidClientCode(normalized)) {
    return { ok: false, error: `That doesn't work as a proposal code. ${clientCodeRule}` };
  }

  const { data: company, error: readError } = await supabase
    .from("company_clients")
    .select("id, name, client_code")
    .eq("id", clientId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!company) return { ok: false, error: "That company was not found, or you do not have permission to edit it." };

  const existing = normalizeClientCode(company.client_code as string | null | undefined);
  if (existing !== "") {
    if (existing === normalized) return { ok: true, assignedCode: existing, renumbered: 0 };
    return {
      ok: false,
      error: `This company already has the code ${existing}. Codes stay fixed once proposals are numbered under them.`,
    };
  }

  const { data: updated, error } = await supabase
    .from("company_clients")
    .update({ client_code: normalized })
    .eq("id", clientId)
    .is("client_code", null)
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = the partial unique index on client_code: someone else owns it.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, error: `The code ${normalized} is already taken by another company — pick a different one.` };
    }
    return { ok: false, error: error.message };
  }
  if (!updated) {
    return { ok: false, error: "The code was not saved — the company may have just been given one. Reload and check." };
  }

  // Draft proposals move onto the new numbering immediately, so the document
  // someone is about to send carries the code that was just decided.
  const { data: renumbered, error: renumberError } = await supabase.rpc("renumber_client_draft_proposals", {
    p_client: clientId,
  });

  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "company_clients",
      clientId,
      userId,
      `Assigned proposal code ${normalized} to ${(company.name as string) ?? "a client company"}`,
      { client_code: null },
      { client_code: normalized },
    ),
  );

  revalidateCompany(clientId);

  if (renumberError) {
    return {
      ok: true,
      assignedCode: normalized,
      renumbered: 0,
      error: `The code was saved, but existing drafts could not be renumbered: ${renumberError.message}`,
    };
  }
  return { ok: true, assignedCode: normalized, renumbered: typeof renumbered === "number" ? renumbered : 0 };
}

export interface CompanyContactInput {
  /** Omit to create a new contact. */
  id?: string | null;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  notes?: string;
  isPrimary?: boolean;
}

/** Creates or updates one person on a company record. */
export async function saveCompanyContact(
  clientId: string,
  input: CompanyContactInput,
): Promise<CompanyActionResult> {
  if (!UUID.test(clientId)) return { ok: false, error: "Missing company id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const row = {
    name: text(input.name),
    title: text(input.title),
    email: text(input.email),
    phone: text(input.phone),
    notes: text(input.notes),
  };

  const fieldErrors: Record<string, string> = {};
  if (row.name === "") fieldErrors.name = "A contact needs a name.";
  if (row.name.length > contactLimits.name) fieldErrors.name = `Keep the name to ${contactLimits.name} characters or fewer.`;
  if (row.title.length > contactLimits.title) fieldErrors.title = `Keep the title to ${contactLimits.title} characters or fewer.`;
  if (row.email.length > contactLimits.email) fieldErrors.email = `Keep the email to ${contactLimits.email} characters or fewer.`;
  if (row.phone.length > contactLimits.phone) fieldErrors.phone = `Keep the phone to ${contactLimits.phone} characters or fewer.`;
  if (row.notes.length > contactLimits.notes) fieldErrors.notes = `Keep the note to ${contactLimits.notes} characters or fewer.`;

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  const contactId = text(input.id);
  const isUpdate = contactId !== "" && UUID.test(contactId);

  // is_primary is NOT written here. The partial unique index allows one primary
  // per company, so promoting someone has to demote the incumbent in the same
  // breath — that is setPrimaryCompanyContact's job, and doing it in two places
  // is how a company ends up with an insert that the index rejects.
  const { data, error } = isUpdate
    ? await supabase
        .from("company_client_contacts")
        .update(row)
        .eq("id", contactId)
        .eq("client_id", clientId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("company_client_contacts")
        .insert({ ...row, client_id: clientId })
        .select("id")
        .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: "That contact was not found, or you do not have permission to change it." };
  }

  // First contact on a company becomes the primary automatically, so a proposal
  // opened against a brand-new company still has an addressee to default to.
  if (!isUpdate) {
    const { count } = await supabase
      .from("company_client_contacts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (count === 1) {
      await supabase.from("company_client_contacts").update({ is_primary: true }).eq("id", data.id);
    }
  }

  if (input.isPrimary === true) {
    const promoted = await setPrimaryCompanyContact(clientId, data.id as string);
    if (!promoted.ok) return promoted;
  }

  revalidateCompany(clientId);
  return { ok: true, contactId: data.id as string };
}

/**
 * Makes one contact the company's primary, demoting whoever held it.
 *
 * Demote-then-promote, in that order: the reverse would momentarily leave two
 * rows flagged primary and be rejected by company_client_contacts_one_primary.
 */
export async function setPrimaryCompanyContact(
  clientId: string,
  contactId: string,
): Promise<CompanyActionResult> {
  if (!UUID.test(clientId) || !UUID.test(contactId)) return { ok: false, error: "Missing company or contact id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const { error: demoteError } = await supabase
    .from("company_client_contacts")
    .update({ is_primary: false })
    .eq("client_id", clientId)
    .eq("is_primary", true);
  if (demoteError) return { ok: false, error: demoteError.message };

  const { data, error } = await supabase
    .from("company_client_contacts")
    .update({ is_primary: true })
    .eq("id", contactId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That contact was not found on this company." };

  revalidateCompany(clientId);
  return { ok: true };
}

/**
 * Removes a person from a company record.
 *
 * Proposals already addressed to them are unaffected: a proposal snapshots the
 * addressee's text into form_data rather than holding a foreign key, precisely
 * so a CRM edit cannot rewrite a document a client has already been sent.
 */
export async function deleteCompanyContact(
  clientId: string,
  contactId: string,
): Promise<CompanyActionResult> {
  if (!UUID.test(clientId) || !UUID.test(contactId)) return { ok: false, error: "Missing company or contact id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const { data: existing } = await supabase
    .from("company_client_contacts")
    .select("id, name, title, email, is_primary")
    .eq("id", contactId)
    .eq("client_id", clientId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("company_client_contacts")
    .delete()
    .eq("id", contactId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That contact was not found, or you do not have permission to remove it." };

  await recordAuditEvent(
    buildDataAuditEvent(
      "delete",
      "company_client_contacts",
      contactId,
      userId,
      `Removed ${(existing?.name as string) ?? "a contact"} from a client company`,
      existing ?? null,
      null,
    ),
  );

  revalidateCompany(clientId);
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Company profile — what the contract is priced on                           */
/* -------------------------------------------------------------------------- */

export interface CompanyProfileInput {
  employee_count?: string | null;
  site_count?: string | null;
  annual_revenue?: string | null;
  primary_state?: string | null;
  states_operated?: string | null;
  naics_code?: string | null;
  hazard_class?: string | null;
  emr?: string | null;
  trir?: string | null;
  recordables_12mo?: string | null;
  lost_time_12mo?: string | null;
  osha_citations_3yr?: string | null;
  contractor_share_pct?: string | null;
  union_workforce?: boolean | null;
  notes?: string | null;
}

/**
 * Saves the firmographics and loss record a safety contract is scoped on.
 *
 * Fields arrive as STRINGS from the form, and a blank means "not known" rather
 * than zero — the estimator treats a stored 0 for headcount, sites or EMR as
 * missing precisely because 0 is a value somebody typed, not a gap. Writing
 * null keeps that distinction intact all the way to the database.
 */
export async function saveCompanyProfile(
  clientId: string,
  input: CompanyProfileInput,
): Promise<CompanyActionResult> {
  if (!UUID.test(clientId)) return { ok: false, error: "Missing company id." };

  const { supabase, userId } = await requireEmployee();
  if (!supabase || !userId) return { ok: false, error: "You must be signed in." };

  const fieldErrors: Record<string, string> = {};

  /** A blank stays null; anything else must be a real number in range. */
  const num = (raw: string | null | undefined, key: string, label: string, min: number, max: number, whole = true) => {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      fieldErrors[key] = `${label} has to be a number.`;
      return null;
    }
    if (parsed < min || parsed > max) {
      fieldErrors[key] = `${label} has to be between ${min} and ${max}.`;
      return null;
    }
    return whole ? Math.round(parsed) : Math.round(parsed * 100) / 100;
  };

  // Every bound below mirrors a CHECK on company_profiles, so the form refuses
  // what the database would refuse — with a message naming the field, rather
  // than a raw 23514 the operator cannot act on.
  const patch = {
    employee_count: num(input.employee_count, "employee_count", "Employees", 0, 500_000),
    site_count: num(input.site_count, "site_count", "Locations", 0, 5_000),
    annual_revenue: num(input.annual_revenue, "annual_revenue", "Annual revenue", 0, 1e14, false),
    emr: num(input.emr, "emr", "EMR", 0, 10, false),
    trir: num(input.trir, "trir", "TRIR", 0, 200, false),
    recordables_12mo: num(input.recordables_12mo, "recordables_12mo", "Recordables", 0, 100_000),
    lost_time_12mo: num(input.lost_time_12mo, "lost_time_12mo", "Lost-time incidents", 0, 100_000),
    osha_citations_3yr: num(input.osha_citations_3yr, "osha_citations_3yr", "OSHA citations", 0, 100_000),
    contractor_share_pct: num(input.contractor_share_pct, "contractor_share_pct", "Contract labour share", 0, 100),
    primary_state: text(input.primary_state) || null,
    states_operated: text(input.states_operated) || null,
    naics_code: text(input.naics_code) || null,
    hazard_class: text(input.hazard_class) || null,
    union_workforce: typeof input.union_workforce === "boolean" ? input.union_workforce : null,
    notes: text(input.notes) || null,
    updated_by: userId,
  };

  if (patch.naics_code && !/^[0-9]{2,6}$/.test(patch.naics_code)) {
    fieldErrors.naics_code = "A NAICS code is 2 to 6 digits.";
  }
  if (patch.hazard_class && !["low", "moderate", "high", "severe"].includes(patch.hazard_class)) {
    fieldErrors.hazard_class = "Choose a hazard class from the list.";
  }
  // Lost-time incidents are a subset of recordables. The database enforces this
  // too; catching it here names the field instead of failing the whole save.
  if (
    patch.lost_time_12mo !== null &&
    patch.recordables_12mo !== null &&
    patch.lost_time_12mo > patch.recordables_12mo
  ) {
    fieldErrors.lost_time_12mo = "Lost-time incidents cannot exceed total recordables.";
  }

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  // Upsert: provisioning creates an empty row for new companies, but every
  // company that predates it has none, and the editor must work for both.
  // company_profiles is newer than the generated types; same escape hatch the
  // rest of the repo uses until lib/supabase/types.ts is regenerated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("company_profiles")
    .upsert({ client_id: clientId, ...patch }, { onConflict: "client_id" })
    .select("client_id");

  if (error) {
    return { ok: false, error: friendlyProfileError(error) };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "That company was not found, or you do not have permission to edit it." };
  }

  await recordAuditEvent({
    ...buildDataAuditEvent("update", "company_profile", clientId, userId, "Updated the company profile", null, {
      employee_count: patch.employee_count,
      site_count: patch.site_count,
      hazard_class: patch.hazard_class,
      emr: patch.emr,
    }),
  });

  revalidatePath(`/employee/clients/${clientId}`);
  revalidatePath("/employee/lifecycle");
  return { ok: true };
}

/** The one Postgres code worth translating here. */
function friendlyProfileError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23514") {
    return "One of those numbers is outside the range the database allows. Check the incident counts and rates.";
  }
  if (code === "42P01" || code === "PGRST205") {
    return "Company profiles are not set up in Supabase yet. Apply the latest database migrations and try again.";
  }
  return "Could not save the company profile.";
}
