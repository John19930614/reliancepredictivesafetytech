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
  });
});
