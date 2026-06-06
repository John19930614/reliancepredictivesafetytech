import "server-only";

import { DailyDigestEmail } from "@/emails/daily-digest";
import { getCommandSnapshot } from "@/lib/ai/command-context";
import { getResendClient, NOTIFICATION_FROM } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWorkflowNotificationsForUser } from "@/lib/notifications/rules";
import { runWebsiteOperationsScan } from "@/lib/website-operations";
import { fireExpiringCertNotifications } from "@/lib/notifications/training-certs";

type DigestResult = {
  userId: string;
  status: "sent" | "skipped" | "failed";
  notificationCount: number;
  error?: string;
};

function centralDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ||
    "https://reliancepredictivesafety.com"
  );
}

export async function runDailyAiDigest() {
  const admin = createAdminClient();

  if (!admin) {
    throw new Error("Supabase admin environment variables are required for daily digest generation.");
  }

  const digestDate = centralDate();
  const resend = getResendClient();
  const appUrl = getAppUrl();

  await runWebsiteOperationsScan(admin, {
    baseUrl: appUrl,
    notifyAdmins: true,
  });

  await fireExpiringCertNotifications(admin);

  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("user_id, account_status")
    .eq("account_status", "active");

  if (roleError) {
    throw new Error(roleError.message);
  }

  const userIds = [...new Set((roles ?? []).map((role) => role.user_id))];

  if (userIds.length === 0) {
    return [] satisfies DigestResult[];
  }

  const [{ data: profiles }, { data: preferences }] = await Promise.all([
    admin.from("employee_profiles").select("user_id, display_name, legal_name, email").in("user_id", userIds),
    admin.from("notification_preferences").select("*").in("user_id", userIds),
  ]);

  const profilesByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const preferencesByUserId = new Map((preferences ?? []).map((preference) => [preference.user_id, preference]));
  const results: DigestResult[] = [];

  for (const userId of userIds) {
    const profile = profilesByUserId.get(userId);
    const preference = preferencesByUserId.get(userId);
    const email = profile?.email ?? null;

    try {
      const { data: existingRun } = await admin
        .from("ai_digest_runs")
        .select("id, status")
        .eq("user_id", userId)
        .eq("digest_date", digestDate)
        .maybeSingle();

      if (existingRun?.status === "sent") {
        results.push({ userId, status: "skipped", notificationCount: 0 });
        continue;
      }

      await generateWorkflowNotificationsForUser(admin, userId);

      const [{ data: notifications }, snapshot] = await Promise.all([
        admin
          .from("portal_notifications")
          .select("title, body, priority, action_href, ai_summary, created_at")
          .eq("recipient_user_id", userId)
          .eq("status", "unread")
          .order("created_at", { ascending: false })
          .limit(10),
        getCommandSnapshot(admin, userId),
      ]);

      const notificationCount = notifications?.length ?? 0;
      const digestEnabled = preference?.email_digest_enabled ?? true;

      if (!digestEnabled || !email || !resend) {
        const { data: run } = existingRun
          ? await admin
              .from("ai_digest_runs")
              .update({
                status: "skipped",
                notification_count: notificationCount,
                email_to: email,
                error_message: !resend ? "RESEND_API_KEY is not configured." : null,
              })
              .eq("id", existingRun.id)
              .select("id")
              .single()
          : await admin
              .from("ai_digest_runs")
              .insert({
                user_id: userId,
                digest_date: digestDate,
                status: "skipped",
                notification_count: notificationCount,
                email_to: email,
                error_message: !resend ? "RESEND_API_KEY is not configured." : null,
              })
              .select("id")
              .single();

        results.push({ userId: run?.id ? userId : userId, status: "skipped", notificationCount });
        continue;
      }

      const { data, error } = await resend.emails.send(
        {
          from: NOTIFICATION_FROM,
          to: email,
          subject: "Reliance daily workflow digest",
          react: DailyDigestEmail({
            appUrl,
            recipientName: profile?.display_name || profile?.legal_name || "there",
            summary: snapshot.summary,
            items: (notifications ?? []).map((item) => ({
              title: item.title,
              body: item.body,
              priority: item.priority,
              actionHref: item.action_href,
              aiSummary: item.ai_summary,
            })),
          }),
        },
        { headers: { "Idempotency-Key": `daily-digest-${userId}-${digestDate}` } },
      );

      if (error) {
        throw new Error(error.message);
      }

      if (existingRun) {
        await admin
          .from("ai_digest_runs")
          .update({
            status: "sent",
            notification_count: notificationCount,
            email_to: email,
            resend_email_id: data?.id ?? null,
            error_message: null,
          })
          .eq("id", existingRun.id);
      } else {
        await admin.from("ai_digest_runs").insert({
          user_id: userId,
          digest_date: digestDate,
          status: "sent",
          notification_count: notificationCount,
          email_to: email,
          resend_email_id: data?.id ?? null,
        });
      }

      results.push({ userId, status: "sent", notificationCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown digest error.";
      await admin.from("ai_digest_runs").upsert(
        {
          user_id: userId,
          digest_date: digestDate,
          status: "failed",
          email_to: email,
          error_message: message,
        },
        { onConflict: "user_id,digest_date" },
      );
      results.push({ userId, status: "failed", notificationCount: 0, error: message });
    }
  }

  return results;
}
