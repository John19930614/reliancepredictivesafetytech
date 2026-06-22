"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export async function getReleases() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("platform_releases")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createRelease(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  const version = String(form.get("version"));
  const title = String(form.get("title"));
  await supabase.from("platform_releases").insert({
    version,
    title,
    environment: String(form.get("environment") ?? "development"),
    release_notes: form.get("release_notes") ? String(form.get("release_notes")) : null,
    migration_required: form.get("migration_required") === "on",
    rollback_plan: form.get("rollback_plan") ? String(form.get("rollback_plan")) : null,
  });
  await recordAuditEvent(buildDataAuditEvent("create", "platform_release", version, user?.id ?? null, `Release ${version} created: ${title}`));
  revalidatePath("/employee/platform/releases");
}

export async function updateReleaseStatus(id: string, status: string) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("platform_releases").update({
    status,
    ...(status === "deployed" ? { deployed_at: new Date().toISOString() } : {}),
  }).eq("id", id);
  await recordAuditEvent(buildDataAuditEvent("update", "platform_release", id, user?.id ?? null, `Release status changed to ${status}`));
  revalidatePath("/employee/platform/releases");
}

export async function signOffRelease(id: string) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("platform_releases").update({
    signed_off_by: user?.id ?? null,
    signed_off_at: new Date().toISOString(),
  }).eq("id", id);
  await recordAuditEvent(buildDataAuditEvent("update", "platform_release", id, user?.id ?? null, `Release signed off for deployment`));
  revalidatePath("/employee/platform/releases");
}
