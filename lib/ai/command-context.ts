import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanEmployeeActionHref, getWorkflowActionHref, getWorkflowSourceLabel } from "@/lib/ai/task-routing";
import { sortPriorityItems } from "@/lib/ai/priority-ranking";
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

type RawCommandPriorityItem = Omit<CommandPriorityItem, "actionHref"> & { actionHref?: string };

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
    onboardingCandidates: number;
    invitedUsers: number;
    incompleteOnboarding: number;
    pendingOnboardingReviews: number;
    payrollSetupGaps: number;
    stateComplianceReviews: number;
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

function buildPriorityItem(item: RawCommandPriorityItem): CommandPriorityItem {
  return {
    ...item,
    actionHref: cleanEmployeeActionHref(item.actionHref ?? item.href),
  };
}

function getPersonName(profile: { display_name?: string | null; legal_name?: string | null; email?: string | null } | undefined, userId?: string | null) {
  return profile?.display_name || profile?.legal_name || profile?.email || userId?.slice(0, 8) || "Employee";
}

function getHrAssignmentLabel(verificationStatus: string | null | undefined, status: string | null | undefined) {
  if (verificationStatus === "pending_review") {
    return "Review HR upload";
  }

  if (verificationStatus === "rejected") {
    return "Employee HR correction";
  }

  if (verificationStatus === "not_submitted" || status === "pending") {
    return "Employee HR document needed";
  }

  return "HR onboarding task";
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
    { data: candidateIntakes },
    { count: invitedCandidateCount },
    { data: incompleteProfiles },
    { data: payrollSetupTasks },
    { data: stateComplianceReviews },
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
      .select("id, user_id, template_id, status, verification_status, due_date, rejection_reason")
      .or("status.eq.pending,verification_status.in.(pending_review,rejected,not_submitted)")
      .order("updated_at", { ascending: false })
      .limit(8),
    isAdmin
      ? supabase
          .from("hr_candidate_intakes")
          .select("id, candidate_name, email, target_role, jurisdiction_state, status, human_decision, updated_at, created_by")
          .in("status", ["new", "screening", "approved_for_invite"])
          .order("updated_at", { ascending: true })
          .limit(8)
      : { data: [] },
    isAdmin
      ? supabase.from("hr_candidate_intakes").select("id", { count: "exact", head: true }).eq("status", "invited")
      : { count: 0 },
    supabase
      .from("employee_profiles")
      .select("user_id, display_name, legal_name, email, onboarding_status, work_state, updated_at")
      .in("onboarding_status", ["not_started", "in_progress"])
      .order("updated_at", { ascending: true })
      .limit(8),
    supabase
      .from("employee_payroll_setup_tasks")
      .select("id, user_id, status, jurisdiction_state, due_date, w4_received, i9_reviewed, direct_deposit_ready, state_new_hire_reported, benefits_reviewed, updated_at")
      .not("status", "in", "(completed,not_required)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    isAdmin
      ? supabase
          .from("hr_compliance_requirements")
          .select("id, title, jurisdiction_state, review_status, active, updated_at")
          .eq("jurisdiction_level", "state")
          .or("active.eq.false,review_status.neq.reviewed")
          .order("sort_order")
          .limit(8)
      : { data: [] },
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

  const peopleUserIds = [
    ...new Set([
      ...((actionableTimeCards ?? []).map((card) => card.employee_user_id).filter(Boolean) as string[]),
      ...((hrReviewAssignments ?? []).map((assignment) => assignment.user_id).filter(Boolean) as string[]),
      ...((incompleteProfiles ?? []).map((profile) => profile.user_id).filter(Boolean) as string[]),
      ...((payrollSetupTasks ?? []).map((task) => task.user_id).filter(Boolean) as string[]),
    ]),
  ];
  const hrTemplateIds = [...new Set((hrReviewAssignments ?? []).map((assignment) => assignment.template_id).filter(Boolean) as string[])];
  const [{ data: peopleProfiles }, { data: hrTemplates }] = await Promise.all([
    peopleUserIds.length > 0
      ? supabase.from("employee_profiles").select("user_id, display_name, legal_name, email").in("user_id", peopleUserIds)
      : { data: [] },
    hrTemplateIds.length > 0
      ? supabase.from("hr_document_templates").select("id, title, category").in("id", hrTemplateIds)
      : { data: [] },
  ]);
  const peopleProfileByUserId = new Map((peopleProfiles ?? []).map((profile) => [profile.user_id, profile]));
  const hrTemplateById = new Map((hrTemplates ?? []).map((template) => [template.id, template]));

  const rawPriorityItems: RawCommandPriorityItem[] = [
    ...((newDemoRequests ?? []).map((request) => ({
      actionHref: getWorkflowActionHref({ sourceType: "demo_request", sourceId: request.id }),
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
      href: getWorkflowActionHref({ sourceType: "company_client", sourceId: lead.id }),
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
      href: getWorkflowActionHref({ sourceType: "company_checklist_item", sourceId: item.id }),
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
      href: getWorkflowActionHref({ sourceType: "company_operations_record", sourceId: record.id }),
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
      href: getWorkflowActionHref({ sourceType: "company_legal_issue", sourceId: issue.id }),
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
    ...((actionableTimeCards ?? []).map((card) => {
      const employeeName = getPersonName(card.employee_user_id ? peopleProfileByUserId.get(card.employee_user_id) : undefined, card.employee_user_id);

      return {
        title: `${employeeName} time card ${formatDate(card.week_start)}-${formatDate(card.week_end)}`,
        label: card.status === "rejected" ? "Employee time-card correction" : "Review submitted time card",
        href: getWorkflowActionHref({ sourceType: "employee_time_card", sourceId: card.id }),
        priority: card.status === "rejected" ? ("high" as const) : ("medium" as const),
        detail: `${card.status === "rejected" ? "Rejected" : "Submitted"} ${formatDate(card.submitted_at)}`,
        owner: card.employee_user_id,
        dueDate: card.submitted_at ?? card.week_end,
        status: card.status ?? "submitted",
        sourceLabel: getWorkflowSourceLabel("employee_time_card"),
        sourceType: "employee_time_card",
        sourceId: card.id,
        reviewRequired: card.status === "submitted",
      };
    })),
    ...((hrReviewAssignments ?? []).map((assignment) => {
      const employeeName = getPersonName(peopleProfileByUserId.get(assignment.user_id), assignment.user_id);
      const templateTitle = hrTemplateById.get(assignment.template_id)?.title ?? "HR document";
      const label = getHrAssignmentLabel(assignment.verification_status, assignment.status);
      const detail = assignment.rejection_reason
        ? `Rejected reason: ${assignment.rejection_reason}`
        : `Employee: ${employeeName} - due ${formatDate(assignment.due_date)}`;

      return {
        title: `${templateTitle} for ${employeeName}`,
        label,
        href: getWorkflowActionHref({
          sourceType: "employee_document_assignment",
          sourceId: assignment.id,
          ownerUserId: assignment.user_id,
          isAdmin,
        }),
        priority:
          assignment.verification_status === "rejected"
            ? ("high" as const)
            : assignment.verification_status === "pending_review"
              ? ("medium" as const)
              : ("low" as const),
        detail,
        owner: assignment.user_id,
        dueDate: assignment.due_date,
        status: assignment.status ?? assignment.verification_status,
        sourceLabel: getWorkflowSourceLabel("employee_document_assignment"),
        sourceType: "employee_document_assignment",
        sourceId: assignment.id,
        reviewRequired: assignment.verification_status === "pending_review",
      };
    })),
    ...((candidateIntakes ?? []).map((candidate) => {
      const stale = candidate.updated_at ? candidate.updated_at.slice(0, 10) < daysAgoIsoDate(5) : true;
      const approved = candidate.status === "approved_for_invite" || candidate.human_decision === "approved_to_invite";

      return {
        title: candidate.candidate_name,
        label: approved ? "Candidate ready for invite" : stale ? "Stale candidate intake" : "Candidate intake",
        href: getWorkflowActionHref({ sourceType: "hr_candidate_intake", sourceId: candidate.id }),
        priority: approved ? ("high" as const) : stale ? ("medium" as const) : ("low" as const),
        detail: `${candidate.email} - ${candidate.target_role} - ${candidate.jurisdiction_state || "state not set"}`,
        owner: candidate.created_by,
        dueDate: candidate.updated_at,
        status: candidate.status,
        sourceLabel: getWorkflowSourceLabel("hr_candidate_intake"),
        sourceType: "hr_candidate_intake",
        sourceId: candidate.id,
        reviewRequired: true,
      };
    })),
    ...((incompleteProfiles ?? []).map((profile) => {
      const employeeName = getPersonName(profile, profile.user_id);

      return {
        title: `${employeeName} onboarding incomplete`,
        label: profile.user_id === userId ? "Finish HR onboarding" : "Employee onboarding incomplete",
        href: getWorkflowActionHref({
          sourceType: "employee_onboarding_profile",
          sourceId: profile.user_id,
          ownerUserId: profile.user_id,
          isAdmin,
        }),
        priority: profile.onboarding_status === "not_started" ? ("medium" as const) : ("low" as const),
        detail: `${profile.email || employeeName} - ${profile.work_state || "state not set"} - last update ${formatDate(profile.updated_at)}`,
        owner: profile.user_id,
        dueDate: profile.updated_at,
        status: profile.onboarding_status,
        sourceLabel: getWorkflowSourceLabel("employee_onboarding_profile"),
        sourceType: "employee_onboarding_profile",
        sourceId: profile.user_id,
        reviewRequired: false,
      };
    })),
    ...((payrollSetupTasks ?? []).map((task) => {
      const profile = peopleProfileByUserId.get(task.user_id);
      const employeeName = getPersonName(profile, task.user_id);
      const checklistComplete =
        task.w4_received && task.i9_reviewed && task.direct_deposit_ready && task.state_new_hire_reported && task.benefits_reviewed;

      return {
        title: `${employeeName} payroll setup`,
        label: checklistComplete ? "Payroll setup ready for review" : "Payroll setup gap",
        href: getWorkflowActionHref({ sourceType: "employee_payroll_setup_task", sourceId: task.id, ownerUserId: task.user_id, isAdmin }),
        priority: task.status === "blocked" ? ("high" as const) : checklistComplete ? ("medium" as const) : ("low" as const),
        detail: `${task.status.replace("_", " ")} - ${task.jurisdiction_state || "state not set"} - due ${formatDate(task.due_date)}`,
        owner: task.user_id,
        dueDate: task.due_date,
        status: task.status,
        sourceLabel: getWorkflowSourceLabel("employee_payroll_setup_task"),
        sourceType: "employee_payroll_setup_task",
        sourceId: task.id,
        reviewRequired: isAdmin,
      };
    })),
    ...((stateComplianceReviews ?? []).map((requirement) => ({
      title: requirement.title,
      label: "State compliance review",
      href: getWorkflowActionHref({ sourceType: "hr_compliance_requirement", sourceId: requirement.id }),
      priority: "medium" as const,
      detail: `${requirement.jurisdiction_state || "State"} - ${requirement.review_status} - ${requirement.active ? "active" : "inactive"}`,
      owner: null,
      dueDate: requirement.updated_at,
      status: requirement.review_status,
      sourceLabel: getWorkflowSourceLabel("hr_compliance_requirement"),
      sourceType: "hr_compliance_requirement",
      sourceId: requirement.id,
      reviewRequired: true,
    }))),
    ...((pendingWorkflowProposals ?? []).map((proposal) => ({
      title: proposal.title,
      label: "Workflow proposal",
      href: getWorkflowActionHref({ sourceType: "workflow_action_proposal", sourceId: proposal.id }),
      priority: proposal.risk_level as CommandPriorityItem["priority"],
      detail: `${proposal.target_table} proposal created ${formatDate(proposal.created_at)}`,
      owner: proposal.target_user_id,
      dueDate: proposal.created_at,
      status: proposal.status ?? "pending",
      sourceLabel: getWorkflowSourceLabel("workflow_action_proposal"),
      sourceType: "workflow_action_proposal",
      sourceId: proposal.id,
      reviewRequired: true,
    }))),
    ...((unreadNotificationRows ?? []).map((notification) => ({
      title: notification.title,
      label: "Unread notification",
      href: cleanEmployeeActionHref(
        notification.action_href ??
          getWorkflowActionHref({
            sourceType: notification.source_type,
            sourceId: notification.source_id ?? notification.id,
            fallbackHref: "/employee/ai",
          }),
      ),
      priority: notification.priority as CommandPriorityItem["priority"],
      detail: notification.body,
      owner: userId,
      dueDate: notification.created_at,
      status: notification.status ?? "unread",
      sourceLabel: getWorkflowSourceLabel(notification.source_type),
      sourceType: notification.source_type ?? "portal_notification",
      sourceId: notification.source_id ?? notification.id,
      reviewRequired: false,
    }))),
  ];
  const priorityItems = sortPriorityItems(rawPriorityItems.map(buildPriorityItem)).slice(0, 16);

  const counts = {
    newDemoRequests: newDemoRequests?.length ?? 0,
    staleLeads: activeLeads?.filter((lead) => !lead.updated_at || lead.updated_at < staleLeadCutoff).length ?? 0,
    blockedChecklistItems: blockedChecklistItems?.length ?? 0,
    highPriorityOperations: highPriorityOperations?.length ?? 0,
    openLegalIssues: openLegalIssues?.length ?? 0,
    submittedTimeCards: actionableTimeCards?.filter((card) => card.status === "submitted").length ?? 0,
    hrReviewItems: hrReviewAssignments?.length ?? 0,
    onboardingCandidates: candidateIntakes?.length ?? 0,
    invitedUsers: invitedCandidateCount ?? 0,
    incompleteOnboarding: incompleteProfiles?.length ?? 0,
    pendingOnboardingReviews: hrReviewAssignments?.filter((assignment) => assignment.verification_status === "pending_review").length ?? 0,
    payrollSetupGaps: payrollSetupTasks?.length ?? 0,
    stateComplianceReviews: stateComplianceReviews?.length ?? 0,
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
      `${counts.submittedTimeCards} submitted time cards, ${counts.hrReviewItems} HR tasks, ` +
      `${counts.onboardingCandidates} candidate intakes, ${counts.incompleteOnboarding} incomplete onboarding profiles, ` +
      `${counts.payrollSetupGaps} payroll setup gaps, and ${counts.stateComplianceReviews} state compliance reviews.`,
  };
}
