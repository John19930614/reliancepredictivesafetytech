import { describe, expect, it } from "vitest";
import { buildExportMatrix, type ExportSheet } from "./export";
import { DEFAULT_LEGAL_DISCLAIMER } from "./types";

const sheet: ExportSheet = {
  name: "Legal Register",
  title: "Legal Register",
  columns: [
    { header: "Title", key: "title" },
    { header: "Risk", key: "risk_level" },
    { header: "Module", key: "module_assignment" },
  ],
  rows: [
    { title: "Lockout/Tagout", risk_level: "high", module_assignment: "LOTO" },
    { title: "Hazard Communication", risk_level: "medium" }, // missing module
  ],
};

describe("buildExportMatrix", () => {
  it("maps columns in order and blanks missing fields", () => {
    const m = buildExportMatrix(sheet, { company: "Reliance", generatedBy: "jane@x.com" });
    expect(m.header).toEqual(["Title", "Risk", "Module"]);
    expect(m.body[0]).toEqual(["Lockout/Tagout", "high", "LOTO"]);
    expect(m.body[1]).toEqual(["Hazard Communication", "medium", ""]);
  });

  it("includes a meta line with company and generated-by", () => {
    const m = buildExportMatrix(sheet, { company: "Reliance", generatedBy: "jane@x.com" });
    expect(m.metaLine).toContain("Company: Reliance");
    expect(m.metaLine).toContain("By: jane@x.com");
    expect(m.metaLine).toContain("Generated:");
  });

  it("always carries the fixed compliance disclaimer", () => {
    const m = buildExportMatrix(sheet);
    expect(m.disclaimer).toBe(DEFAULT_LEGAL_DISCLAIMER);
  });
});
