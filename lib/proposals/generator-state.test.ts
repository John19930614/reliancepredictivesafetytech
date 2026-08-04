import { describe, expect, it } from "vitest";
import {
  buildPrefillState,
  deriveSummaryFromState,
  deriveTitleFromState,
  isGeneratorState,
  type GeneratorItem,
  type GeneratorState,
} from "./generator-state";

const state = (overrides: Partial<GeneratorState> = {}): GeneratorState => ({
  v: 1,
  fields: {},
  phases: [],
  services: [],
  ...overrides,
});

const item = (overrides: Partial<Record<keyof GeneratorItem, unknown>> = {}): unknown => ({
  type: "phase",
  key: "discovery",
  name: "Discovery",
  qty: 1,
  price: 0,
  desc: "Kickoff",
  unit: "",
  ...overrides,
});

/** Wrap an untrusted item the way a hand-crafted server-action POST would. */
const withPhase = (phase: unknown): unknown => ({ v: 1, fields: {}, phases: [phase], services: [] });
const withService = (service: unknown): unknown => ({ v: 1, fields: {}, phases: [], services: [service] });
const withFields = (fields: unknown): unknown => ({ v: 1, fields, phases: [], services: [] });

describe("isGeneratorState", () => {
  it("accepts the bridge's serialized shape", () => {
    expect(isGeneratorState(state())).toBe(true);
    expect(isGeneratorState(state({ fields: { clientCompany: "Acme", docRush: true } }))).toBe(true);
  });

  it("accepts a fully populated state with phase and service line items", () => {
    expect(
      isGeneratorState({
        v: 1,
        fields: { clientCompany: "Acme", docRush: true, validDays: 30 },
        phases: [item()],
        services: [item({ type: "service", key: "document", name: "Document Build", qty: 2, price: 450, unit: "Doc" })],
      }),
    ).toBe(true);
  });

  it("accepts items whose optional name/desc/unit are absent", () => {
    const bare = { type: "phase", key: "discovery", qty: 1, price: 0 };
    expect(isGeneratorState(withPhase(bare))).toBe(true);
  });

  it("accepts negative and fractional numbers", () => {
    expect(isGeneratorState(withPhase(item({ qty: 0.5, price: -250 })))).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isGeneratorState(null)).toBe(false);
    expect(isGeneratorState("{}")).toBe(false);
    expect(isGeneratorState({ v: 1, fields: {} })).toBe(false);
    expect(isGeneratorState({ v: "1", fields: {}, phases: [], services: [] })).toBe(false);
  });

  it("rejects arrays at the root and a non-object fields map", () => {
    expect(isGeneratorState([])).toBe(false);
    expect(isGeneratorState(withFields([]))).toBe(false);
    expect(isGeneratorState(withFields(null))).toBe(false);
    expect(isGeneratorState(withFields("clientCompany=Acme"))).toBe(false);
  });

  it("rejects a non-numeric qty (the stored-XSS payload shape)", () => {
    expect(isGeneratorState(withPhase(item({ qty: "1" })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty: '1" onfocus="alert(1)' })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ qty: null })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ qty: undefined })))).toBe(false);
  });

  it("rejects a NaN or Infinity price", () => {
    expect(isGeneratorState(withPhase(item({ price: Number.NaN })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ price: Number.POSITIVE_INFINITY })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ price: Number.NEGATIVE_INFINITY })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", price: "450" })))).toBe(false);
  });

  it("rejects items with a non-string type/key or non-string optional members", () => {
    expect(isGeneratorState(withPhase(item({ type: 1 })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ key: undefined })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ name: { toString: "x" } })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ desc: ["a"] })))).toBe(false);
    expect(isGeneratorState(withPhase(item({ unit: 5 })))).toBe(false);
    expect(isGeneratorState(withPhase(null))).toBe(false);
    expect(isGeneratorState(withPhase("discovery"))).toBe(false);
  });

  it("rejects a nested object or array as a field value", () => {
    expect(isGeneratorState(withFields({ clientCompany: { toString: "Acme" } }))).toBe(false);
    expect(isGeneratorState(withFields({ clientCompany: ["Acme"] }))).toBe(false);
    expect(isGeneratorState(withFields({ clientCompany: null }))).toBe(false);
    expect(isGeneratorState(withFields({ validDays: Number.NaN }))).toBe(false);
  });

  it("rejects the whole state when a single item in either list is bad", () => {
    expect(
      isGeneratorState({ v: 1, fields: {}, phases: [item(), item({ qty: "2" })], services: [item()] }),
    ).toBe(false);
    expect(
      isGeneratorState({ v: 1, fields: {}, phases: [item()], services: [item(), item({ price: "0" })] }),
    ).toBe(false);
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
