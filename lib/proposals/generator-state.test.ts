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

  /* ------------------------------------------------------------------------ */
  /* Legacy shapes. A false rejection here is not a caught attack — it is a    */
  /* real proposal that stops rendering, so every one of these must pass.      */
  /* ------------------------------------------------------------------------ */

  it("accepts a row saved before the per-participant repricing, unit and all", () => {
    // First Aid was a $1,200 session in July and is $145 per participant now.
    // The guard validates SHAPE, never agreement with today's price book — a
    // stored row that disagrees with the catalog is exactly what it should be.
    expect(
      isGeneratorState(
        withService(item({ type: "service", key: "firstAid", name: "", desc: "", qty: 1, price: 1200, unit: "Session" })),
      ),
    ).toBe(true);
  });

  it("accepts a headcount quantity, and a proposal with no proposalType stamp", () => {
    expect(isGeneratorState(withService(item({ type: "service", key: "osha10", qty: 250, price: 210, unit: "Person" })))).toBe(true);
    const untyped = { v: 1, fields: { packageSelect: "none" }, phases: [], services: [] };
    expect(isGeneratorState(untyped)).toBe(true);
    expect("proposalType" in untyped.fields).toBe(false);
  });

  it("accepts a row that carries a key the price book no longer has", () => {
    // Retiring a catalog entry must not strand the proposals that quoted it.
    expect(isGeneratorState(withService(item({ type: "service", key: "retiredCourse", qty: 3, price: 400 })))).toBe(true);
  });

  it("accepts a row carrying a billing basis, a tier ladder and a delivery mode", () => {
    expect(
      isGeneratorState(
        withService(
          item({
            type: "service",
            key: "bbp",
            qty: 10,
            price: 105,
            unit: "Person",
            qty_basis: "attendee",
            qty_tiers: [{ min_qty: 20, price: 95 }],
            delivery_mode: "virtual",
          }),
        ),
      ),
    ).toBe(true);
  });

  it("accepts a row saved before any of those fields existed", () => {
    // Backward compatibility is the point: every signed proposal in the
    // database is this shape, and the guard is the gate the document page, the
    // PDF, the DOCX and the share link all pass through.
    const legacy = { type: "service", key: "osha10", name: "OSHA 10 Training", qty: 25, price: 210, desc: "", unit: "Person" };
    expect(isGeneratorState(withService(legacy))).toBe(true);
  });

  it("accepts a basis or delivery mode it does not recognize, and lets pricing neutralize it", () => {
    // Deliberate. This guard is a LOAD gate — rejecting here makes a signed
    // proposal unopenable, not merely oddly labelled — so an enum value from a
    // newer build, or a tampered one, still loads and is resolved to "absent"
    // where the money is computed. See coerceQtyBasis() in qty-basis.ts.
    expect(isGeneratorState(withService(item({ type: "service", qty_basis: "per_head" })))).toBe(true);
    expect(isGeneratorState(withService(item({ type: "service", delivery_mode: "hybrid" })))).toBe(true);
  });

  it("rejects a basis or delivery mode that is not a string", () => {
    // Same rule as `unit`: a structured value here would be interpolated into
    // the generator's innerHTML row templates.
    expect(isGeneratorState(withService(item({ type: "service", qty_basis: 1 })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_basis: ["flat"] })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_basis: { toString: "flat" } })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", delivery_mode: 2 })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", delivery_mode: {} })))).toBe(false);
  });

  it("rejects a tier ladder that is not a list of two finite numbers", () => {
    // Tiers are money and arithmetic, so they get the same strictness qty and
    // price get: a string or a NaN would propagate straight into a total.
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [] })))).toBe(true);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [{ min_qty: 20, price: 95 }] })))).toBe(true);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [{ min_qty: "20", price: 95 }] })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [{ min_qty: 20, price: Number.NaN }] })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [{ min_qty: 20 }] })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: [null] })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: { min_qty: 20, price: 95 } })))).toBe(false);
    expect(isGeneratorState(withService(item({ type: "service", qty_tiers: "[]" })))).toBe(false);
  });

  it("survives the JSON round-trip the database actually performs", () => {
    // form_data is JSONB: what comes back is JSON.parse(JSON.stringify(x)).
    // Absent optional fields must stay absent rather than reappearing as null.
    const saved = {
      v: 1,
      fields: { clientCompany: "Acme" },
      phases: [item({ type: "phase" })],
      services: [
        item({ type: "service", key: "bbp", qty: 10, price: 105, unit: "Person", qty_basis: "attendee", delivery_mode: "in_person" }),
        item({ type: "service", key: "auditDay", qty: 2, price: 1750, unit: "Day" }),
      ],
    };
    const roundTripped = JSON.parse(JSON.stringify(saved));
    expect(isGeneratorState(roundTripped)).toBe(true);
    expect(roundTripped.services[0].qty_basis).toBe("attendee");
    expect("qty_basis" in roundTripped.services[1]).toBe(false);
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
