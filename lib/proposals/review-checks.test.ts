import { describe, expect, it } from "vitest";
import type { GeneratorState } from "./generator-state";
import { collectReadinessFindings, type ReadinessMeta } from "./review-checks";

const TODAY = "2026-08-11";
const MEMBER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SIGNER_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

function meta(overrides: Partial<ReadinessMeta> = {}): ReadinessMeta {
  return { status: "draft", validUntil: null, clientAssigned: true, today: TODAY, ...overrides };
}

/** A proposal with nothing left to flag except the info-level signer note. */
function healthyState(): GeneratorState {
  return {
    v: 1,
    fields: {
      clientCompany: "Hunzinger Construction",
      clientContacts: "Kevin Sanducker | Safety Director | kevin@hunzinger.example | 262-555-0134",
      customSummary: "A focused engagement covering the scope in the schedule below.",
      packageSelect: "blank",
      proposalTeamMembers: MEMBER_ID,
      proposalSigner: SIGNER_ID,
    },
    phases: [],
    services: [{ type: "service", key: "complianceAudit", name: "", qty: 1, price: 1750, desc: "", unit: "" }],
  };
}

function ids(findings: ReturnType<typeof collectReadinessFindings>): string[] {
  return findings.map((finding) => finding.id);
}

describe("collectReadinessFindings", () => {
  it("reports the absence of content as the single finding", () => {
    const findings = collectReadinessFindings(null, meta());
    expect(ids(findings)).toEqual(["no_form_data"]);
    expect(findings[0].severity).toBe("error");
  });

  it("passes a healthy proposal with no errors and no warnings", () => {
    const findings = collectReadinessFindings(healthyState(), meta());
    expect(findings.filter((finding) => finding.severity !== "info")).toEqual([]);
  });

  it("flags a missing client company as an error", () => {
    const state = healthyState();
    delete state.fields.clientCompany;
    expect(ids(collectReadinessFindings(state, meta()))).toContain("client_missing");
  });

  it("warns when the proposal row is not assigned to a company record", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ clientAssigned: false }));
    const finding = findings.find((entry) => entry.id === "client_unassigned");
    expect(finding?.severity).toBe("warn");
  });

  it("warns when no client contact has an email address", () => {
    const state = healthyState();
    state.fields.clientContacts = "Kevin Sanducker | Safety Director";
    expect(ids(collectReadinessFindings(state, meta()))).toContain("client_contact_email");
  });

  it("warns on an empty executive summary", () => {
    const state = healthyState();
    state.fields.customSummary = "   ";
    expect(ids(collectReadinessFindings(state, meta()))).toContain("summary_empty");
  });

  it("warns when no team bios are selected — every proposal names who does the work", () => {
    const state = healthyState();
    delete state.fields.proposalTeamMembers;
    const finding = collectReadinessFindings(state, meta()).find((entry) => entry.id === "team_bios");
    expect(finding?.severity).toBe("warn");
  });

  it("notes a missing signer at info level", () => {
    const state = healthyState();
    delete state.fields.proposalSigner;
    const finding = collectReadinessFindings(state, meta()).find((entry) => entry.id === "signer");
    expect(finding?.severity).toBe("info");
  });

  it("treats an unresolved {{placeholder}} anywhere as an error and names the location", () => {
    const state = healthyState();
    state.fields.customSummary = "Prepared for {{client_name}} with care.";
    state.services[0].desc = "Audit of {{site_count}} facilities.";
    const finding = collectReadinessFindings(state, meta()).find((entry) => entry.id === "placeholders");
    expect(finding?.severity).toBe("error");
    expect(finding?.message).toContain("customSummary");
    expect(finding?.message).toContain("service line 1");
  });

  it("warns when the total is zero", () => {
    const state = healthyState();
    state.services = [];
    expect(ids(collectReadinessFindings(state, meta()))).toContain("total_zero");
  });

  it("folds figure drift in from the consistency scanner", () => {
    const state = healthyState();
    state.fields.includedUsers = "50";
    state.services[0].desc = "Coverage for up to 20 users during the audit.";
    const findings = collectReadinessFindings(state, meta());
    const drift = findings.find((entry) => entry.id.startsWith("figures:"));
    expect(drift?.severity).toBe("warn");
    expect(drift?.message).toContain("Included Users");
  });

  it("errors on an expired validity date while the proposal can still be accepted", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: "2026-08-01", status: "sent" }));
    expect(ids(findings)).toContain("valid_until_past");
  });

  it("ignores the validity date once the proposal is accepted", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: "2026-08-01", status: "accepted" }));
    expect(ids(findings)).not.toContain("valid_until_past");
  });

  it("accepts a future validity date silently", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: "2026-12-31", status: "sent" }));
    expect(ids(findings)).not.toContain("valid_until_past");
    expect(ids(findings)).not.toContain("valid_until_soon");
  });

  it("warns when a sent proposal is within a week of expiring", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: "2026-08-15", status: "sent" }));
    const finding = findings.find((entry) => entry.id === "valid_until_soon");
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("4 days");
  });

  it("says so on the last acceptable day", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: TODAY, status: "sent" }));
    expect(findings.find((entry) => entry.id === "valid_until_soon")?.message).toContain("last day");
  });

  it("does not nag about an approaching expiry on a draft", () => {
    const findings = collectReadinessFindings(healthyState(), meta({ validUntil: "2026-08-15", status: "draft" }));
    expect(ids(findings)).not.toContain("valid_until_soon");
  });
});

/* -------------------------------------------------------------------------- */
/* Commercial terms                                                            */
/* -------------------------------------------------------------------------- */

describe("commercial terms checks", () => {
  it("flags a deposit due at acceptance that the payment terms never mention", () => {
    const state = healthyState();
    state.fields.depositPct = "25";
    state.fields.paymentTerms = "Net 30 from invoice date";
    const finding = collectReadinessFindings(state, meta()).find((entry) => entry.id === "deposit_vs_payment_terms");
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("due at acceptance");
  });

  it("stays quiet when the payment terms do cover the deposit", () => {
    const state = healthyState();
    state.fields.depositPct = "25";
    state.fields.paymentTerms = "25% deposit due at acceptance, balance Net 30";
    expect(ids(collectReadinessFindings(state, meta()))).not.toContain("deposit_vs_payment_terms");
  });

  it("stays quiet when there is no deposit at all", () => {
    const state = healthyState();
    state.fields.paymentTerms = "Net 30 from invoice date";
    expect(ids(collectReadinessFindings(state, meta()))).not.toContain("deposit_vs_payment_terms");
  });

  it("catches a validity date that contradicts the days printed beside it", () => {
    const state = healthyState();
    state.fields.validDays = "60";
    state.fields.proposalDate = "2026-08-01";
    // 2026-08-16 is 15 days out, not 60.
    const finding = collectReadinessFindings(state, meta({ validUntil: "2026-08-16" })).find(
      (entry) => entry.id === "valid_days_vs_valid_until",
    );
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("60 days");
    expect(finding?.message).toContain("15 days");
  });

  it("tolerates rounding between the two", () => {
    const state = healthyState();
    state.fields.validDays = "60";
    state.fields.proposalDate = "2026-08-01";
    // 61 days — a seller rounding to "60 days" is not a defect.
    expect(ids(collectReadinessFindings(state, meta({ validUntil: "2026-10-01" })))).not.toContain(
      "valid_days_vs_valid_until",
    );
  });

  it("errors on an engagement term that ends before it starts", () => {
    const state = healthyState();
    Object.assign(state.fields, {
      termStartMonth: "9",
      termStartYear: "2026",
      termEndMonth: "3",
      termEndYear: "2026",
    });
    const finding = collectReadinessFindings(state, meta()).find((entry) => entry.id === "term_reversed");
    expect(finding?.severity).toBe("error");
  });

  it("warns when the engagement starts after the proposal stops being acceptable", () => {
    const state = healthyState();
    Object.assign(state.fields, {
      termStartMonth: "11",
      termStartYear: "2026",
      termEndMonth: "12",
      termEndYear: "2026",
    });
    const finding = collectReadinessFindings(state, meta({ validUntil: "2026-09-30" })).find(
      (entry) => entry.id === "term_starts_after_validity",
    );
    expect(finding?.severity).toBe("warn");
    expect(finding?.message).toContain("November 2026");
  });

  it("accepts a term that starts within the acceptance window", () => {
    const state = healthyState();
    Object.assign(state.fields, {
      termStartMonth: "9",
      termStartYear: "2026",
      termEndMonth: "12",
      termEndYear: "2026",
    });
    expect(ids(collectReadinessFindings(state, meta({ validUntil: "2026-09-30" })))).not.toContain(
      "term_starts_after_validity",
    );
  });

  it("flags pilot billing on a proposal that is not a pilot", () => {
    const state = healthyState();
    state.fields.billingTerm = "One-time (pilot)";
    state.fields.packageSelect = "enterprise";
    expect(ids(collectReadinessFindings(state, meta()))).toContain("billing_term_says_pilot");
  });

  it("allows pilot billing on an actual pilot", () => {
    const state = healthyState();
    state.fields.billingTerm = "One-time (pilot)";
    state.fields.packageSelect = "custom";
    expect(ids(collectReadinessFindings(state, meta()))).not.toContain("billing_term_says_pilot");
  });
});
