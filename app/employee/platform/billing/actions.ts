"use server";

import { requireClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { recordAuditEvent, buildDataAuditEvent } from "@/lib/audit/events";

export async function getSubscriptionTiers() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("platform_subscription_tiers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function getTenantSubscriptions() {
  const supabase = await requireClient();
  const { data } = await supabase
    .from("platform_tenant_subscriptions")
    .select("*, platform_subscription_tiers(name, tier_key)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function createTenantSubscription(form: FormData) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tenantName = String(form.get("tenant_name"));
  const trialDays = 14;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from("platform_tenant_subscriptions").insert({
    tenant_name: tenantName,
    tenant_email: form.get("tenant_email") ? String(form.get("tenant_email")) : null,
    tier_id: form.get("tier_id") ? String(form.get("tier_id")) : null,
    status: "trial",
    trial_ends_at: trialEndsAt,
    notes: form.get("notes") ? String(form.get("notes")) : null,
  });
  await recordAuditEvent(buildDataAuditEvent("create", "platform_tenant_subscription", tenantName, user?.id ?? null, `New tenant subscription created: ${tenantName} (trial)`));
  revalidatePath("/employee/platform/billing");
}

export async function updateSubscriptionStatus(id: string, status: string) {
  const supabase = await requireClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("platform_tenant_subscriptions").update({ status }).eq("id", id);
  await recordAuditEvent(buildDataAuditEvent("update", "platform_tenant_subscription", id, user?.id ?? null, `Subscription status changed to ${status}`));
  revalidatePath("/employee/platform/billing");
}

export async function updateSubscriptionTier(form: FormData) {
  const supabase = await requireClient();
  await supabase.from("platform_subscription_tiers").upsert({
    tier_key: String(form.get("tier_key")),
    name: String(form.get("name")),
    description: String(form.get("description") ?? ""),
    monthly_price_cents: Number(form.get("monthly_price_cents") ?? 0),
    annual_price_cents: Number(form.get("annual_price_cents") ?? 0),
    max_users: form.get("max_users") ? Number(form.get("max_users")) : null,
    sort_order: Number(form.get("sort_order") ?? 0),
  }, { onConflict: "tier_key" });
  revalidatePath("/employee/platform/billing");
}
