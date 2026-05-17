import { describe, expect, it } from "vitest";
import { sortPriorityItems, type RankedPriorityItem } from "./priority-ranking";

type TestPriorityItem = RankedPriorityItem & {
  label: string;
  href: string;
  actionHref: string;
  detail: string;
  owner: string | null;
  status: string;
  sourceLabel: string;
  sourceType: string;
  sourceId: string;
};

function item(values: Partial<TestPriorityItem> & Pick<TestPriorityItem, "title" | "priority">): TestPriorityItem {
  return {
    label: "Test",
    href: "/employee/ai",
    actionHref: "/employee/ai",
    detail: "Test detail",
    owner: null,
    dueDate: null,
    status: "open",
    sourceLabel: "People / HR",
    sourceType: "test",
    sourceId: values.title,
    reviewRequired: false,
    ...values,
  };
}

describe("sortCommandPriorityItems", () => {
  it("prioritizes critical review-required onboarding work before lower-risk nudges", () => {
    const sorted = sortPriorityItems([
      item({ title: "Payroll setup gap", priority: "low", sourceType: "employee_payroll_setup_task" }),
      item({ title: "State compliance review", priority: "medium", reviewRequired: true, sourceType: "hr_compliance_requirement" }),
      item({ title: "Critical upload review", priority: "critical", reviewRequired: true, sourceType: "employee_document_assignment" }),
    ]);

    expect(sorted.map((entry) => entry.title)).toEqual([
      "Critical upload review",
      "State compliance review",
      "Payroll setup gap",
    ]);
  });

  it("uses due dates before title sorting when priority and review status match", () => {
    const sorted = sortPriorityItems([
      item({ title: "Later payroll setup", priority: "medium", dueDate: "2026-05-10" }),
      item({ title: "Sooner payroll setup", priority: "medium", dueDate: "2026-05-08" }),
    ]);

    expect(sorted[0].title).toBe("Sooner payroll setup");
  });
});
