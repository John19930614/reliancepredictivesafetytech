import { describe, expect, it } from "vitest";
import {
  buildPrefillState,
  deriveSummaryFromState,
  deriveTitleFromState,
  isGeneratorState,
  type GeneratorState,
} from "./generator-state";

const state = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  v: 1,
  fields: {},
  phases: [],
  services: [],
  ...overrides,
});

describe("isGeneratorState", () => {
  it("accepts the bridge's serialized shape", () => {
    expect(isGeneratorState(state())).toBe(true);
    expect(isGeneratorState(state({ fields: { clientCompany: "Acme", docRush: true } }))).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isGeneratorState(null)).toBe(false);
    expect(isGeneratorState("{}")).toBe(false);
    expect(isGeneratorState({ v: 1, fields: {} })).toBe(false);
    expect(isGeneratorState({ v: "1", fields: {}, phases: [], services: [] })).toBe(false);
  });
});

describe("deriveTitleFromState", () => {
  it("builds the title from the client company", () => {
    expect(deriveTitleFromState(state({ fields: { clientCompany: "Acme Construction" } }), "Untitled")).toBe(
      "Acme Construction — Platform Proposal",
    );
  });

  it("falls back when the company is blank or state is missing", () => {
    expect(deriveTitleFromState(state({ fields: { clientCompany: "   " } }), "Untitled")).toBe("Untitled");
    expect(deriveTitleFromState(null, "Untitled")).toBe("Untitled");
  });
});

describe("deriveSummaryFromState", () => {
  it("joins proposal number, package, and line-item count", () => {
    const s = state({
      fields: { proposalNo: "RPST-2026-014", packageSelect: "pilot" },
      phases: [{ type: "phase", key: "discovery", name: "", qty: 1, price: 0, desc: "", unit: "" }],
      services: [{ type: "service", key: "document", name: "", qty: 2, price: 450, desc: "", unit: "" }],
    });
    expect(deriveSummaryFromState(s)).toBe("RPST-2026-014 · pilot · 2 line items");
  });

  it("returns null when there is nothing to summarize", () => {
    expect(deriveSummaryFromState(state())).toBeNull();
    expect(deriveSummaryFromState(null)).toBeNull();
  });
});

describe("buildPrefillState", () => {
  it("prefills client fields from the assigned company", () => {
    expect(buildPrefillState({ name: "Acme", contact_name: "Jo Field", email: "jo@acme.com" })).toEqual({
      v: 1,
      fields: { clientCompany: "Acme", clientContact: "Jo Field", clientEmail: "jo@acme.com" },
    });
  });

  it("never includes phases/services so generator defaults survive", () => {
    const prefill = buildPrefillState({ name: "Acme" });
    expect(prefill && "phases" in prefill).toBe(false);
    expect(prefill && "services" in prefill).toBe(false);
  });

  it("returns null with no company or no usable fields", () => {
    expect(buildPrefillState(null)).toBeNull();
    expect(buildPrefillState({ name: null, contact_name: null, email: null })).toBeNull();
  });
});
