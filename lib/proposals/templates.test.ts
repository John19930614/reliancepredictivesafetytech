import { describe, expect, it } from "vitest";
import { isGeneratorState, type GeneratorState } from "./generator-state";
import {
  buildStateFromTemplate,
  clientIdentityFieldIds,
  isClientIdentityFieldId,
  isTemplateBlockedFieldId,
  isTemplateFormData,
  proposalInstanceFieldIds,
  sanitizeTemplateState,
  templateDescriptionMaxLength,
  templateLeakFieldIds,
  templateNameMaxLength,
  validateTemplateFields,
} from "./templates";

/** A proposal captured from a real client, with every leak-prone field set. */
const capturedFromAcme: GeneratorState = {
  v: 1,
  fields: {
    // Client identity — must never survive.
    clientCompany: "Acme Construction",
    clientContact: "Dana Reyes",
    clientTitle: "VP Safety",
    clientEmail: "dana@acme.example",
    clientAddress: "500 Acme Way\nDenver, CO",
    // Proposal instance — must never survive.
    proposalNo: "RPST-2026-001",
    proposalDate: "2026-08-01",
    preparedBy: "Jo Seller",
    // Reusable scope / commercial terms — must survive.
    packageSelect: "growth",
    annualPrice: 24000,
    includedUsers: 50,
    includedSites: 2,
    discountPct: 10,
    taxPct: 0,
    depositPct: 25,
    validDays: 30,
    paymentTerms: "Net 30",
    docRush: true,
    sellerName: "Reliance Predictive Safety Technologies LLC",
    sellerContact: "sales@rpst.example",
    customSummary: "Six-month pilot across two jobsites.",
  },
  phases: [
    { type: "phase", key: "discovery", name: "Phase 1 — Discovery", qty: 1, price: 3500, desc: "Kickoff", unit: "" },
  ],
  services: [
    { type: "service", key: "osha10", name: "OSHA 10", qty: 4, price: 125, desc: "Training", unit: "Seat" },
  ],
};

/** The company the template is being APPLIED to — never the captured one. */
const newClient = {
  company: {
    id: "beta",
    name: "Beta Builders",
    addressText: "9 Foundry Way\nMadison, WI 53703",
    contacts: [
      { id: "b1", isPrimary: true, name: "Sam Ortiz", title: "EHS Manager", email: "sam@beta.example", phone: "" },
    ],
    legacyContactName: "",
    legacyContactEmail: "",
  },
};

describe("blocked field identification", () => {
  it("flags every known client-identity field", () => {
    for (const fieldId of clientIdentityFieldIds) {
      expect(isClientIdentityFieldId(fieldId)).toBe(true);
      expect(isTemplateBlockedFieldId(fieldId)).toBe(true);
    }
  });

  it("flags proposal-instance fields as blocked but not as client identity", () => {
    for (const fieldId of proposalInstanceFieldIds) {
      expect(isTemplateBlockedFieldId(fieldId)).toBe(true);
      expect(isClientIdentityFieldId(fieldId)).toBe(false);
    }
  });

  it("flags client fields a future generator version might add", () => {
    // The explicit list cannot be kept in sync with the asset by hand, so the
    // `client*` prefix is the backstop. These ids do not exist today.
    expect(isClientIdentityFieldId("clientPhone")).toBe(true);
    expect(isClientIdentityFieldId("clientCity")).toBe(true);
    expect(isClientIdentityFieldId("ClientBillingContact")).toBe(true);
  });

  it("does not flag seller-side or scope fields", () => {
    for (const fieldId of ["sellerName", "sellerContact", "packageSelect", "customSummary", "recipientNotes"]) {
      expect(isTemplateBlockedFieldId(fieldId)).toBe(false);
    }
  });
});

describe("sanitizeTemplateState", () => {
  it("strips every client-identity and proposal-instance field", () => {
    const sanitized = sanitizeTemplateState(capturedFromAcme);
    expect(sanitized).not.toBeNull();

    for (const fieldId of [...clientIdentityFieldIds, ...proposalInstanceFieldIds]) {
      expect(sanitized!.fields).not.toHaveProperty(fieldId);
    }
    // Nothing that looks like the old client is left anywhere in the fields.
    expect(JSON.stringify(sanitized!.fields)).not.toMatch(/Acme|Dana|dana@acme/i);
  });

  it("keeps the reusable scope, terms and line items intact", () => {
    const sanitized = sanitizeTemplateState(capturedFromAcme)!;
    expect(sanitized.fields.packageSelect).toBe("growth");
    expect(sanitized.fields.annualPrice).toBe(24000);
    expect(sanitized.fields.discountPct).toBe(10);
    expect(sanitized.fields.docRush).toBe(true);
    expect(sanitized.fields.sellerName).toBe("Reliance Predictive Safety Technologies LLC");
    expect(sanitized.phases).toEqual(capturedFromAcme.phases);
    expect(sanitized.services).toEqual(capturedFromAcme.services);
    expect(isGeneratorState(sanitized)).toBe(true);
  });

  it("drops unknown keys (including ids) off line items", () => {
    const withIds = {
      v: 1,
      fields: {},
      phases: [
        {
          type: "phase",
          key: "discovery",
          name: "Discovery",
          qty: 1,
          price: 0,
          desc: "",
          unit: "",
          id: "row-1",
          proposal_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
      services: [],
    };
    const sanitized = sanitizeTemplateState(withIds)!;
    expect(sanitized.phases[0]).toEqual({
      type: "phase",
      key: "discovery",
      name: "Discovery",
      qty: 1,
      price: 0,
      desc: "",
      unit: "",
    });
    expect(sanitized.phases[0]).not.toHaveProperty("id");
    expect(sanitized.phases[0]).not.toHaveProperty("proposal_id");
  });

  it("normalizes absent optional strings to empty strings", () => {
    const bare = { v: 1, fields: {}, phases: [{ type: "phase", key: "build", qty: 2, price: 100 }], services: [] };
    expect(sanitizeTemplateState(bare)!.phases[0]).toEqual({
      type: "phase",
      key: "build",
      name: "",
      qty: 2,
      price: 100,
      desc: "",
      unit: "",
    });
  });

  it("does not alias the input, so the caller cannot mutate a stored template", () => {
    const source: GeneratorState = { v: 1, fields: { taxPct: 5 }, phases: [], services: [] };
    const sanitized = sanitizeTemplateState(source)!;
    sanitized.fields.taxPct = 99;
    expect(source.fields.taxPct).toBe(5);
  });

  it("is idempotent", () => {
    const once = sanitizeTemplateState(capturedFromAcme)!;
    expect(sanitizeTemplateState(once)).toEqual(once);
  });

  // --- negative cases -------------------------------------------------------

  it("rejects a body that is not a generator state", () => {
    expect(sanitizeTemplateState(null)).toBeNull();
    expect(sanitizeTemplateState(undefined)).toBeNull();
    expect(sanitizeTemplateState("{}")).toBeNull();
    expect(sanitizeTemplateState([])).toBeNull();
    expect(sanitizeTemplateState({})).toBeNull();
    expect(sanitizeTemplateState({ v: 1, fields: {}, phases: [] })).toBeNull();
  });

  it("rejects a state whose line items carry stringified numbers", () => {
    // isGeneratorItem insists qty/price are finite numbers — they end up inside
    // the generator's innerHTML templates.
    const stringy = {
      v: 1,
      fields: {},
      phases: [{ type: "phase", key: "discovery", name: "x", qty: "1", price: 0, desc: "", unit: "" }],
      services: [],
    };
    expect(sanitizeTemplateState(stringy)).toBeNull();
  });

  it("rejects a state whose field value is structured data", () => {
    const nested = { v: 1, fields: { clientCompany: { toString: "Acme" } }, phases: [], services: [] };
    expect(sanitizeTemplateState(nested)).toBeNull();
  });
});

describe("templateLeakFieldIds", () => {
  it("names every blocked field a raw capture still carries", () => {
    expect(templateLeakFieldIds(capturedFromAcme)).toEqual([
      "clientAddress",
      "clientCompany",
      "clientContact",
      "clientEmail",
      "clientTitle",
      "preparedBy",
      "proposalDate",
      "proposalNo",
    ]);
  });

  it("reports nothing for a sanitized state or a malformed body", () => {
    expect(templateLeakFieldIds(sanitizeTemplateState(capturedFromAcme))).toEqual([]);
    expect(templateLeakFieldIds("not a state")).toEqual([]);
  });
});

describe("buildStateFromTemplate", () => {
  it("prefills the NEW client and never the captured one", () => {
    const state = buildStateFromTemplate(capturedFromAcme, newClient)!;

    expect(state.fields.clientCompany).toBe("Beta Builders");
    expect(state.fields.clientContacts).toBe("Sam Ortiz | EHS Manager | sam@beta.example");
    // The address now comes across too — company_clients gained address columns
    // in 20260809100000, so it is no longer left blank for want of a source.
    expect(state.fields.clientAddress).toBe("9 Foundry Way\nMadison, WI 53703");
    // The legacy single-contact fields are scrubbed and not re-supplied.
    expect(state.fields).not.toHaveProperty("clientContact");
    expect(state.fields).not.toHaveProperty("clientTitle");
    expect(state.fields).not.toHaveProperty("clientEmail");
    expect(JSON.stringify(state.fields)).not.toMatch(/Acme|Dana|dana@acme|Denver/i);
  });

  it("never carries the captured client's addressee list to another company", () => {
    // clientContacts holds names, titles and emails of real people. Leaking it
    // would print another client's staff on the front page of this proposal.
    const capturedWithContacts = {
      ...capturedFromAcme,
      fields: { ...capturedFromAcme.fields, clientContacts: "Dana Vance | Safety Lead | dana@acme.example" },
    };
    const state = buildStateFromTemplate(capturedWithContacts, newClient)!;
    expect(state.fields.clientContacts).toBe("Sam Ortiz | EHS Manager | sam@beta.example");

    const unassigned = buildStateFromTemplate(capturedWithContacts, null)!;
    expect(unassigned.fields).not.toHaveProperty("clientContacts");
  });

  it("carries the scope and line items across", () => {
    const state = buildStateFromTemplate(capturedFromAcme, newClient)!;
    expect(state.fields.packageSelect).toBe("growth");
    expect(state.phases).toHaveLength(1);
    expect(state.services[0].key).toBe("osha10");
    expect(isGeneratorState(state)).toBe(true);
  });

  it("drops the proposal number and date so the new proposal gets its own", () => {
    const state = buildStateFromTemplate(capturedFromAcme, newClient)!;
    expect(state.fields).not.toHaveProperty("proposalNo");
    expect(state.fields).not.toHaveProperty("proposalDate");
    expect(state.fields).not.toHaveProperty("preparedBy");
  });

  it("leaves the client block empty for an unassigned proposal", () => {
    const state = buildStateFromTemplate(capturedFromAcme, null)!;
    for (const fieldId of clientIdentityFieldIds) {
      expect(state.fields).not.toHaveProperty(fieldId);
    }
  });

  it("ignores a company row that has nothing to prefill", () => {
    const state = buildStateFromTemplate(capturedFromAcme, {
      company: { id: "x", name: "", addressText: "", contacts: [], legacyContactName: "", legacyContactEmail: "" },
    })!;
    expect(state.fields).not.toHaveProperty("clientCompany");
    expect(state.fields.packageSelect).toBe("growth");
  });

  it("scrubs a template row written before the sanitizer existed", () => {
    // Stored bodies are untrusted: an older build (or a hand-crafted POST at the
    // server action) could have persisted the client block verbatim.
    const legacyRow = { ...capturedFromAcme };
    const state = buildStateFromTemplate(legacyRow, newClient)!;
    expect(state.fields.clientCompany).toBe("Beta Builders");
    expect(JSON.stringify(state.fields)).not.toMatch(/Acme/i);
  });

  it("returns null for an unusable template body instead of falling back", () => {
    expect(buildStateFromTemplate(null, newClient)).toBeNull();
    expect(buildStateFromTemplate({ v: 1, fields: {} }, newClient)).toBeNull();
    expect(buildStateFromTemplate({ v: "1", fields: {}, phases: [], services: [] }, newClient)).toBeNull();
  });
});

describe("isTemplateFormData", () => {
  it("accepts a well-formed state and rejects anything else", () => {
    expect(isTemplateFormData(capturedFromAcme)).toBe(true);
    expect(isTemplateFormData({ v: 1, fields: {}, phases: [], services: [] })).toBe(true);
    expect(isTemplateFormData({ fields: {}, phases: [], services: [] })).toBe(false);
    expect(isTemplateFormData(null)).toBe(false);
  });
});

describe("validateTemplateFields", () => {
  it("accepts a normal name and description", () => {
    expect(validateTemplateFields({ name: "Pilot — 2 jobsites", description: "Standard six-month pilot" })).toEqual({
      ok: true,
      errors: {},
    });
  });

  it("only checks the keys that are present", () => {
    expect(validateTemplateFields({}).ok).toBe(true);
    expect(validateTemplateFields({ description: null }).ok).toBe(true);
  });

  it("rejects a missing or whitespace-only name", () => {
    expect(validateTemplateFields({ name: "" }).errors.name).toBe("Give the template a name.");
    expect(validateTemplateFields({ name: "   " }).errors.name).toBe("Give the template a name.");
    expect(validateTemplateFields({ name: null }).ok).toBe(false);
  });

  it("rejects an over-length name or description", () => {
    const longName = validateTemplateFields({ name: "x".repeat(templateNameMaxLength + 1) });
    expect(longName.ok).toBe(false);
    expect(longName.error).toContain(String(templateNameMaxLength));

    const longDescription = validateTemplateFields({
      name: "ok",
      description: "y".repeat(templateDescriptionMaxLength + 1),
    });
    expect(longDescription.ok).toBe(false);
    expect(longDescription.errors.description).toContain(String(templateDescriptionMaxLength));
  });

  it("accepts a name and description exactly at the limit", () => {
    expect(
      validateTemplateFields({
        name: "x".repeat(templateNameMaxLength),
        description: "y".repeat(templateDescriptionMaxLength),
      }).ok,
    ).toBe(true);
  });

  it("rejects a non-string description", () => {
    expect(validateTemplateFields({ name: "ok", description: 42 as unknown as string }).ok).toBe(false);
  });
});
