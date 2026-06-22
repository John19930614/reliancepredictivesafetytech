import { describe, expect, it } from "vitest";
import { requiredHrDocumentTemplates } from "./hr-document-templates";
import type { RequiredHrDocumentTemplate } from "./hr-document-templates";

describe("requiredHrDocumentTemplates", () => {
  it("exports a non-empty array", () => {
    expect(requiredHrDocumentTemplates.length).toBeGreaterThan(0);
  });

  it("every template has required string fields", () => {
    for (const t of requiredHrDocumentTemplates) {
      expect(typeof t.title).toBe("string");
      expect(t.title.length).toBeGreaterThan(0);
      expect(typeof t.category).toBe("string");
      expect(t.category.length).toBeGreaterThan(0);
      expect(typeof t.bodyText).toBe("string");
      expect(t.bodyText.length).toBeGreaterThan(0);
    }
  });

  it("every template has a positive version number", () => {
    for (const t of requiredHrDocumentTemplates) {
      expect(t.version).toBeGreaterThan(0);
    }
  });

  it("every template has a non-negative sortOrder", () => {
    for (const t of requiredHrDocumentTemplates) {
      expect(t.sortOrder).toBeGreaterThanOrEqual(0);
    }
  });

  it("all sortOrders are unique (no duplicates)", () => {
    const orders = requiredHrDocumentTemplates.map((t) => t.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it("all templates are active and required by default", () => {
    for (const t of requiredHrDocumentTemplates) {
      expect(t.active).toBe(true);
      expect(t.required).toBe(true);
    }
  });

  it("templates are sorted by sortOrder ascending", () => {
    const orders = requiredHrDocumentTemplates.map((t) => t.sortOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it("includes I-9 and W-4 federal forms", () => {
    const titles = requiredHrDocumentTemplates.map((t) => t.title.toLowerCase());
    expect(titles.some((t) => t.includes("i-9"))).toBe(true);
    expect(titles.some((t) => t.includes("w-4"))).toBe(true);
  });

  it("conforms to RequiredHrDocumentTemplate shape", () => {
    const keys: (keyof RequiredHrDocumentTemplate)[] = [
      "title", "category", "bodyText", "version", "active", "required", "sortOrder",
    ];
    for (const t of requiredHrDocumentTemplates) {
      for (const key of keys) {
        expect(t).toHaveProperty(key);
      }
    }
  });
});
