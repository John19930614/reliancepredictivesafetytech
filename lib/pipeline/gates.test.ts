import { describe, expect, it } from "vitest";
import { lifecycleStages } from "@/lib/company-data";
import { describeBlockers, evaluateStageGate, type ClientWorkflowFacts } from "./gates";

function facts(over: Partial<ClientWorkflowFacts> = {}): ClientWorkflowFacts {
  return {
    stage: "Lead",
    owner: "Dana Reyes",
    checklist: [],
    proposals: [],
    invoices: [],
    requiredDocuments: [],
    requiredDocumentsKnown: true,
    hasPrimaryContact: false,
    ...over,
  };
}

/** A completed checklist item, as the seeder writes them. */
function done(title: string, stage = "Lead") {
  return { title, lifecycle_stage: stage, completed: true };
}

function todo(title: string, stage = "Lead") {
  return { title, lifecycle_stage: stage, completed: false };
}

describe("every stage has a gate", () => {
  // An added stage with no requirements would be an open gate nobody noticed.
  // requirementsFor() has a `never` exhaustiveness guard for the compiler; this
  // is the runtime half — every stage must produce a verdict without throwing.
  it("evaluates without throwing for all thirteen stages", () => {
    for (const stage of lifecycleStages) {
      expect(() => evaluateStageGate(facts({ stage })), stage).not.toThrow();
    }
  });

  it("names the next stage for every stage but the last", () => {
    for (const stage of lifecycleStages) {
      const result = evaluateStageGate(facts({ stage }));
      if (stage === "Renewal / Expansion") {
        expect(result.nextStage).toBeNull();
        expect(result.canAdvance).toBe(false);
        expect(result.terminalReason).toBeTruthy();
      } else {
        expect(result.nextStage, stage).toBeTruthy();
      }
    }
  });
});

describe("Lead — an account needs an owner", () => {
  it("advances once an owner is named", () => {
    const result = evaluateStageGate(facts({ stage: "Lead", owner: "Dana Reyes" }));
    expect(result.canAdvance).toBe(true);
    expect(result.blockers).toHaveLength(0);
    expect(result.nextStage).toBe("First Pitch");
  });

  it("blocks with no owner, and treats whitespace as no owner", () => {
    for (const owner of [null, "", "   "]) {
      const result = evaluateStageGate(facts({ stage: "Lead", owner }));
      expect(result.canAdvance, String(owner)).toBe(false);
      expect(result.blockers[0].code).toBe("owner_assigned");
    }
  });
});

describe("checklist-backed gates", () => {
  it("opens when the named item is complete", () => {
    const result = evaluateStageGate(
      facts({ stage: "First Pitch", checklist: [done("First pitch completed")] }),
    );
    expect(result.canAdvance).toBe(true);
  });

  it("blocks when the item exists but is not ticked", () => {
    const result = evaluateStageGate(
      facts({ stage: "First Pitch", checklist: [todo("First pitch completed")] }),
    );
    expect(result.canAdvance).toBe(false);
    expect(result.blockers[0].code).toBe("first_pitch_completed");
  });

  it("blocks when the item is missing entirely", () => {
    // A gate must never pass because its evidence is absent.
    const result = evaluateStageGate(facts({ stage: "First Pitch", checklist: [] }));
    expect(result.canAdvance).toBe(false);
  });

  // The readiness signal this replaces compared raw titles with `===`, so an
  // item re-typed with different capitalisation silently stopped counting.
  it("matches the item title case- and whitespace-insensitively", () => {
    const result = evaluateStageGate(
      facts({ stage: "First Pitch", checklist: [done("  FIRST PITCH COMPLETED  ")] }),
    );
    expect(result.canAdvance).toBe(true);
  });
});

describe("Proposal Sent — a proposal has to have reached the client", () => {
  it("opens on a sent or accepted proposal", () => {
    for (const status of ["sent", "accepted"]) {
      const result = evaluateStageGate(facts({ stage: "Proposal Sent", proposals: [{ status }] }));
      expect(result.canAdvance, status).toBe(true);
    }
  });

  it("blocks on a proposal that never went out", () => {
    for (const status of ["draft", "in_review", "declined", "archived"]) {
      const result = evaluateStageGate(facts({ stage: "Proposal Sent", proposals: [{ status }] }));
      expect(result.canAdvance, status).toBe(false);
    }
  });
});

describe("Signed / Won — either route proves the client committed", () => {
  it("opens on the signed-contract checklist item", () => {
    const result = evaluateStageGate(
      facts({ stage: "Signed / Won", checklist: [done("Contract signed")] }),
    );
    expect(result.canAdvance).toBe(true);
    expect(result.nextStage).toBe("Invoicing");
  });

  it("opens on an accepted proposal without anyone re-ticking a box", () => {
    // Acceptance is captured evidence — requiring a manual tick on top would
    // strand every deal closed through the client's own share link.
    const result = evaluateStageGate(
      facts({ stage: "Signed / Won", proposals: [{ status: "accepted" }] }),
    );
    expect(result.canAdvance).toBe(true);
  });

  it("blocks on a merely sent proposal", () => {
    const result = evaluateStageGate(facts({ stage: "Signed / Won", proposals: [{ status: "sent" }] }));
    expect(result.canAdvance).toBe(false);
    expect(result.blockers[0].code).toBe("contract_signed");
  });
});

describe("Invoicing — the step that has to produce money", () => {
  it("opens on an issued invoice", () => {
    const result = evaluateStageGate(facts({ stage: "Invoicing", invoices: [{ status: "issued" }] }));
    expect(result.canAdvance).toBe(true);
    expect(result.nextStage).toBe("Onboarding");
  });

  it("opens on a paid invoice", () => {
    const result = evaluateStageGate(facts({ stage: "Invoicing", invoices: [{ status: "paid" }] }));
    expect(result.canAdvance).toBe(true);
  });

  // This is the distinction the whole billing step rests on: a draft is a
  // document nobody has seen, so it has not asked anyone for money.
  it("blocks on a draft invoice", () => {
    const result = evaluateStageGate(facts({ stage: "Invoicing", invoices: [{ status: "draft" }] }));
    expect(result.canAdvance).toBe(false);
    expect(result.blockers[0].code).toBe("invoice_issued");
  });

  it("blocks on a voided invoice", () => {
    const result = evaluateStageGate(facts({ stage: "Invoicing", invoices: [{ status: "void" }] }));
    expect(result.canAdvance).toBe(false);
  });

  it("opens when one of several invoices is issued", () => {
    const result = evaluateStageGate(
      facts({ stage: "Invoicing", invoices: [{ status: "void" }, { status: "draft" }, { status: "issued" }] }),
    );
    expect(result.canAdvance).toBe(true);
  });

  it("blocks when there are no invoices at all", () => {
    const result = evaluateStageGate(facts({ stage: "Invoicing", invoices: [] }));
    expect(result.canAdvance).toBe(false);
  });
});

describe("Onboarding — two requirements, both needed", () => {
  const onboardingItems = [done("Billing setup confirmed", "Onboarding"), done("Sample data received", "Onboarding")];

  it("opens when every onboarding item is done and a primary contact exists", () => {
    const result = evaluateStageGate(
      facts({ stage: "Onboarding", checklist: onboardingItems, hasPrimaryContact: true }),
    );
    expect(result.canAdvance).toBe(true);
  });

  it("blocks on a single unfinished onboarding item", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Onboarding",
        checklist: [...onboardingItems, todo("Onboarding meeting completed", "Onboarding")],
        hasPrimaryContact: true,
      }),
    );
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.map((b) => b.code)).toEqual(["onboarding_items_complete"]);
  });

  it("blocks with no primary contact", () => {
    const result = evaluateStageGate(
      facts({ stage: "Onboarding", checklist: onboardingItems, hasPrimaryContact: false }),
    );
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.map((b) => b.code)).toEqual(["primary_contact"]);
  });

  it("reports both blockers when both are outstanding", () => {
    const result = evaluateStageGate(facts({ stage: "Onboarding", checklist: [], hasPrimaryContact: false }));
    expect(result.blockers.map((b) => b.code)).toEqual(["onboarding_items_complete", "primary_contact"]);
  });

  // An empty item list is "nothing proves this is done", not "nothing to do".
  it("blocks when the client has no onboarding items seeded at all", () => {
    const result = evaluateStageGate(facts({ stage: "Onboarding", checklist: [], hasPrimaryContact: true }));
    expect(result.canAdvance).toBe(false);
  });

  it("ignores completed items belonging to other stages", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Onboarding",
        checklist: [done("Platform access confirmed", "Pilot / Setup")],
        hasPrimaryContact: true,
      }),
    );
    expect(result.canAdvance).toBe(false);
  });
});

describe("Active Company — going live is a claim that has to be backed", () => {
  const approval = [done("Active company approval complete", "Active Company")];

  it("opens with the approval done and every required document filed", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Active Company",
        checklist: approval,
        requiredDocuments: [{ title: "Master Services Agreement", required_for_active: true, satisfied: true }],
      }),
    );
    expect(result.canAdvance).toBe(true);
  });

  it("blocks on a missing required document and names it", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Active Company",
        checklist: approval,
        requiredDocuments: [{ title: "Master Services Agreement", required_for_active: true, satisfied: false }],
      }),
    );
    expect(result.canAdvance).toBe(false);
    expect(result.blockers[0].label).toContain("Master Services Agreement");
  });

  it("ignores documents that are not required for active status", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Active Company",
        checklist: approval,
        requiredDocuments: [{ title: "Marketing Deck", required_for_active: false, satisfied: false }],
      }),
    );
    expect(result.canAdvance).toBe(true);
  });

  // "No outstanding documents" and "no idea what the documents are" arrive here
  // as the same empty array. Only one of them should open the gate — this is the
  // one gate that used to fail OPEN when its evidence could not be read.
  it("stays shut when the requirement list could not be read at all", () => {
    const result = evaluateStageGate(
      facts({
        stage: "Active Company",
        checklist: approval,
        requiredDocuments: [],
        requiredDocumentsKnown: false,
      }),
    );
    expect(result.canAdvance).toBe(false);
    expect(result.blockers.map((b) => b.code)).toContain("required_documents");
    expect(result.blockers.find((b) => b.code === "required_documents")?.label).toContain("could not be read");
  });
});

describe("an unknown stored stage", () => {
  // lifecycle_stage is free text, so a hand-edited row can carry anything. The
  // client should be visibly stuck, not a 500.
  it("cannot advance, and says why instead of throwing", () => {
    const result = evaluateStageGate(facts({ stage: "Closed Won" }));
    expect(result.canAdvance).toBe(false);
    expect(result.nextStage).toBeNull();
    expect(result.requirements).toEqual([]);
    expect(result.terminalReason).toContain("Closed Won");
  });
});

describe("describeBlockers", () => {
  it("is null when nothing is outstanding", () => {
    expect(describeBlockers(evaluateStageGate(facts({ stage: "Lead", owner: "Dana" })))).toBeNull();
  });

  it("names the single outstanding requirement", () => {
    const result = evaluateStageGate(facts({ stage: "Lead", owner: null }));
    expect(describeBlockers(result)).toBe("Assign an owner for this account");
  });

  it("counts and lists several", () => {
    const result = evaluateStageGate(facts({ stage: "Onboarding", checklist: [], hasPrimaryContact: false }));
    const described = describeBlockers(result);
    expect(described).toContain("2 steps outstanding");
    expect(described).toContain("primary contact");
  });
});
