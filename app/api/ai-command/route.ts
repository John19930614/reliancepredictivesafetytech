import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { getCommandSnapshot } from "@/lib/ai/command-context";
import { validateAIOutput } from "@/lib/ai/gateway";
import { cleanEmployeeActionHref, getWorkflowActionHref } from "@/lib/ai/task-routing";
import { createHrAutomationNotification } from "@/lib/hr-automation";
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
  "hr_candidate_intakes",
  "employee_payroll_setup_tasks",
  "website_content_items",
  "website_operations_events",
] as const;

const aiCommandModel = process.env.AI_COMMAND_MODEL || "openai/gpt-4o";

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

async function getAuthenticatedClient() {
  const supabase = await createClient();

  if (!supabase) {
    throw new HttpError("Supabase is not configured.", 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new HttpError("You must be signed in to use the AI command assistant.", 401);
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

  if (sourceType === "employee_time_card") {
    const { data } = await supabase.from("employee_time_cards").select("*").eq("id", sourceId).maybeSingle();
    const { data: profile } = data?.employee_user_id
      ? await supabase
          .from("employee_profiles")
          .select("display_name, legal_name, email")
          .eq("user_id", data.employee_user_id)
          .maybeSingle()
      : { data: null };
    const employeeName = profile?.display_name || profile?.legal_name || profile?.email || data?.employee_user_id?.slice(0, 8) || "Employee";

    return data
      ? {
          type: sourceType,
          title: `${employeeName} time card`,
          status: data.status,
          summary: `${employeeName} has a ${data.status} time card for ${data.week_start} through ${data.week_end}. Submitted: ${data.submitted_at || "not submitted"}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId }),
        }
      : { error: "Time card not found." };
  }

  if (sourceType === "employee_document_assignment") {
    const { data } = await supabase.from("employee_document_assignments").select("*").eq("id", sourceId).maybeSingle();
    const [{ data: profile }, { data: template }] = await Promise.all([
      data?.user_id
        ? supabase.from("employee_profiles").select("display_name, legal_name, email").eq("user_id", data.user_id).maybeSingle()
        : { data: null },
      data?.template_id ? supabase.from("hr_document_templates").select("title, category").eq("id", data.template_id).maybeSingle() : { data: null },
    ]);
    const employeeName = profile?.display_name || profile?.legal_name || profile?.email || data?.user_id?.slice(0, 8) || "Employee";
    const documentTitle = template?.title || "HR document";

    return data
      ? {
          type: sourceType,
          title: `${documentTitle} for ${employeeName}`,
          status: `${data.status} / ${data.verification_status}`,
          summary:
            `${employeeName} has ${documentTitle} marked ${data.status} with verification ${data.verification_status}. ` +
            `Due: ${data.due_date || "not set"}. ${data.rejection_reason ? `Rejection reason: ${data.rejection_reason}` : ""}`,
          actionHref: getWorkflowActionHref({
            sourceType,
            sourceId,
            ownerUserId: data.user_id,
            isAdmin: true,
          }),
        }
      : { error: "HR assignment not found." };
  }

  if (sourceType === "hr_candidate_intake") {
    const { data } = await supabase.from("hr_candidate_intakes").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.candidate_name,
          status: `${data.status} / ${data.human_decision}`,
          summary:
            `${data.candidate_name} (${data.email}) is a ${data.target_role} candidate in ${data.jurisdiction_state || "an unset state"}. ` +
            `Notes: ${data.notes || "No notes."} Human decision: ${data.human_decision_notes || data.human_decision}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId }),
        }
      : { error: "Candidate intake not found." };
  }

  if (sourceType === "employee_onboarding_profile") {
    const { data } = await supabase.from("employee_profiles").select("*").eq("user_id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.display_name || data.legal_name || data.email || "Employee onboarding",
          status: data.onboarding_status,
          summary:
            `${data.display_name || data.legal_name || data.email || "Employee"} onboarding is ${data.onboarding_status}. ` +
            `Work state: ${data.work_state || "not set"}. Profile status: ${data.profile_status || "active"}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId, ownerUserId: data.user_id, isAdmin: true }),
        }
      : { error: "Employee profile not found." };
  }

  if (sourceType === "employee_payroll_setup_task") {
    const { data } = await supabase.from("employee_payroll_setup_tasks").select("*").eq("id", sourceId).maybeSingle();
    const { data: profile } = data?.user_id
      ? await supabase.from("employee_profiles").select("display_name, legal_name, email").eq("user_id", data.user_id).maybeSingle()
      : { data: null };
    const employeeName = profile?.display_name || profile?.legal_name || profile?.email || data?.user_id?.slice(0, 8) || "Employee";
    return data
      ? {
          type: sourceType,
          title: `${employeeName} payroll setup`,
          status: data.status,
          summary:
            `${employeeName} payroll setup is ${data.status}. State: ${data.jurisdiction_state || "not set"}. ` +
            `W-4 ${data.w4_received ? "received" : "missing"}, I-9 ${data.i9_reviewed ? "reviewed" : "not reviewed"}, ` +
            `direct deposit ${data.direct_deposit_ready ? "ready" : "not ready"}, state new-hire ${data.state_new_hire_reported ? "reported" : "not reported"}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId, ownerUserId: data.user_id, isAdmin: true }),
        }
      : { error: "Payroll setup task not found." };
  }

  if (sourceType === "hr_compliance_requirement") {
    const { data } = await supabase.from("hr_compliance_requirements").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.title,
          status: `${data.review_status} / ${data.active ? "active" : "inactive"}`,
          summary:
            `${data.title} applies at ${data.jurisdiction_level}${data.jurisdiction_state ? ` (${data.jurisdiction_state})` : ""}. ` +
            `Due rule: ${data.due_rule || "not set"}. Retention: ${data.retention_rule || "not set"}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId }),
        }
      : { error: "Compliance requirement not found." };
  }

  if (sourceType === "website_health_check") {
    const { data } = await supabase.from("website_health_checks").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: `${data.route_path} website check`,
          status: data.status,
          summary:
            `Website route ${data.route_path} returned HTTP ${data.status_code ?? "n/a"} in ${data.response_ms ?? 0} ms. ` +
            `${(data.content_gaps?.length ?? 0)} content gaps. Broken links: ${JSON.stringify(data.broken_links)}.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId }),
        }
      : { error: "Website health check not found." };
  }

  if (sourceType === "website_content_item") {
    const { data } = await supabase.from("website_content_items").select("*").eq("id", sourceId).maybeSingle();
    return data
      ? {
          type: sourceType,
          title: data.title,
          status: data.status,
          summary:
            `${data.content_key} controls ${data.route_path}. Draft: ${data.draft_value || "none"}. ` +
            `Approved: ${data.approved_value || "none"}. Public changes require human approval.`,
          actionHref: getWorkflowActionHref({ sourceType, sourceId }),
        }
      : { error: "Website content item not found." };
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

    let messages: UIMessage[];
    try {
      ({ messages } = (await req.json()) as { messages: UIMessage[] });
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
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
            sourceType: z.enum([
              "demo_request",
              "company_client",
              "company_operations_record",
              "company_legal_issue",
              "employee_time_card",
              "employee_document_assignment",
              "hr_candidate_intake",
              "employee_onboarding_profile",
              "employee_payroll_setup_task",
              "hr_compliance_requirement",
              "website_health_check",
              "website_content_item",
            ]),
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
            const gatewayResult = validateAIOutput({ rawOutput: `${title}\n${body}`, promptKey: "createReminderNotification" });
            if (gatewayResult.status === "blocked") {
              return { blocked: true, reason: gatewayResult.blockedReason ?? "AI Gateway safety check failed." };
            }
            const { data, error } = await supabase
              .from("portal_notifications")
              .insert({
                recipient_user_id: user.id,
                title,
                body,
                priority,
                action_href: cleanEmployeeActionHref(actionHref, "/employee/ai"),
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
        createOnboardingNotification: tool({
          description:
            "Create a low-risk HR onboarding notification or ticket for an employee or admin. This must not approve hiring, payroll, eligibility, compliance, discipline, compensation, termination, accommodations, or document verification.",
          inputSchema: z.object({
            recipientUserId: z.string().min(1),
            title: z.string().min(1).max(120),
            body: z.string().min(1).max(500),
            priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
            actionHref: z.string().startsWith("/employee").optional(),
            sourceType: z.enum([
              "hr_candidate_intake",
              "employee_onboarding_profile",
              "employee_document_assignment",
              "employee_payroll_setup_task",
              "hr_compliance_requirement",
              "ai_onboarding_ticket",
            ]),
            sourceId: z.string().optional(),
          }),
          execute: async ({ recipientUserId, title, body, priority, actionHref, sourceType, sourceId }) => {
            const dedupeSourceId = sourceId ?? recipientUserId;
            const notification = await createHrAutomationNotification(supabase, {
              recipientUserId,
              title,
              body,
              priority,
              actionHref: actionHref ?? "/employee/ai",
              sourceType,
              sourceId: sourceId ?? null,
              dedupeKey: `${sourceType}:${dedupeSourceId}:${title.toLowerCase().replace(/\s+/g, "-").slice(0, 64)}`,
              actorUserId: user.id,
              targetUserId: recipientUserId,
              eventType: "ai_onboarding_notification_created",
              metadata: { created_from: "ai_command_assistant" },
            });

            return notification ?? { skipped: true, reason: "A matching onboarding notification already exists." };
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
            const gatewayResult = validateAIOutput({ rawOutput: `${title}\n${description}`, promptKey: "proposeWorkflowAction" });
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
    const message = error instanceof Error ? error.message : "AI command assistant failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
