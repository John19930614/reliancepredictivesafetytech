"use server";

// Server Action for the seller's own company record
// (MODULE_ID: platform_company_profile — the table contract lives in
// supabase/migrations/20260809101000_platform_company_profile.sql).
//
// ADMIN ONLY, enforced twice: the RLS update policy requires
// is_company_portal_admin(), and the `.select()` below turns a policy-denied
// write into a zero-row result the action reports as an error rather than a
// silent success. This is the legal name and address printed on every
// commercial document the company issues — not a field an ordinary employee
// should be able to change while editing a proposal.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";
import type { CompanyProfile } from "@/lib/company/profile";

export interface CompanyProfileActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// Deliberately NOT exported: a "use server" file may only export async
// functions — any other export makes Next.js throw at module evaluation and
// takes every action in the file down with it
// (lib/guardrails/use-server-exports.test.ts enforces this repo-wide).

/** Mirrors the CHECK constraints on platform_company_profile. */
const companyProfileLimits = Object.freeze({
  legal_name: 200,
  display_name: 200,
  address_line1: 200,
  address_line2: 200,
  city: 120,
  state: 120,
  postal_code: 40,
  country: 120,
  email: 254,
  phone: 40,
  website: 200,
});

const fieldLabels: Record<keyof typeof companyProfileLimits, string> = {
  legal_name: "legal name",
  display_name: "display name",
  address_line1: "street address",
  address_line2: "second address line",
  city: "city",
  state: "state",
  postal_code: "ZIP code",
  country: "country",
  email: "email",
  phone: "phone",
  website: "website",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Saves the company profile.
 *
 * Upserts on the constant primary key so a fresh environment whose seed row was
 * never inserted still gets one on first save, rather than silently updating
 * zero rows.
 */
export async function saveCompanyProfile(input: Partial<CompanyProfile>): Promise<CompanyProfileActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const row: Record<string, string> = {};
  const fieldErrors: Record<string, string> = {};
  for (const key of Object.keys(companyProfileLimits) as (keyof typeof companyProfileLimits)[]) {
    const value = text(input[key]);
    if (value.length > companyProfileLimits[key]) {
      fieldErrors[key] = `Keep the ${fieldLabels[key]} to ${companyProfileLimits[key]} characters or fewer.`;
    }
    row[key] = value;
  }

  const first = Object.values(fieldErrors)[0];
  if (first) return { ok: false, error: first, fieldErrors };

  // Neither name set would print a document with no company on it at all.
  if (row.legal_name === "" && row.display_name === "") {
    return {
      ok: false,
      error: "Enter at least a legal name — it heads every document the company issues.",
      fieldErrors: { legal_name: "Required." },
    };
  }

  const { data, error } = await supabase
    .from("platform_company_profile")
    .upsert({ id: true, ...row, updated_by: user.id }, { onConflict: "id" })
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: "Only a platform admin can change the company profile." };
  }

  await recordAuditEvent(
    buildDataAuditEvent(
      "update",
      "platform_company_profile",
      "singleton",
      user.id,
      "Updated the company profile printed on client documents",
      null,
      row,
    ),
  );

  revalidatePath("/employee/settings/company");
  // Every proposal editor prefills its seller block from this record.
  revalidatePath("/employee/proposals");
  return { ok: true };
}
