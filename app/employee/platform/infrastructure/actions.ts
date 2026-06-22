"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getDeploymentLog(limit = 30) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("infra_deployment_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getCostEntries(period?: string) {
  const supabase = await requireClient();
  let query = supabase.from("infra_cost_entries").select("*").order("amount_cents", { ascending: false });
  if (period) query = query.eq("period_month", period);
  const { data } = await query;
  return data ?? [];
}

export async function upsertCostEntry(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("infra_cost_entries").upsert({
    period_month: String(form.get("period_month")),
    service: String(form.get("service")),
    category: String(form.get("category") ?? "other"),
    amount_cents: Math.round(Number(form.get("amount_dollars") ?? 0) * 100),
    notes: form.get("notes") ? String(form.get("notes")) : null,
    created_by: user?.id ?? null,
  }, { onConflict: "period_month,service" });
  revalidatePath("/employee/platform/infrastructure");
}

export async function getSecurityScans(limit = 20) {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("infra_security_scans")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function addSecurityScanResult(form: FormData) {
  const supabase = await requireClient();
  await supabase.from("infra_security_scans").insert({
    scan_type: String(form.get("scan_type")),
    status: String(form.get("status")),
    findings_count: Number(form.get("findings_count") ?? 0),
    critical_count: Number(form.get("critical_count") ?? 0),
    high_count: Number(form.get("high_count") ?? 0),
    summary: form.get("summary") ? String(form.get("summary")) : null,
  });
  revalidatePath("/employee/platform/infrastructure");
}
