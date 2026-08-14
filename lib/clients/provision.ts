import "server-only";

// Everything a new client needs, created in one place.
//
// WHAT THIS REPLACES. Client creation lived in a CLIENT COMPONENT
// (SalesPipelineManager), inserted straight from the browser — against
// CLAUDE.md's "no client-side data mutation" rule — and its one side effect,
// seedOnboarding, was fire-and-forget: the insert result was never read, so a
// failed seed left a company with no checklist and nobody was told. Clients
// created any other way got nothing at all.
//
// WHAT "SET UP" MEANS, from the platform's own gates (lib/pipeline/gates.ts):
// an onboarding checklist to work through, somewhere to put the documents, and
// a profile to price the work from. This creates all three.
//
// PARTIAL SUCCESS IS REPORTED, NOT SWALLOWED. The company row is the only part
// that must exist; folders, checklist and profile are each best-effort and each
// reported. A folder that failed to create is a nuisance somebody can fix in
// ten seconds — but only if they are told, which is exactly what the old
// fire-and-forget seed never did.
//
// RUNS AS THE CALLER, not service-role. company_file_folders' insert policy
// requires created_by = auth.uid(), and satisfying that honestly is better than
// reaching for the service key to work around a rule that is doing its job.

import { defaultClientOnboardingItems } from "@/lib/company-data";
import { clientFolderTemplate } from "@/lib/clients/folder-template";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** What a caller asks to be created. */
export interface ProvisionClientInput {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyType?: string | null;
  owner?: string | null;
  source?: string | null;
  notes?: string | null;
  /** Where the company starts on its own board. Defaults to Lead. */
  lifecycleStage?: string | null;
}

/** What each optional piece did. */
export interface ProvisionStepResult {
  ok: boolean;
  /** How many rows landed, for the pieces that create several. */
  created: number;
  error?: string;
}

export interface ProvisionClientResult {
  ok: boolean;
  error?: string;
  clientId?: string;
  onboarding: ProvisionStepResult;
  folders: ProvisionStepResult;
  profile: ProvisionStepResult;
}

const maxNameLength = 200;

function stepFailure(error: string): ProvisionStepResult {
  return { ok: false, created: 0, error };
}

function messageFrom(error: unknown, fallback: string): string {
  const shaped = error as { message?: string } | null;
  return shaped?.message ?? fallback;
}

/**
 * Creates a company and everything that hangs off it.
 *
 * The company row is created FIRST and alone. If it fails there is nothing to
 * clean up; if it succeeds, every later failure is reported against a client
 * that genuinely exists, which is the state a person can act on.
 */
export async function provisionClient(
  supabase: LooseClient,
  userId: string,
  input: ProvisionClientInput,
): Promise<ProvisionClientResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const idle: ProvisionStepResult = { ok: false, created: 0 };

  if (name.length === 0) {
    return { ok: false, error: "Give this company a name.", onboarding: idle, folders: idle, profile: idle };
  }
  if (name.length > maxNameLength) {
    return { ok: false, error: "That company name is too long.", onboarding: idle, folders: idle, profile: idle };
  }

  const owner = typeof input.owner === "string" ? input.owner.trim() : "";

  const { data: created, error: createError } = await supabase
    .from("company_clients")
    .insert({
      name,
      contact_name: input.contactName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      company_type: input.companyType?.trim() || null,
      lifecycle_stage: input.lifecycleStage?.trim() || "Lead",
      owner: owner || null,
      source: input.source?.trim() || "Manual",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (createError || !created?.id) {
    return {
      ok: false,
      error: messageFrom(createError, "Could not create this company."),
      onboarding: idle,
      folders: idle,
      profile: idle,
    };
  }

  const clientId = created.id as string;

  // Independent of each other, so they run together and each reports its own
  // outcome. None of them can invalidate the company that already exists.
  const [onboarding, folders, profile] = await Promise.all([
    seedOnboardingChecklist(supabase, clientId, owner),
    seedClientFolders(supabase, clientId, userId),
    seedEmptyProfile(supabase, clientId, userId),
  ]);

  return { ok: true, clientId, onboarding, folders, profile };
}

/* -------------------------------------------------------------------------- */
/* The pieces                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The onboarding checklist.
 *
 * Same template the sales board has always used, but the result is CHECKED.
 * A client with no checklist cannot clear a single stage gate — gates.ts reads
 * these rows — so silently seeding nothing left a company permanently stuck
 * with no visible cause.
 */
export async function seedOnboardingChecklist(
  supabase: LooseClient,
  clientId: string,
  owner: string,
): Promise<ProvisionStepResult> {
  const rows = defaultClientOnboardingItems.map((item, index) => ({
    client_id: clientId,
    title: item.title,
    section: item.section,
    lifecycle_stage: item.lifecycle_stage,
    owner: owner || null,
    sort_order: (index + 1) * 10,
  }));

  const { data, error } = await supabase.from("client_onboarding_items").insert(rows).select("id");

  if (error) return stepFailure(messageFrom(error, "Could not create the onboarding checklist."));
  return { ok: true, created: Array.isArray(data) ? data.length : rows.length };
}

/**
 * The File Center folder set.
 *
 * One insert, not five: a single statement either files the whole set or none
 * of it, so a client never ends up with three of five folders and no record of
 * which two are missing.
 *
 * `created_by` is the caller because the insert policy requires it. Nothing here
 * uses the service-role client.
 */
export async function seedClientFolders(
  supabase: LooseClient,
  clientId: string,
  userId: string,
): Promise<ProvisionStepResult> {
  const rows = clientFolderTemplate.map((folder) => ({
    scope: "client",
    client_id: clientId,
    parent_id: null,
    name: folder.name,
    created_by: userId,
  }));

  const { data, error } = await supabase.from("company_file_folders").insert(rows).select("id");

  if (error) {
    // 23505 is the case-insensitive sibling-name unique index. It means someone
    // (or the proposal acceptance filer) already made a folder of that name, so
    // the tree is fine — there is simply nothing for this to add.
    const code = (error as { code?: string }).code;
    if (code === "23505") return { ok: true, created: 0 };
    return stepFailure(messageFrom(error, "Could not create the client's folders."));
  }
  return { ok: true, created: Array.isArray(data) ? data.length : rows.length };
}

/**
 * An empty profile row.
 *
 * Deliberately empty rather than guessed. Its value is that the profile EXISTS,
 * so the editor has something to write into and the estimator has a row to read
 * — which turns "no data" into a form with visible blanks rather than a screen
 * that looks like the feature is missing.
 */
export async function seedEmptyProfile(
  supabase: LooseClient,
  clientId: string,
  userId: string,
): Promise<ProvisionStepResult> {
  const { error } = await supabase
    .from("company_profiles")
    .insert({ client_id: clientId, updated_by: userId });

  if (error) {
    const code = (error as { code?: string }).code;
    // Already present — the 1:1 primary key doing its job.
    if (code === "23505") return { ok: true, created: 0 };
    return stepFailure(messageFrom(error, "Could not create the company profile."));
  }
  return { ok: true, created: 1 };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One line naming what did not get made, or null when everything landed.
 *
 * The caller surfaces this to the operator. Provisioning is best-effort by
 * design, but "best-effort" only differs from "silently broken" if somebody is
 * told which part fell over.
 */
export function provisionWarning(result: ProvisionClientResult): string | null {
  const failed: string[] = [];
  if (!result.onboarding.ok) failed.push("the onboarding checklist");
  if (!result.folders.ok) failed.push("the File Center folders");
  if (!result.profile.ok) failed.push("the company profile");

  if (failed.length === 0) return null;

  const list =
    failed.length === 1
      ? failed[0]
      : `${failed.slice(0, -1).join(", ")} and ${failed[failed.length - 1]}`;
  return `The company was created, but ${list} could not be set up. Add them by hand or try again.`;
}
