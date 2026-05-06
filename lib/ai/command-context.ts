import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isPortalAdminRole } from "@/lib/user-management";

type PortalClient = SupabaseClient<Database>;

export type CommandPriorityItem = {
  title: string;
  label: string;
  href: string;
  actionHref: string;
  priority: "low" | "medium" | "high" | "critical";
  detail: string;
  owner: string | null;
  dueDate: string | null;
  status: string;
  sourceLabel: string;
  sourceType: string;
  sourceId: string;
  reviewRequired: boolean;
};

export type CommandSnapshot = {
  generatedAt: string;
  counts: {
    newDemoRequests: number;
    staleLeads: number;
    blockedChecklistItems: number;
    highPriorityOperations: number;
    openLegalIssues: number;
    submittedTimeCards: number;
    hrReviewItems: number;
    pendingWorkflowProposals: number;
    unreadNotifications: number;
  };
  priorityItems: CommandPriorityItem[];
  summary: string;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function priorityRank(priority: CommandPriorityItem["priority"]) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority];
}

function comparePriorityItems(first: CommandPriorityItem, second: CommandPriorityItem) {
  const priorityDelta = priorityRank(second.priority) - priorityRank(first.priority);
  if (priorityDelta !== 0) return priorityDelta;
  if (first.reviewRequired !== second.reviewRequired) return first.reviewRequired ? -1 : 1;
  if (first.dueDate && second.dueDate) return first.dueDate.localeCompare(second.dueDate);
  if (first.dueDate) return -1;
  if (second.dueDate) return 1;
  return first.title.localeCompare(second.title);
}

function buildPriorityItem(item: Omit<CommandPriorityItem, "actionHref"> & { actionHref?: string }): CommandPriorityItem {
  return {
    ...item,
    actionHref: item.actionHref ?? item.href,
  };
}

export async function getCommandSnapshot(supabase: PortalClient, userId: string): Promise<CommandSnapshot> {
  const staleLeadCutoff = daysAgoIsoDate(7);
  const dueSoonCutoff = new Date();
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 7);
  const dueSoonIsoDate = dueSoonCutoff.toISOString().slice(0, 10);

  const { data: currentRole } = await supabase
    .from("user_roles")
    .select("role, account_status")
    .eq("user_id", userId)
    .maybeSingle();
  const isAdmin = currentRole?.account_status === "active" && isPortalAdminRole(currentRole.role);

  const [
    { data: newDemoRequests },
    { data: activeLeads },
    { data: blockedChecklistItems },
    { data: highPriorityOperations },
    { data: openLegalIssues },
    { data: actionableTimeCards },
    { data: hrReviewAssignments },
    { data: pendingWorkflowProposals },
    { data: unreadNotificationRows, count: unreadNotifications },
  ] = await Promise.all([
    supabase.from("demo_requests").select("id, name, company, email, message, created_at").eq("status", "new").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("company_clients")
      .select("id, name, owner, lifecycle_stage, updated_at")
      .eq("lifecycle_stage", "Lead")
      .order("updated_at", { ascending: true })
      .limit(8),
    supabase
      .from("company_checklist_items")
      .select("id, title, owner, due_date, status")
      .eq("status", "Blocked")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("company_operations_records")
      .select("id, title, priority, status, owner, due_date")
      .in("priority", ["High", "Critical"])
      .neq("status", "Archived")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("company_legal_issues")
      .select("id, title, severity, status, owner, due_date")
      .in("status", ["Open", "In Review", "Waiting"])
      .lte("due_date", dueSoonIsoDate)
      .order("due_date", { ascending: true })
      .limit(8),
    supabase
      .from("employee_time_cards")
      .select("id, employee_user_id, week_start, week_end, submitted_at, status")
      .in("status", ["submitted", "rejected"])
      .order("submitted_at", { ascending: true })
      .limit(8),
    supabase
      .from("employee_document_assignments")
      .select("id, user_id, status, verification_status, due_date, rejection_reason")
      .or("status.eq.pending,verification_status.in.(pending_review,rejected,not_submitted)")
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("workflow_action_proposals")
      .select("id, title, target_table, risk_level, status, created_at, target_user_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("portal_notifications")
      .select("id, title, body, priority, source_type, source_id, action_href, status, created_at", { count: "exact" })
      .eq("recipient_user_id", userId)
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const priorityItems: CommandPriorityItem[] = [
    ...((newDemoRequests ?? []).map((request) => ({
      actionHref: "/employee/inbox",
      title: request.company || request.name,
      label: "New demo request",
      href: "/employee/inbox",
      priority: "high" as const,
      detail: `${request.name} - ${request.email}`,
      owner: null,
      dueDate: request.created_at,
      status: "new",
      sourceLabel: "Commercial",
      sourceType: "demo_request",
      sourceId: request.id,
      reviewRequired: true,
    }))),
    ...((activeLeads ?? []).map((lead) => {
      const isStale = lead.updated_at ? lead.updated_at < staleLeadCutoff : true;

      return {
      title: lead.name,
      label: isStale ? "Stale lead" : "Lead follow-up",
      href: `/employee/clients/${lead.id}`,
      priority: isStale ? ("medium" as const) : ("low" as const),
      detail: `${isStale ? "Untouched" : "Updated"} ${formatDate(lead.updated_at)} - ${lead.owner || "unassigned"}`,
      owner: lead.owner,
      dueDate: lead.updated_at,
      status: lead.lifecycle_stage ?? "Lead",
      sourceLabel: "Commercial",
      sourceType: "company_client",
      sourceId: lead.id,
      reviewRequired: false,
      };
    })),
    ...((blockedChecklistItems ?? []).map((item) => ({
      title: item.title,
      label: "Blocked checklist",
      href: "/employee/checklist",
      priority: "high" as const,
      detail: `${item.owner || "Unassigned"} - due ${formatDate(item.due_date)}`,
      owner: item.owner,
      dueDate: item.due_date,
      status: item.status ?? "Blocked",
      sourceLabel: "Launch",
      sourceType: "company_checklist_item",
      sourceId: item.id,
      reviewRequired: false,
    }))),
    ...((highPriorityOperations ?? []).map((record) => ({
      title: record.title,
      label: `${record.priority} operations`,
      href: "/employee/operations",
      priority: record.priority === "Critical" ? ("critical" as const) : ("high" as const),
      detail: `${record.status} - ${record.owner || "unassigned"} - due ${formatDate(record.due_date)}`,
      owner: record.owner,
      dueDate: record.due_date,
      status: record.status ?? "Open",
      sourceLabel: "Operations",
      sourceType: "company_operations_record",
      sourceId: record.id,
      reviewRequired: false,
    }))),
    ...((openLegalIssues ?? []).map((issue) => ({
      title: issue.title,
      label: `${issue.severity} legal`,
      href: "/employee/legal-issues",
      priority: issue.severity === "Critical" ? ("critical" as const) : issue.severity === "High" ? ("high" as const) : ("medium" as const),
      detail: `${issue.status} - ${issue.owner || "unassigned"} - due ${formatDate(issue.due_date)}`,
      owner: issue.owner,
      dueDate: issue.due_date,
      status: issue.status ?? "Open",
      sourceLabel: "Governance",
      sourceType: "company_legal_issue",
      sourceId: issue.id,
      reviewRequired: true,
    }))),
    ...((actionableTimeCards ?? []).map((card) => ({
      title: `Time card ${formatDate(card.week_start)}-${formatDate(card.week_end)}`,
      label: card.status === "rejected" ? "Time card correction" : "Time card review",
      href: "/employee/time-cards",
      priority: card.status === "rejected" ? ("high" as const) : ("medium" as const),
      detail: `${card.status === "rejected" ? "Rejected" : "Submitted"} ${formatDate(card.submitted_at)} by ${card.employee_user_id?.slice(0, 8) ?? "unknown"}`,
      owner: card.employee_user_id,
      dueDate: card.submitted_at ?? card.week_end,
      status: card.status ?? "submitted",
      sourceLabel: "People",
      sourceType: "employee_time_card",
      sourceId: card.id,
      reviewRequired: card.status === "submitted",
    }))),
    ...((hrReviewAssignments ?? []).map((assignment) => ({
      title: `HR document ${assignment.verification_status.replace("_", " ")}`,
      label:
        assignment.verification_status === "pending_review"
          ? "HR review"
          : assignment.verification_status === "rejected"
            ? "HR correction"
            : "HR document required",
      href: isAdmin ? `/employee/users/${assignment.user_id}` : "/employee/hr-onboarding",
      priority:
        assignment.verification_status === "rejected"
          ? ("high" as const)
          : assignment.verification_status === "pending_review"
            ? ("medium" as const)
            : ("low" as const),
      detail: assignment.rejection_reason || `Due ${formatDate(assignment.due_date)}`,
      owner: assignment.user_id,
      dueDate: assignment.due_date,
      status: assignment.status ?? assignment.verification_status,
      sourceLabel: "People",
      sourceType: "employee_document_assignment",
      sourceId: assignment.id,
      reviewRequired: assignment.verification_status === "pending_review",
    }))),
    ...((pendingWorkflowProposals ?? []).map((proposal) => ({
      title: proposal.title,
      label: "Workflow proposal",
      href: "/employee/ai",
      priority: proposal.risk_level as CommandPriorityItem["priority"],
      detail: `${proposal.target_table} proposal created ${formatDate(proposal.created_at)}`,
      owner: proposal.target_user_id,
      dueDate: proposal.created_at,
      status: proposal.status ?? "pending",
      sourceLabel: "AI Proposal",
      sourceType: "workflow_action_proposal",
      sourceId: proposal.id,
      reviewRequired: true,
    }))),
    ...((unreadNotificationRows ?? []).map((notification) => ({
      title: notification.title,
      label: "Unread notification",
      href: notification.action_href ?? "/employee/ai",
      priority: notification.priority as CommandPriorityItem["priority"],
      detail: notification.body,
      owner: userId,
      dueDate: notification.created_at,
      status: notification.status ?? "unread",
      sourceLabel: notification.source_type === "employee_chat_message" ? "Chat Notification" : "AI Notification",
      sourceType: notification.source_type ?? "portal_notification",
      sourceId: notification.source_id ?? notification.id,
      reviewRequired: false,
    }))),
  ].map(buildPriorityItem).sort(comparePriorityItems).slice(0, 16);

  const counts = {
    newDemoRequests: newDemoRequests?.length ?? 0,
    staleLeads: activeLeads?.filter((lead) => !lead.updated_at || lead.updated_at < staleLeadCutoff).length ?? 0,
    blockedChecklistItems: blockedChecklistItems?.length ?? 0,
    highPriorityOperations: highPriorityOperations?.length ?? 0,
    openLegalIssues: openLegalIssues?.length ?? 0,
    submittedTimeCards: actionableTimeCards?.filter((card) => card.status === "submitted").length ?? 0,
    hrReviewItems: hrReviewAssignments?.length ?? 0,
    pendingWorkflowProposals: pendingWorkflowProposals?.length ?? 0,
    unreadNotifications: unreadNotifications ?? 0,
  };

  return {
    generatedAt: new Date().toISOString(),
    counts,
    priorityItems,
    summary:
      `As of ${todayIsoDate()}, the portal has ${counts.newDemoRequests} new demo requests, ` +
      `${counts.highPriorityOperations} high-priority operations records, ${counts.openLegalIssues} legal items due soon, ` +
      `${counts.submittedTimeCards} submitted time cards, and ${counts.hrReviewItems} HR tasks.`,
  };
}
