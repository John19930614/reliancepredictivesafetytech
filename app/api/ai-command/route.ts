import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { getCommandSnapshot } from "@/lib/ai/command-context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const allowedProposalTables = [
  "demo_requests",
  "company_clients",
  "company_operations_records",
  "company_legal_issues",
  "company_checklist_items",
  "client_onboarding_items",
  "company_documents",
  "employee_time_cards",
  "employee_document_assignments",
] as const;

const aiCommandModel = process.env.AI_COMMAND_MODEL || "openai/gpt-5";

function hasAiGatewayAuth() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1");
}

async function getAuthenticatedClient() {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to use the AI command assistant.");
  }

  return { supabase, user };
}

async function summarizeRecord(sourceType: string, sourceId: string) {
  const { supabase } = await getAuthenticatedClient();

  if (sourceType === "demo_request") {
    const { data } = await supabase.from("demo_requests").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.company || data.name,
          status: data.status,
          summary: `${data.name} requested information from ${data.company || "an unnamed company"}. Products: ${(data.interested_products ?? []).join(", ") || "not specified"}. Message: ${data.message || "No message provided."}`,
        }
      : { error: "Demo request not found." };
  }

  if (sourceType === "company_client") {
    const { data } = await supabase.from("company_clients").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.name,
          status: data.lifecycle_stage,
          summary: `${data.name} is in ${data.lifecycle_stage}. Owner: ${data.owner || "unassigned"}. Notes: ${data.notes || "No notes."}`,
        }
      : { error: "Client record not found." };
  }

  if (sourceType === "company_operations_record") {
    const { data } = await supabase.from("company_operations_records").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.title,
          status: data.status,
          summary: `${data.priority} priority ${data.category} record. Owner: ${data.owner || "unassigned"}. Description: ${data.description || "No description."}`,
        }
      : { error: "Operations record not found." };
  }

  if (sourceType === "company_legal_issue") {
    const { data } = await supabase.from("company_legal_issues").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.title,
          status: data.status,
          summary: `${data.severity} legal issue due ${data.due_date || "not set"}. Owner: ${data.owner || "unassigned"}. Description: ${data.description || "No description."}`,
        }
      : { error: "Legal issue not found." };
  }

  return { error: "This record type is not supported yet." };
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await getAuthenticatedClient();

    if (!hasAiGatewayAuth()) {
      return Response.json(
        { error: "AI Gateway is not configured. Set AI_GATEWAY_API_KEY for local use, or enable Vercel OIDC in deployment." },
        { status: 503 },
      );
    }

    const { messages }: { messages: UIMessage[] } = await req.json();
    const snapshot = await getCommandSnapshot(supabase, user.id);

    const result = streamText({
      model: aiCommandModel,
      system:
        "You are the Reliance internal AI command assistant. Help employees triage notifications, workflows, leads, HR review items, time cards, documents, legal issues, and operations records. " +
        "AI output is decision support only. Never claim to provide final safety, legal, HR, payroll, or compliance advice. " +
        "You may create low-risk reminder notifications. For workflow changes, create a proposal instead of updating business records directly. " +
        `Current command snapshot: ${JSON.stringify(snapshot)}`,
      messages: await convertToModelMessages(messages),
      stopWhen: stepCountIs(5),
      tools: {
        readCommandSnapshot: tool({
          description: "Read the current command-center snapshot and priority queue.",
          inputSchema: z.object({}),
          execute: async () => getCommandSnapshot(supabase, user.id),
        }),
        summarizeRecord: tool({
          description: "Summarize one supported portal record by source type and id.",
          inputSchema: z.object({
            sourceType: z.enum(["demo_request", "company_client", "company_operations_record", "company_legal_issue"]),
            sourceId: z.string().min(1),
          }),
          execute: async ({ sourceType, sourceId }) => summarizeRecord(sourceType, sourceId),
        }),
        rankUrgentWork: tool({
          description: "Return the AI-ranked urgent work queue from current portal data.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(12).default(8) }),
          execute: async ({ limit }) => {
            const nextSnapshot = await getCommandSnapshot(supabase, user.id);
            return nextSnapshot.priorityItems.slice(0, limit);
          },
        }),
        draftFollowUpEmail: tool({
          description: "Draft a follow-up email for a lead or request. This only drafts text; it does not send email.",
          inputSchema: z.object({
            recipientName: z.string().min(1),
            companyName: z.string().optional(),
            context: z.string().min(1),
          }),
          execute: async ({ recipientName, companyName, context }) => ({
            subject: `Following up${companyName ? ` with ${companyName}` : ""}`,
            body:
              `Hi ${recipientName},\n\n` +
              `Thank you for reaching out to Reliance Predictive Safety Technologies. ${context}\n\n` +
              "A good next step would be to schedule a short walkthrough so we can understand your safety documentation and workflow priorities.\n\n" +
              "Best,\nReliance Predictive Safety Technologies",
          }),
        }),
        createReminderNotification: tool({
          description: "Create a low-risk in-app reminder notification for the signed-in user.",
          inputSchema: z.object({
            title: z.string().min(1).max(120),
            body: z.string().min(1).max(500),
            priority: z.enum(["low", "medium", "high"]).default("medium"),
            actionHref: z.string().startsWith("/employee").optional(),
          }),
          execute: async ({ title, body, priority, actionHref }) => {
            const { data, error } = await supabase
              .from("portal_notifications")
              .insert({
                recipient_user_id: user.id,
                title,
                body,
                priority,
                action_href: actionHref ?? "/employee/ai",
                source_type: "ai_reminder",
                created_by_ai: true,
                ai_summary: "Created by the AI command assistant at the user's request.",
                metadata: { created_from: "ai_command_assistant" },
              })
              .select("*")
              .single();

            if (error) {
              throw new Error(error.message);
            }

            return data;
          },
        }),
        proposeWorkflowAction: tool({
          description: "Create a workflow action proposal for human approval. Do not directly update business records.",
          inputSchema: z.object({
            title: z.string().min(1).max(160),
            description: z.string().min(1).max(1200),
            actionType: z.string().min(1).max(80),
            targetTable: z.enum(allowedProposalTables),
            targetRecordId: z.string().optional(),
            proposedPatch: z.record(z.string(), z.unknown()).default({}),
            riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
          }),
          execute: async ({ title, description, actionType, targetTable, targetRecordId, proposedPatch, riskLevel }) => {
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
                metadata: { created_from: "ai_command_assistant" },
              })
              .select("*")
              .single();

            if (error) {
              throw new Error(error.message);
            }

            return data;
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI command assistant failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
