"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { createClient } from "@/lib/supabase/server";
import { isPortalAdminRole } from "@/lib/user-management";

export interface TriageActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Accepts or dismisses an AI lead-triage suggestion.
 *
 * The suggestion is advisory: acting on it only records the human decision,
 * it never edits the underlying lead. This is the Human Authority Rule from
 * CLAUDE.md — AI output cannot apply itself to a workflow record.
 */
export async function actOnLeadSuggestion(
  resultId: string,
  decision: "accepted" | "dismissed",
): Promise<TriageActionResult> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleRow?.account_status !== "active") {
    return { ok: false, error: "Your account is not active." };
  }

  const { data: existing } = await supabase
    .from("lead_triage_results")
    .select("id, status")
    .eq("id", resultId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Suggestion not found." };
  if (existing.status !== "suggested") {
    return { ok: false, error: `This suggestion was already ${existing.status}.` };
  }

  const { error } = await supabase
    .from("lead_triage_results")
    .update({ status: decision, acted_by: user.id, acted_at: new Date().toISOString() })
    .eq("id", resultId);

  if (error) return { ok: false, error: error.message };

  await recordAuditEvent({
    event_type: `lead_triage.${decision}`,
    event_category: "ai",
    severity: "info",
    actor_id: user.id,
    actor_role: roleRow?.role ?? null,
    resource_type: "lead_triage_result",
    resource_id: resultId,
    summary: `AI lead suggestion ${decision}`,
    after_state: { decision, isAdmin: isPortalAdminRole(roleRow?.role) },
  });

  revalidatePath("/employee/inbox");
  revalidatePath("/m/leads");
  return { ok: true };
}
