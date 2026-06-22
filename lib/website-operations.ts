import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { CONTACT_EMAIL, products, whyReliance } from "@/lib/company-data";
import { resolveWebsiteContentValue } from "@/lib/website-operations/content-utils";
import { buildWebsiteNotificationDedupeKey, extractLinksFromHtml, inspectLinks, inspectSeo } from "@/lib/website-operations/scan-utils";
import type { Database, Json } from "@/lib/supabase/types";

type PortalClient = SupabaseClient<Database>;

export const managedWebsiteRoutes = ["/", "/privacy", "/terms", "/ai-output-disclaimer", "/employee-login"] as const;

export const websiteContentFallbacks = [
  {
    contentKey: "home.hero.eyebrow",
    routePath: "/",
    title: "Homepage hero eyebrow",
    fallbackValue: "Prevention-first AI safety intelligence",
  },
  {
    contentKey: "home.hero.summary",
    routePath: "/",
    title: "Homepage hero summary",
    fallbackValue:
      "Reliance is a prevention tool built to help contractors, safety teams, and project owners reduce risk before injuries happen. We collect safety data with AI-assisted workflows, turn field signals into usable trends, and make risk more predictable for safer decisions.",
  },
  {
    contentKey: "home.products.heading",
    routePath: "/",
    title: "Products section heading",
    fallbackValue: "Prevention work, made visible.",
  },
  {
    contentKey: "home.products.summary",
    routePath: "/",
    title: "Products section summary",
    fallbackValue:
      "Reliance brings document generation, AI-assisted data collection, field tracking, review workflows, and predictive visibility into a professional safety technology suite focused on measurable risk reduction.",
  },
  {
    contentKey: "home.why.heading",
    routePath: "/",
    title: "Why Reliance heading",
    fallbackValue: "Built for safety teams that want fewer surprises.",
  },
  {
    contentKey: "home.why.summary",
    routePath: "/",
    title: "Why Reliance summary",
    fallbackValue:
      "The platform is designed to reduce repetitive admin work while preserving review discipline, so safety leaders can identify recurring signals, compare trends, and act before risk turns into loss.",
  },
  {
    contentKey: "home.contact.heading",
    routePath: "/",
    title: "Contact section heading",
    fallbackValue: "See how prevention-focused safety work can move faster.",
  },
  {
    contentKey: "home.contact.summary",
    routePath: "/",
    title: "Contact section summary",
    fallbackValue:
      "Tell us what you want to solve first: AI-assisted data collection, CSEP/PSHSEP generation, SOR scoring, incident and near-miss trend analysis, corrective actions, permit/JSA workflows, training matrices, or document control.",
  },
] as const;

export type WebsiteOperationsSnapshot = {
  generatedAt: string;
  deployment: {
    status: "needs_reauth";
    label: string;
    detail: string;
  };
  counts: {
    managedRoutes: number;
    latestScannedRoutes: number;
    unhealthyRoutes: number;
    brokenLinks: number;
    contentGaps: number;
    recentDemoRequests: number;
    staleLeads: number;
    pendingWebsiteProposals: number;
    pendingContentDrafts: number;
    recentEvents: number;
  };
  latestChecks: Database["public"]["Tables"]["website_health_checks"]["Row"][];
  contentItems: Database["public"]["Tables"]["website_content_items"]["Row"][];
  recentEvents: Database["public"]["Tables"]["website_operations_events"]["Row"][];
  recentDemoRequests: Array<{ id: string; name: string; company: string | null; email: string; status: string; created_at: string }>;
  staleLeads: Array<{ id: string; name: string; owner: string | null; updated_at: string | null }>;
  summary: string;
};

function daysAgoIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function getFallbackByKey() {
  return new Map<string, string>(websiteContentFallbacks.map((item) => [item.contentKey, item.fallbackValue]));
}

export async function getApprovedWebsiteContent(supabase: PortalClient | null) {
  const fallbackByKey = getFallbackByKey();

  if (!supabase) {
    return fallbackByKey;
  }

  const { data, error } = await supabase
    .from("website_content_items")
    .select("content_key, approved_value")
    .eq("status", "approved")
    .not("approved_value", "is", null);

  if (error) {
    return fallbackByKey;
  }

  for (const item of data ?? []) {
    if (item.approved_value) {
      fallbackByKey.set(item.content_key, item.approved_value);
    }
  }

  return fallbackByKey;
}

export function getWebsiteContentValue(content: Map<string, string>, contentKey: string) {
  return resolveWebsiteContentValue(content, getFallbackByKey(), contentKey);
}

function ensureBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function issueStatus(statusCode: number | null, brokenLinks: Array<{ status: string }>, contentGaps: string[]) {
  if (!statusCode || statusCode >= 500) {
    return "error";
  }

  if (statusCode >= 400 || brokenLinks.some((link) => link.status === "error") || contentGaps.length > 0) {
    return "warning";
  }

  return "ok";
}

async function scanRoute(baseUrl: string, routePath: string, scanId: string) {
  const targetUrl = `${ensureBaseUrl(baseUrl)}${routePath === "/" ? "" : routePath}`;
  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, { cache: "no-store", redirect: "follow" });
    const responseMs = Date.now() - startedAt;
    const html = await response.text();
    const seo = inspectSeo(html);
    const linkFindings = inspectLinks(extractLinksFromHtml(html), managedWebsiteRoutes);
    const brokenLinks = linkFindings.filter((link) => link.status !== "ok");
    const status = issueStatus(response.status, brokenLinks, seo.contentGaps);

    return {
      scan_id: scanId,
      route_path: routePath,
      target_url: targetUrl,
      status,
      status_code: response.status,
      response_ms: responseMs,
      error_message: response.ok ? null : `HTTP ${response.status}`,
      seo_title: seo.title,
      seo_description: seo.description,
      h1: seo.h1,
      broken_links: brokenLinks as unknown as Json,
      content_gaps: seo.contentGaps,
      metadata: { scanned_from: "website_operations_manager" },
    };
  } catch (error) {
    return {
      scan_id: scanId,
      route_path: routePath,
      target_url: targetUrl,
      status: "error",
      status_code: null,
      response_ms: Date.now() - startedAt,
      error_message: error instanceof Error ? error.message : "Route scan failed.",
      seo_title: null,
      seo_description: null,
      h1: null,
      broken_links: [] as unknown as Json,
      content_gaps: ["Route could not be fetched."],
      metadata: { scanned_from: "website_operations_manager" },
    };
  }
}

async function getActiveAdminUserIds(supabase: PortalClient) {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("account_status", "active")
    .in("role", ["platform_admin", "super_admin", "company_admin", "admin"]);

  return [...new Set((data ?? []).map((role) => role.user_id))];
}

async function createWebsiteNotification(
  supabase: PortalClient,
  values: {
    recipientUserId: string;
    title: string;
    body: string;
    priority: "low" | "medium" | "high" | "critical";
    sourceType: string;
    sourceId: string;
    dedupeLabel: string;
    actorUserId?: string | null;
    metadata?: Json;
  },
) {
  const dedupeKey = buildWebsiteNotificationDedupeKey(values.sourceType, values.sourceId, values.dedupeLabel);
  const { data: existing } = await supabase
    .from("portal_notifications")
    .select("id")
    .eq("recipient_user_id", values.recipientUserId)
    .eq("dedupe_key", dedupeKey)
    .neq("status", "archived")
    .maybeSingle();

  if (existing) {
    return null;
  }

  const { data, error } = await supabase
    .from("portal_notifications")
    .insert({
      recipient_user_id: values.recipientUserId,
      title: values.title,
      body: values.body,
      priority: values.priority,
      source_type: values.sourceType,
      source_id: values.sourceId,
      action_href: "/employee/website-operations",
      ai_summary: "Created by Website Operations AI. Decision support only; human approval is required for public changes.",
      dedupe_key: dedupeKey,
      created_by_ai: true,
      metadata: values.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("website_operations_events").insert({
    actor_user_id: values.actorUserId ?? null,
    notification_id: data.id,
    source_type: values.sourceType,
    source_id: values.sourceId,
    event_type: "website_notification_generated",
    title: values.title,
    body: values.body,
    risk_level: values.priority,
    created_by_ai: true,
    metadata: values.metadata ?? {},
  });

  return data;
}

export async function runWebsiteOperationsScan(
  supabase: PortalClient,
  values: { baseUrl: string; actorUserId?: string | null; notifyAdmins?: boolean },
) {
  const scanId = randomUUID();
  const checks = await Promise.all(managedWebsiteRoutes.map((routePath) => scanRoute(values.baseUrl, routePath, scanId)));
  const { data, error } = await supabase.from("website_health_checks").insert(checks).select("*");

  if (error) {
    throw new Error(error.message);
  }

  const createdChecks = data ?? [];
  const unhealthyChecks = createdChecks.filter((check) => check.status !== "ok");
  const brokenLinkCount = createdChecks.reduce((count, check) => count + (Array.isArray(check.broken_links) ? check.broken_links.length : 0), 0);
  const contentGapCount = createdChecks.reduce((count, check) => count + (check.content_gaps?.length ?? 0), 0);

  await supabase.from("website_operations_events").insert({
    actor_user_id: values.actorUserId ?? null,
    source_type: "website_scan",
    source_id: scanId,
    event_type: "website_scan_completed",
    title: "Website scan completed",
    body: `${createdChecks.length} routes scanned. ${unhealthyChecks.length} routes need review. ${brokenLinkCount} link warnings and ${contentGapCount} content gaps found.`,
    risk_level: unhealthyChecks.length > 0 ? "medium" : "low",
    created_by_ai: true,
    metadata: { scan_id: scanId, base_url: values.baseUrl, decision_support_only: true },
  });

  if (values.notifyAdmins && unhealthyChecks.length > 0) {
    const adminUserIds = await getActiveAdminUserIds(supabase);
    await Promise.all(
      adminUserIds.map((recipientUserId) =>
        createWebsiteNotification(supabase, {
          recipientUserId,
          title: "Website scan needs review",
          body: `${unhealthyChecks.length} managed route${unhealthyChecks.length === 1 ? "" : "s"} need review. Public changes require human approval.`,
          priority: "medium",
          sourceType: "website_scan",
          sourceId: "website-scan-review",
          dedupeLabel: "website scan needs review",
          actorUserId: values.actorUserId,
          metadata: { scan_id: scanId, unhealthy_routes: unhealthyChecks.map((check) => check.route_path) },
        }),
      ),
    );
  }

  return { scanId, checks: createdChecks, unhealthyCount: unhealthyChecks.length, brokenLinkCount, contentGapCount };
}

export async function getWebsiteOperationsSnapshot(supabase: PortalClient): Promise<WebsiteOperationsSnapshot> {
  const staleLeadCutoff = daysAgoIsoDate(7);

  const [
    { data: latestChecks },
    { data: contentItems },
    { data: recentEvents },
    { data: recentDemoRequests },
    { data: staleLeads },
    { data: pendingWebsiteProposals },
  ] = await Promise.all([
    supabase.from("website_health_checks").select("*").order("checked_at", { ascending: false }).limit(20),
    supabase.from("website_content_items").select("*").order("updated_at", { ascending: false }).limit(20),
    supabase.from("website_operations_events").select("*").order("created_at", { ascending: false }).limit(10),
    supabase.from("demo_requests").select("id, name, company, email, status, created_at").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("company_clients")
      .select("id, name, owner, updated_at")
      .eq("lifecycle_stage", "Lead")
      .lt("updated_at", staleLeadCutoff)
      .order("updated_at", { ascending: true })
      .limit(8),
    supabase
      .from("workflow_action_proposals")
      .select("id")
      .eq("status", "pending")
      .in("target_table", ["website_content_items", "website_operations_events"]),
  ]);

  const latestByRoute = new Map<string, Database["public"]["Tables"]["website_health_checks"]["Row"]>();
  for (const check of latestChecks ?? []) {
    if (!latestByRoute.has(check.route_path)) {
      latestByRoute.set(check.route_path, check);
    }
  }

  const routeChecks = [...latestByRoute.values()];
  const brokenLinks = routeChecks.reduce((count, check) => count + (Array.isArray(check.broken_links) ? check.broken_links.length : 0), 0);
  const contentGaps = routeChecks.reduce((count, check) => count + (check.content_gaps?.length ?? 0), 0);
  const unhealthyRoutes = routeChecks.filter((check) => check.status !== "ok").length;
  const pendingContentDrafts = (contentItems ?? []).filter((item) => item.status === "draft" || item.status === "pending_approval").length;

  const counts = {
    managedRoutes: managedWebsiteRoutes.length,
    latestScannedRoutes: routeChecks.length,
    unhealthyRoutes,
    brokenLinks,
    contentGaps,
    recentDemoRequests: recentDemoRequests?.filter((request) => request.status === "new").length ?? 0,
    staleLeads: staleLeads?.length ?? 0,
    pendingWebsiteProposals: pendingWebsiteProposals?.length ?? 0,
    pendingContentDrafts,
    recentEvents: recentEvents?.length ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    deployment: {
      status: "needs_reauth",
      label: "Vercel connection needs re-auth",
      detail: "The connected Vercel scope returned 403 during planning, so V1 does not rely on live deployment automation.",
    },
    counts,
    latestChecks: routeChecks,
    contentItems: contentItems ?? [],
    recentEvents: recentEvents ?? [],
    recentDemoRequests: (recentDemoRequests ?? []).map(r => ({ ...r, status: r.status ?? "", created_at: r.created_at ?? "" })),
    staleLeads: staleLeads ?? [],
    summary:
      `Website Operations is tracking ${counts.managedRoutes} managed routes, ${counts.unhealthyRoutes} route review item${counts.unhealthyRoutes === 1 ? "" : "s"}, ` +
      `${counts.brokenLinks} link warning${counts.brokenLinks === 1 ? "" : "s"}, ${counts.contentGaps} content gap${counts.contentGaps === 1 ? "" : "s"}, ` +
      `${counts.recentDemoRequests} new demo request${counts.recentDemoRequests === 1 ? "" : "s"}, and ${counts.pendingWebsiteProposals} pending website proposal${counts.pendingWebsiteProposals === 1 ? "" : "s"}.`,
  };
}

export function buildWebsiteContentDraft(context: string) {
  return {
    title: "Human-reviewed website content draft",
    body:
      `Draft context: ${context}\n\n` +
      "Recommended language should stay factual, avoid final legal or safety guarantees, and preserve the existing human-review disclaimer. " +
      `Relevant product areas include ${products.map((product) => product.title).slice(0, 4).join(", ")}. ` +
      `Public contact remains ${CONTACT_EMAIL}. Core positioning: ${whyReliance.slice(0, 3).join("; ")}.`,
    guardrail: "Decision support only. A human must approve content before it appears on the public website.",
  };
}
