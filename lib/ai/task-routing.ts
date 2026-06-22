import "server-only";

type WorkflowActionHrefInput = {
  sourceType: string | null | undefined;
  sourceId: string | null | undefined;
  ownerUserId?: string | null;
  isAdmin?: boolean;
  fallbackHref?: string;
};

const fallbackEmployeeHref = "/employee/ai";

export function cleanEmployeeActionHref(href: string | null | undefined, fallbackHref = fallbackEmployeeHref) {
  if (!href) {
    return fallbackHref;
  }

  try {
    const url = new URL(href, "https://reliance.local");

    if (url.origin !== "https://reliance.local" || (url.pathname !== "/employee" && !url.pathname.startsWith("/employee/"))) {
      return fallbackHref;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallbackHref;
  }
}

export function getWorkflowActionHref({
  sourceType,
  sourceId,
  ownerUserId,
  isAdmin = false,
  fallbackHref = fallbackEmployeeHref,
}: WorkflowActionHrefInput) {
  if (!sourceType || !sourceId) {
    return fallbackHref;
  }

  switch (sourceType) {
    case "demo_request":
      return "/employee/inbox";
    case "company_client":
      return `/employee/clients/${sourceId}`;
    case "company_checklist_item":
      return `/employee/checklist#checklist-item-${sourceId}`;
    case "company_operations_record":
      return `/employee/operations#operations-record-${sourceId}`;
    case "company_legal_issue":
      return `/employee/legal-issues#legal-issue-${sourceId}`;
    case "employee_time_card":
      return `/employee/time-cards#time-card-${sourceId}`;
    case "employee_document_assignment":
      return isAdmin && ownerUserId
        ? `/employee/users/${ownerUserId}#hr-assignment-${sourceId}`
        : `/employee/hr-onboarding#hr-assignment-${sourceId}`;
    case "employee_onboarding_profile":
      return isAdmin && ownerUserId ? `/employee/users/${ownerUserId}` : "/employee/hr-onboarding";
    case "employee_payroll_setup_task":
      return isAdmin && ownerUserId ? `/employee/users/${ownerUserId}#payroll-setup` : "/employee/ai";
    case "hr_candidate_intake":
      return `/employee/users#candidate-${sourceId}`;
    case "hr_compliance_requirement":
      return `/employee/hr-documents#compliance-requirement-${sourceId}`;
    case "website_health_check":
    case "website_content_item":
    case "website_operations_event":
    case "website_scan":
      return "/employee/website-operations";
    case "workflow_action_proposal":
      return `/employee/ai#workflow-proposal-${sourceId}`;
    case "platform_sprint":
      return "/employee/platform/sprint";
    case "platform_release":
      return "/employee/platform/releases";
    case "platform_qa":
      return "/employee/platform/qa";
    case "platform_billing":
      return "/employee/platform/billing";
    case "platform_audit":
      return "/employee/platform/audit";
    case "platform_infrastructure":
      return "/employee/platform/infrastructure";
    case "platform_packages":
      return "/employee/platform/packages";
    default:
      return fallbackHref;
  }
}

export function getWorkflowSourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "demo_request":
    case "company_client":
      return "Commercial";
    case "company_checklist_item":
      return "Launch";
    case "company_operations_record":
      return "Operations";
    case "company_legal_issue":
      return "Governance";
    case "employee_time_card":
    case "employee_document_assignment":
    case "employee_onboarding_profile":
    case "employee_payroll_setup_task":
    case "hr_candidate_intake":
    case "hr_compliance_requirement":
      return "People / HR";
    case "employee_chat_message":
      return "Chat";
    case "workflow_action_proposal":
      return "AI Proposal";
    case "website_health_check":
    case "website_content_item":
    case "website_operations_event":
    case "website_scan":
      return "Website";
    case "platform_sprint":
    case "platform_release":
    case "platform_qa":
    case "platform_billing":
    case "platform_audit":
    case "platform_infrastructure":
    case "platform_packages":
      return "Platform";
    default:
      return "AI Notification";
  }
}
