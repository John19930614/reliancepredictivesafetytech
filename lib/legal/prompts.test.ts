import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPT_TEMPLATES, buildTemplateVars, resolveTemplate } from "./prompts";

describe("resolveTemplate", () => {
  it("replaces known bracket placeholders", () => {
    const out = resolveTemplate("Register for [industry] in [state/jurisdiction] for [program/work activity].", {
      industry: "Construction",
      "state/jurisdiction": "TX / Federal",
      "program/work activity": "Fall Protection",
    });
    expect(out).toBe("Register for Construction in TX / Federal for Fall Protection.");
  });

  it("leaves unknown or empty placeholders intact", () => {
    const out = resolveTemplate("Cover [industry] and [unknown].", { industry: "", "unknown": undefined });
    expect(out).toBe("Cover [industry] and [unknown].");
  });

  it("seeds the five doc templates", () => {
    const keys = DEFAULT_PROMPT_TEMPLATES.map((t) => t.template_key);
    expect(keys).toEqual([
      "build_legal_register",
      "gap_analysis",
      "module_builder",
      "audit_checklist_builder",
      "change_tracker",
    ]);
    // doc §13/§7: the register + gap templates require human review
    expect(DEFAULT_PROMPT_TEMPLATES.find((t) => t.template_key === "build_legal_register")?.requires_human_review).toBe(true);
  });
});

describe("buildTemplateVars", () => {
  it("composes jurisdiction and program/activity from form input", () => {
    const vars = buildTemplateVars({ industry: "DOT", state: "WI", jurisdiction: "federal", program: "Fuel Transport", work_activity: "interstate hauling" });
    expect(vars["state/jurisdiction"]).toBe("WI / federal");
    expect(vars["program/work activity"]).toBe("Fuel Transport — interstate hauling");
    expect(vars.industry).toBe("DOT");
  });
});
