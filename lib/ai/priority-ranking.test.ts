import { describe, expect, it } from "vitest";
import { sortPriorityItems } from "./priority-ranking";
import type { RankedPriorityItem } from "./priority-ranking";

const item = (overrides: Partial<RankedPriorityItem> & { title: string }): RankedPriorityItem => ({
  priority: "medium",
  dueDate: null,
  reviewRequired: false,
  ...overrides,
});

describe("sortPriorityItems", () => {
  it("sorts critical before high before medium before low", () => {
    const input = [
      item({ title: "Low", priority: "low" }),
      item({ title: "Critical", priority: "critical" }),
      item({ title: "Medium", priority: "medium" }),
      item({ title: "High", priority: "high" }),
    ];
    const result = sortPriorityItems(input).map((i) => i.title);
    expect(result).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  it("does not mutate the original array", () => {
    const input = [
      item({ title: "Low", priority: "low" }),
      item({ title: "Critical", priority: "critical" }),
    ];
    const original = [...input];
    sortPriorityItems(input);
    expect(input[0].title).toBe(original[0].title);
  });

  it("puts reviewRequired items before non-review at same priority", () => {
    const input = [
      item({ title: "No Review", priority: "high", reviewRequired: false }),
      item({ title: "Needs Review", priority: "high", reviewRequired: true }),
    ];
    const result = sortPriorityItems(input).map((i) => i.title);
    expect(result[0]).toBe("Needs Review");
  });

  it("sorts by dueDate ascending when priority and reviewRequired match", () => {
    const input = [
      item({ title: "Later", priority: "medium", dueDate: "2026-07-10" }),
      item({ title: "Earlier", priority: "medium", dueDate: "2026-06-25" }),
    ];
    const result = sortPriorityItems(input).map((i) => i.title);
    expect(result).toEqual(["Earlier", "Later"]);
  });

  it("puts items with a dueDate before items without one", () => {
    const input = [
      item({ title: "No Due Date", priority: "medium", dueDate: null }),
      item({ title: "Has Due Date", priority: "medium", dueDate: "2026-07-01" }),
    ];
    const result = sortPriorityItems(input).map((i) => i.title);
    expect(result[0]).toBe("Has Due Date");
  });

  it("falls back to alphabetical title sort when all else is equal", () => {
    const input = [
      item({ title: "Zebra", priority: "low", dueDate: null }),
      item({ title: "Alpha", priority: "low", dueDate: null }),
    ];
    const result = sortPriorityItems(input).map((i) => i.title);
    expect(result).toEqual(["Alpha", "Zebra"]);
  });

  it("returns empty array unchanged", () => {
    expect(sortPriorityItems([])).toEqual([]);
  });
});
