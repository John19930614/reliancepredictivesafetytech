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
  const acme = {
    id: "c1",
    name: "Acme",
    addressText: "500 Mill Road\nMilwaukee, WI 53202",
    contacts: [
      { id: "p1", isPrimary: true, name: "Jo Field", title: "Safety Director", email: "jo@acme.com", phone: "" },
      { id: "p2", isPrimary: false, name: "Pat Reyes", title: "Project Executive", email: "pat@acme.com", phone: "" },
    ],
    legacyContactName: "",
    legacyContactEmail: "",
  };

  const profile = {
    legal_name: "Reliance Predictive Safety Technologies LLC",
    display_name: "Reliance Predictive Safety Technologies",
    address_line1: "1 Main St",
    address_line2: "",
    city: "Sussex",
    state: "Wisconsin",
    postal_code: "53089",
    country: "United States",
    email: "hello@example.com",
    phone: "262-555-0100",
    website: "",
  };

  it("prefills the company, its address and its primary contact", () => {
    const prefill = buildPrefillState({ company: acme })!;
    expect(prefill.fields.clientCompany).toBe("Acme");
    expect(prefill.fields.clientAddress).toBe("500 Mill Road\nMilwaukee, WI 53202");
    // Primary only — a proposal opens addressed to one person, and the seller
    // ticks anyone else they want on it.
    expect(prefill.fields.clientContacts).toBe("Jo Field | Safety Director | jo@acme.com");
  });

  it("prefills the seller block from the company profile, not from a hardcoded string", () => {
    const prefill = buildPrefillState({ companyProfile: profile })!;
    expect(prefill.fields.sellerName).toBe("Reliance Predictive Safety Technologies");
    expect(prefill.fields.sellerContact).toBe(
      "1 Main St\nSussex, Wisconsin 53089\nPhone: 262-555-0100\nEmail: hello@example.com",
    );
  });

  it("carries the preparer, the allocated number and the date", () => {
    const prefill = buildPrefillState({
      preparedBy: "John Haldemann",
      proposalNumber: "RPS-2026-0007",
      today: "2026-08-09",
    })!;
    expect(prefill.fields.preparedBy).toBe("John Haldemann");
    expect(prefill.fields.proposalNo).toBe("RPS-2026-0007");
    expect(prefill.fields.proposalDate).toBe("2026-08-09");
  });

  it("falls back to the legacy single contact when the record has no contact rows", () => {
    const prefill = buildPrefillState({
      company: { ...acme, contacts: [], legacyContactName: "Sue", legacyContactEmail: "sue@staff.example" },
    })!;
    expect(prefill.fields.clientContacts).toBe("Sue |  | sue@staff.example");
  });

  it("never includes phases/services so generator defaults survive", () => {
    const prefill = buildPrefillState({ company: acme });
    expect(prefill && "phases" in prefill).toBe(false);
    expect(prefill && "services" in prefill).toBe(false);
  });

  it("omits blanks rather than writing empty strings", () => {
    // The whole point: a field the platform knows nothing about must stay
    // ABSENT so the generator shows its placeholder, rather than being answered
    // with "" — or, as the asset used to, with example text that then printed.
    const prefill = buildPrefillState({ company: { ...acme, addressText: "" }, preparedBy: "  " })!;
    expect(prefill.fields).not.toHaveProperty("clientAddress");
    expect(prefill.fields).not.toHaveProperty("preparedBy");
  });

  it("returns null with no company or no usable fields", () => {
    expect(buildPrefillState(null)).toBeNull();
    expect(buildPrefillState({})).toBeNull();
    expect(
      buildPrefillState({
        company: { id: "c9", name: "", addressText: "", contacts: [], legacyContactName: "", legacyContactEmail: "" },
      }),
    ).toBeNull();
  });
});
