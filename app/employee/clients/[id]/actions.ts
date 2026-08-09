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
