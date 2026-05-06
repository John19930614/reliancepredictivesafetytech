import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type PortalClient = SupabaseClient<Database>;

export type CommandPriorityItem = {
  title: string;
  label: string;
  href: string;
  priority: "low" | "medium" | "high" | "critical";
  detail: string;
  sourceType: string;
  sourceId: string;
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
  return priorityRank(second.priority) - priorityRank(first.priority) || first.title.localeCompare(second.title);
}

export async function getCommandSnapshot(supabase: PortalClient, userId: string): Promise<CommandSnapshot> {
  const staleLeadCutoff = daysAgoIsoDate(7);
  const dueSoonCutoff = new Date();
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + 7);
  const dueSoonIsoDate = dueSoonCutoff.toISOString().slice(0, 10);

  const [
    { data: newDemoRequests },
    { data: staleLeads },
    { data: blockedChecklistItems },
    { data: highPriorityOperations },
    { data: openLegalIssues },
    { data: submittedTimeCards },
    { data: hrReviewAssignments },
    { data: pendingWorkflowProposals },
    { count: unreadNotifications },
  ] = await Promise.all([
    supabase.from("demo_requests").select("id, name, company, email, message, created_at").eq("status", "new").order("created_at", { ascending: false }).limit(8),
    supabase
      .from("company_clients")
      .select("id, name, owner, lifecycle_stage, updated_at")
      .eq("lifecycle_stage", "Lead")
      .lt("updated_at", staleLeadCutoff)
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
      .select("id, employee_user_id, week_start, week_end, submitted_at")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
      .limit(8),
    supabase
      .from("employee_document_assignments")
      .select("id, user_id, verification_status, due_date, rejection_reason")
      .in("verification_status", ["pending_review", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("workflow_action_proposals")
      .select("id, title, target_table, risk_level, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("portal_notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_user_id", userId)
      .eq("status", "unread"),
  ]);

  const priorityItems: CommandPriorityItem[] = [
    ...((newDemoRequests ?? []).map((request) => ({
      title: request.company || request.name,
      label: "New demo request",
      href: "/employee/inbox",
      priority: "high" as const,
      detail: `${request.name} - ${request.email}`,
      sourceType: "demo_request",
      sourceId: request.id,
    }))),
    ...((staleLeads ?? []).map((lead) => ({
      title: lead.name,
      label: "Stale lead",
      href: `/employee/clients/${lead.id}`,
      priority: "medium" as const,
      detail: `Lead untouched since ${formatDate(lead.updated_at)} - ${lead.owner || "unassigned"}`,
      sourceType: "company_client",
      sourceId: lead.id,
    }))),
    ...((blockedChecklistItems ?? []).map((item) => ({
      title: item.title,
      label: "Blocked checklist",
      href: "/employee/checklist",
      priority: "high" as const,
      detail: `${item.owner || "Unassigned"} - due ${formatDate(item.due_date)}`,
      sourceType: "company_checklist_item",
      sourceId: item.id,
    }))),
    ...((highPriorityOperations ?? []).map((record) => ({
      title: record.title,
      label: `${record.priority} operations`,
      href: "/employee/operations",
      priority: record.priority === "Critical" ? ("critical" as const) : ("high" as const),
      detail: `${record.status} - ${record.owner || "unassigned"} - due ${formatDate(record.due_date)}`,
      sourceType: "company_operations_record",
      sourceId: record.id,
    }))),
    ...((openLegalIssues ?? []).map((issue) => ({
      title: issue.title,
      label: `${issue.severity} legal`,
      href: "/employee/legal-issues",
      priority: issue.severity === "Critical" ? ("critical" as const) : issue.severity === "High" ? ("high" as const) : ("medium" as const),
      detail: `${issue.status} - ${issue.owner || "unassigned"} - due ${formatDate(issue.due_date)}`,
      sourceType: "company_legal_issue",
      sourceId: issue.id,
    }))),
    ...((submittedTimeCards ?? []).map((card) => ({
      title: `Time card ${formatDate(card.week_start)}-${formatDate(card.week_end)}`,
      label: "Time card review",
      href: "/employee/time-cards",
      priority: "medium" as const,
      detail: `Submitted ${formatDate(card.submitted_at)} by ${card.employee_user_id?.slice(0, 8) ?? "unknown"}`,
      sourceType: "employee_time_card",
      sourceId: card.id,
    }))),
    ...((hrReviewAssignments ?? []).map((assignment) => ({
      title: `HR document ${assignment.verification_status.replace("_", " ")}`,
      label: "HR review",
      href: `/employee/users/${assignment.user_id}`,
      priority: assignment.verification_status === "rejected" ? ("high" as const) : ("medium" as const),
      detail: assignment.rejection_reason || `Due ${formatDate(assignment.due_date)}`,
      sourceType: "employee_document_assignment",
      sourceId: assignment.id,
    }))),
  ].sort(comparePriorityItems).slice(0, 12);

  const counts = {
    newDemoRequests: newDemoRequests?.length ?? 0,
    staleLeads: staleLeads?.length ?? 0,
    blockedChecklistItems: blockedChecklistItems?.length ?? 0,
    highPriorityOperations: highPriorityOperations?.length ?? 0,
    openLegalIssues: openLegalIssues?.length ?? 0,
    submittedTimeCards: submittedTimeCards?.length ?? 0,
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
      `${counts.submittedTimeCards} submitted time cards, and ${counts.hrReviewItems} HR review items.`,
  };
}
