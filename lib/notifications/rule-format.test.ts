import { describe, expect, it } from "vitest";
import { notificationFromPriorityItem } from "./rule-format";

describe("notificationFromPriorityItem", () => {
  it("maps a command priority item into a stable notification payload", () => {
    const notification = notificationFromPriorityItem({
      title: "Acme Industrial",
      label: "New demo request",
      href: "/employee/inbox",
      actionHref: "/employee/inbox",
      priority: "high",
      detail: "Taylor - taylor@example.com",
      owner: null,
      dueDate: "2026-05-06",
      status: "new",
      sourceLabel: "Commercial",
      sourceType: "demo_request",
      sourceId: "request-123",
      reviewRequired: true,
    });

    expect(notification).toMatchObject({
      title: "New demo request",
      body: "Acme Industrial",
      priority: "high",
      source_type: "demo_request",
      source_id: "request-123",
      action_href: "/employee/inbox",
      ai_summary: "Taylor - taylor@example.com",
      dedupe_key: "demo_request:request-123:new-demo-request",
    });
  });

  it("normalizes multi-word labels for dedupe keys", () => {
    const notification = notificationFromPriorityItem({
      title: "Document review",
      label: "High Priority Operations",
      href: "/employee/operations",
      actionHref: "/employee/operations",
      priority: "critical",
      detail: "Critical - unassigned",
      owner: null,
      dueDate: null,
      status: "Open",
      sourceLabel: "Operations",
      sourceType: "company_operations_record",
      sourceId: "ops-456",
      reviewRequired: false,
    });

    expect(notification.dedupe_key).toBe("company_operations_record:ops-456:high-priority-operations");
  });
});
