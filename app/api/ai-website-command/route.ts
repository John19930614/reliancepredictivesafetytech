import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { validateAIOutput } from "@/lib/ai/gateway";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { isPortalAdminRole } from "@/lib/user-management";
import { buildWebsiteContentDraft, getWebsiteOperationsSnapshot } from "@/lib/website-operations";
import { buildWebsiteNotificationDedupeKey } from "@/lib/website-operations/scan-utils";

const websiteProposalTables = [
  "website_content_items",
  "website_operations_events",
  "demo_requests",
  "company_clients",
  "company_operations_records",
] as const;

const websiteAiModel = process.env.AI_COMMAND_MODEL || "openai/gpt-4o-mini";

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function hasAiGatewayAuth() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
}

async function getAuthenticatedAdminClient() {
  const supabase = await createClient();

  if (!supabase) {
    throw new HttpError("Supabase is not configured.", 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new HttpError("You must be signed in to use the Website Operations AI.", 401);
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", user.id)
    .eq("account_status", "active")
    .maybeSingle();

  if (!isPortalAdminRole(role?.role)) {
    throw new HttpError("Admin access is required for Website Operations AI.", 403);
  }

  return { supabase, user };
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedAdminClient();

    if (!hasAiGatewayAuth()) {
      return Response.json(
        { error: "AI Gateway is not configured. Set AI_GATEWAY_API_KEY for local use, or enable Vercel OIDC in deployment." },
        { status: 503 },
      );
    }

    let messages: UIMessage[];
    try {
      ({ messages } = (await req.json()) as { messages: UIMessage[] });
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const budget = await checkAiBudget("website_command");
    if (!budget.allowed) {
      return Response.json({ error: budget.message }, { status: 429 });
    }
    const model = budget.modelOverride ?? websiteAiModel;

    const snapshot = await getWebsiteOperationsSnapshot(supabase);

    const result = streamText({
      model,
      system:
        "You are the Reliance Website Operations AI. You help admins monitor the public website, leads, content drafts, SEO gaps, route health, and deployment risks. " +
        "You may create low-risk internal notifications and draft text. You must not publish public content, send customer messages, update lead/customer business records, deploy, roll back, edit environment variables, change auth, or make legal/safety claims final. " +
        "For public content changes, lead actions, deployment recommendations, and business-record changes, create a workflow proposal for human approval. " +
        "Every safety, legal, compliance, or public-facing recommendation is decision support only and requires human review. " +
        `Current website operations snapshot: ${JSON.stringify(snapshot)}`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      onFinish: async ({ totalUsage }) => {
        await recordAiUsage({
          featureKey: "website_command",
          runSource: "user",
          userId: user.id,
          model,
          inputTokens: totalUsage.inputTokens ?? 0,
          outputTokens: totalUsage.outputTokens ?? 0,
        });
      },
      tools: {
        readWebsiteOperationsSnapshot: tool({
          description: "Read the current website operations snapshot.",
          inputSchema: z.object({}),
          execute: async () => getWebsiteOperationsSnapshot(supabase),
        }),
        summarizeWebsiteRecord: tool({
          description: "Summarize one website content item, health check, event, proposal, lead, or demo request.",
          inputSchema: z.object({
            sourceType: z.enum([
              "website_content_item",
              "website_health_check",
              "website_operations_event",
              "workflow_action_proposal",
              "demo_request",
              "company_client",
            ]),
            sourceId: z.string().min(1),
          }),
          execute: async ({ sourceType, sourceId }) => {
            if (sourceType === "website_content_item") {
              const { data } = await supabase.from("website_content_items").select("*").eq("id", sourceId).maybeSingle();
              return data
                ? {
                    title: data.title,
                    status: data.status,
                    summary: `${data.content_key} on ${data.route_path}. Approved value: ${data.approved_value || "none"}. Draft value: ${data.draft_value || "none"}.`,
                  }
                : { error: "Website content item not found." };
            }

            if (sourceType === "website_health_check") {
              const { data } = await supabase.from("website_health_checks").select("*").eq("id", sourceId).maybeSingle();
              return data
                ? {
                    title: data.route_path,
                    status: data.status,
                    summary: `HTTP ${data.status_code ?? "n/a"} in ${data.response_ms ?? 0} ms. ${(data.content_gaps?.length ?? 0)} content gaps. Broken links: ${JSON.stringify(data.broken_links)}.`,
                  }
                : { error: "Website health check not found." };
            }

            if (sourceType === "website_operations_event") {
              const { data } = await supabase.from("website_operations_events").select("*").eq("id", sourceId).maybeSingle();
              return data ? { title: data.title, status: data.event_type, summary: data.body || "No body." } : { error: "Website event not found." };
            }

            if (sourceType === "workflow_action_proposal") {
              const { data } = await supabase.from("workflow_action_proposals").select("*").eq("id", sourceId).maybeSingle();
              return data
                ? { title: data.title, status: data.status, summary: `${data.action_type} on ${data.target_table}. Patch: ${JSON.stringify(data.proposed_patch)}` }
                : { error: "Workflow proposal not found." };
            }

            if (sourceType === "demo_request") {
              const { data } = await supabase.from("demo_requests").select("*").eq("id", sourceId).maybeSingle();
              return data
                ? { title: data.company || data.name, status: data.status, summary: `${data.name} (${data.email}) requested: ${data.message || "No message."}` }
                : { error: "Demo request not found." };
            }

            const { data } = await supabase.from("company_clients").select("*").eq("id", sourceId).maybeSingle();
            return data
              ? { title: data.name, status: data.lifecycle_stage, summary: `${data.name} owned by ${data.owner || "unassigned"}. Notes: ${data.notes || "No notes."}` }
              : { error: "Client not found." };
          },
        }),
        draftWebsiteContentRevision: tool({
          description: "Draft approval-gated website copy. This only drafts; it does not publish.",
          inputSchema: z.object({
            contentKey: z.string().min(1),
            context: z.string().min(1).max(1200),
          }),
          execute: async ({ contentKey, context }) => ({
            contentKey,
            ...buildWebsiteContentDraft(context),
          }),
        }),
        createWebsiteReminderNotification: tool({
          description: "Create a low-risk internal website operations reminder for the signed-in admin.",
          inputSchema: z.object({
            title: z.string().min(1).max(120),
            body: z.string().min(1).max(500),
            priority: z.enum(["low", "medium", "high"]).default("medium"),
          }),
          execute: async ({ title, body, priority }) => {
            const gatewayResult = validateAIOutput({
              rawOutput: `${title}\n${body}`,
              promptKey: "createWebsiteReminderNotification",
            });
            if (gatewayResult.status === "blocked") {
              return { blocked: true, reason: gatewayResult.blockedReason ?? "AI Gateway safety check failed." };
            }
            const dedupeKey = buildWebsiteNotificationDedupeKey("ai_website_reminder", user.id, title);
            const { data, error } = await supabase
              .from("portal_notifications")
              .insert({
                recipient_user_id: user.id,
                title,
                body,
                priority,
                action_href: "/employee/website-operations",
                source_type: "ai_website_reminder",
                source_id: user.id,
                dedupe_key: dedupeKey,
                created_by_ai: true,
                ai_summary: "Created by Website Operations AI. Decision support only.",
                metadata: { created_from: "ai_website_command" },
              })
              .select("*")
              .single();

            if (error) {
              if (error.code === "23505") {
                return { skipped: true, reason: "A matching reminder already exists." };
              }
              throw new Error(error.message);
            }

            await supabase.from("website_operations_events").insert({
              actor_user_id: user.id,
              notification_id: data.id,
              source_type: "ai_website_reminder",
              source_id: data.id,
              event_type: "ai_website_reminder_created",
              title,
              body,
              risk_level: priority,
              created_by_ai: true,
              metadata: { created_from: "ai_website_command" },
            });

            return data;
          },
        }),
        proposeWebsiteOperation: tool({
          description: "Create a human approval proposal for website content, lead, task, or deployment recommendations. This does not mutate the target record.",
          inputSchema: z.object({
            title: z.string().min(1).max(160),
            description: z.string().min(1).max(1200),
            actionType: z.string().min(1).max(80),
            targetTable: z.enum(websiteProposalTables),
            targetRecordId: z.string().optional(),
            proposedPatch: z.record(z.string(), z.unknown()).default({}),
            riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
          }),
          execute: async ({ title, description, actionType, targetTable, targetRecordId, proposedPatch, riskLevel }) => {
            // The patch is validated alongside the prose. Its values are what
            // eventually get written into business tables — for this assistant,
            // into live public website copy — so screening only the title and
            // description would leave the payload itself unchecked.
            const gatewayResult = validateAIOutput({
              rawOutput: `${title}\n${description}\n${JSON.stringify(proposedPatch)}`,
              promptKey: "proposeWebsiteOperation",
            });
            if (gatewayResult.status === "blocked") {
              return { blocked: true, reason: gatewayResult.blockedReason ?? "AI Gateway safety check failed." };
            }
            const { data, error } = await supabase
              .from("workflow_action_proposals")
              .insert({
                created_by_user_id: user.id,
                target_user_id: user.id,
                title,
                description,
                action_type: actionType,
                target_table: targetTable,
                target_record_id: targetRecordId ?? null,
                proposed_patch: proposedPatch as Json,
                risk_level: riskLevel,
                created_by_ai: true,
                metadata: {
                  created_from: "ai_website_command",
                  human_approval_required: true,
                  decision_support_only: true,
                },
              })
              .select("*")
              .single();

            if (error) {
              throw new Error(error.message);
            }

            await supabase.from("website_operations_events").insert({
              actor_user_id: user.id,
              proposal_id: data.id,
              source_type: "workflow_action_proposal",
              source_id: data.id,
              event_type: "website_proposal_created",
              title,
              body: description,
              risk_level: riskLevel,
              created_by_ai: true,
              metadata: { target_table: targetTable, target_record_id: targetRecordId ?? null },
            });

            return data;
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("too many requests")) {
        return Response.json({ error: "AI service is rate-limited. Please try again in a moment." }, { status: 429 });
      }
      if (msg.includes("no such model") || msg.includes("model not found") || msg.includes("does not exist")) {
        return Response.json({ error: "Configured AI model is unavailable." }, { status: 503 });
      }
      if (msg.includes("api key") || msg.includes("authentication failed") || msg.includes("invalid key")) {
        return Response.json({ error: "AI Gateway authentication failed. Check AI_GATEWAY_API_KEY." }, { status: 503 });
      }
    }
    const message = error instanceof Error ? error.message : "Website Operations AI failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
