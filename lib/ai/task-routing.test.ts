import { describe, expect, it } from "vitest";
import {
  cleanEmployeeActionHref,
  getWorkflowActionHref,
  getWorkflowSourceLabel,
} from "./task-routing";

describe("cleanEmployeeActionHref", () => {
  it("returns valid employee paths unchanged", () => {
    expect(cleanEmployeeActionHref("/employee/ai")).toBe("/employee/ai");
    expect(cleanEmployeeActionHref("/employee/platform/sprint")).toBe("/employee/platform/sprint");
  });

  it("preserves query strings and hashes", () => {
    expect(cleanEmployeeActionHref("/employee/checklist#item-1")).toBe("/employee/checklist#item-1");
    expect(cleanEmployeeActionHref("/employee/work?tab=active")).toBe("/employee/work?tab=active");
  });

  it("returns fallback for null/undefined", () => {
    expect(cleanEmployeeActionHref(null)).toBe("/employee/ai");
    expect(cleanEmployeeActionHref(undefined)).toBe("/employee/ai");
  });

  it("returns fallback for non-employee paths", () => {
    expect(cleanEmployeeActionHref("/admin/settings")).toBe("/employee/ai");
    expect(cleanEmployeeActionHref("/")).toBe("/employee/ai");
  });

  it("returns fallback for external URLs", () => {
    expect(cleanEmployeeActionHref("https://evil.com/steal")).toBe("/employee/ai");
  });

  it("uses custom fallback when provided", () => {
    expect(cleanEmployeeActionHref(null, "/employee/dashboard")).toBe("/employee/dashboard");
  });
});

describe("getWorkflowActionHref", () => {
  it("routes demo_request to inbox", () => {
    expect(getWorkflowActionHref({ sourceType: "demo_request", sourceId: "abc" })).toBe("/employee/inbox");
  });

  it("routes company_client to client detail page", () => {
    expect(getWorkflowActionHref({ sourceType: "company_client", sourceId: "client-1" })).toBe("/employee/clients/client-1");
  });

  it("routes employee_document_assignment to hr-onboarding for non-admin", () => {
    const href = getWorkflowActionHref({ sourceType: "employee_document_assignment", sourceId: "doc-1", isAdmin: false });
    expect(href).toContain("/employee/hr-onboarding");
  });

  it("routes employee_document_assignment to user profile for admin with owner", () => {
    const href = getWorkflowActionHref({ sourceType: "employee_document_assignment", sourceId: "doc-1", isAdmin: true, ownerUserId: "user-99" });
    expect(href).toContain("/employee/users/user-99");
  });

  it("routes website source types to website-operations", () => {
    for (const t of ["website_health_check", "website_content_item", "website_operations_event", "website_scan"]) {
      expect(getWorkflowActionHref({ sourceType: t, sourceId: "x" })).toBe("/employee/website-operations");
    }
  });

  it("returns fallback when sourceType or sourceId is missing", () => {
    expect(getWorkflowActionHref({ sourceType: null, sourceId: "x" })).toBe("/employee/ai");
    expect(getWorkflowActionHref({ sourceType: "demo_request", sourceId: null })).toBe("/employee/ai");
  });

  it("routes platform_sprint to sprint page", () => {
    expect(getWorkflowActionHref({ sourceType: "platform_sprint", sourceId: "sp-1" })).toBe("/employee/platform/sprint");
  });

  it("routes platform_release to releases page", () => {
    expect(getWorkflowActionHref({ sourceType: "platform_release", sourceId: "rel-1" })).toBe("/employee/platform/releases");
  });

  it("routes platform_billing to billing page", () => {
    expect(getWorkflowActionHref({ sourceType: "platform_billing", sourceId: "bill-1" })).toBe("/employee/platform/billing");
  });

  it("returns fallback for unknown source type", () => {
    expect(getWorkflowActionHref({ sourceType: "unknown_future_type", sourceId: "x" })).toBe("/employee/ai");
  });
});

describe("getWorkflowSourceLabel", () => {
  it("labels commercial types", () => {
    expect(getWorkflowSourceLabel("demo_request")).toBe("Commercial");
    expect(getWorkflowSourceLabel("company_client")).toBe("Commercial");
  });

  it("labels HR types", () => {
    expect(getWorkflowSourceLabel("employee_document_assignment")).toBe("People / HR");
    expect(getWorkflowSourceLabel("hr_compliance_requirement")).toBe("People / HR");
  });

  it("labels website types", () => {
    expect(getWorkflowSourceLabel("website_scan")).toBe("Website");
  });

  it("labels AI proposals", () => {
    expect(getWorkflowSourceLabel("workflow_action_proposal")).toBe("AI Proposal");
  });

  it("labels platform types", () => {
    expect(getWorkflowSourceLabel("platform_sprint")).toBe("Platform");
    expect(getWorkflowSourceLabel("platform_release")).toBe("Platform");
    expect(getWorkflowSourceLabel("platform_billing")).toBe("Platform");
  });

  it("returns fallback label for unknown type", () => {
    expect(getWorkflowSourceLabel("totally_unknown")).toBe("AI Notification");
    expect(getWorkflowSourceLabel(null)).toBe("AI Notification");
    expect(getWorkflowSourceLabel(undefined)).toBe("AI Notification");
  });
});
