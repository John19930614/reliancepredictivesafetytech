import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type PortalClient = SupabaseClient<Database>;

/**
 * Fires portal notifications for certifications expiring within the next 30 days.
 * Runs once per day via the daily digest cron. Uses dedupe keys to prevent duplicate alerts.
 */
export async function fireExpiringCertNotifications(admin: PortalClient) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { data: expiringCerts, error } = await admin
    .from("training_certifications")
    .select("id, learner_name, certification_name, expires_at, client_id")
    .eq("status", "Active")
    .not("expires_at", "is", null)
    .lte("expires_at", in30Days.toISOString())
    .gte("expires_at", now.toISOString());

  if (error || !expiringCerts || expiringCerts.length === 0) {
    return;
  }

  const { data: adminRoles } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role", ["platform_admin", "super_admin"])
    .eq("account_status", "active");

  const adminUserIds = [...new Set((adminRoles ?? []).map((row) => row.user_id))];
  if (adminUserIds.length === 0) return;

  const notifications = [];

  for (const cert of expiringCerts) {
    const expiresAt = new Date(cert.expires_at!);
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const priority = daysLeft <= 7 ? "high" : "medium";

    // Update the cert status to "Expiring" so the UI badge reflects it
    await admin
      .from("training_certifications")
      .update({ status: "Expiring", updated_at: now.toISOString() })
      .eq("id", cert.id)
      .eq("status", "Active");

    for (const userId of adminUserIds) {
      notifications.push({
        recipient_user_id: userId,
        title: `Cert expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        body: `${cert.learner_name} — ${cert.certification_name} expires ${expiresAt.toLocaleDateString()}.`,
        priority,
        source_type: "training_certification",
        source_id: cert.id,
        action_href: "/employee/training",
        dedupe_key: `cert-expiry-30d-${cert.id}`,
      });
    }
  }

  if (notifications.length > 0) {
    // Upsert so re-running the cron doesn't create duplicates
    const dedupeKeys = notifications.map((n) => n.dedupe_key);
    const { data: existing } = await admin
      .from("portal_notifications")
      .select("dedupe_key")
      .in("dedupe_key", dedupeKeys)
      .neq("status", "archived");

    const existingKeys = new Set((existing ?? []).map((n) => n.dedupe_key));
    const fresh = notifications.filter((n) => !existingKeys.has(n.dedupe_key));

    if (fresh.length > 0) {
      await admin.from("portal_notifications").insert(fresh);
    }
  }

  // Also flip any certs that have now passed their expiry date to "Expired"
  await admin
    .from("training_certifications")
    .update({ status: "Expired", updated_at: now.toISOString() })
    .in("status", ["Active", "Expiring"])
    .lt("expires_at", now.toISOString());
}
