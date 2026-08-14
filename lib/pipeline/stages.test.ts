import { describe, expect, it } from "vitest";
import { lifecycleStages } from "@/lib/company-data";
import {
  isAtOrPastStage,
  isLifecycleStage,
  nextStage,
  previousStage,
  stageCount,
  stageDetail,
  stageDetails,
  stageIndex,
  stageNumber,
  stagePosition,
} from "./stages";

describe("stage vocabulary", () => {
  // The stage strings are STORED values in company_clients.lifecycle_stage.
  // Renaming one strands every row carrying it, and reordering changes what
  // "next" means for every client mid-journey. This test pins both.
  it("keeps the journey in its stored order", () => {
    expect([...lifecycleStages]).toEqual([
      "Lead",
      "First Pitch",
      "Demo Scheduled",
      "Demo Completed",
      "Proposal Sent",
      "Legal Review",
      "Contract Sent",
      "Signed / Won",
      "Invoicing",
      "Onboarding",
      "Pilot / Setup",
      "Active Company",
      "Renewal / Expansion",
    ]);
  });

  it("bills before it onboards", () => {
    // The whole point of the Invoicing stage: a won deal is not an onboarding
    // client until it has been billed.
    expect(stageIndex("Invoicing")).toBeGreaterThan(stageIndex("Signed / Won"));
    expect(stageIndex("Invoicing")).toBeLessThan(stageIndex("Onboarding"));
  });

  it("gives every stage copy for the workflow card", () => {
    for (const stage of lifecycleStages) {
      const detail = stageDetails[stage];
      expect(detail, stage).toBeTruthy();
      expect(detail.headline.length, `${stage} headline`).toBeGreaterThan(0);
      expect(detail.body.length, `${stage} body`).toBeGreaterThan(0);
      expect(detail.lane.length, `${stage} lane`).toBeGreaterThan(0);
    }
  });

  it("gives an advance label to every stage that has somewhere to go", () => {
    for (const stage of lifecycleStages) {
      const label = stageDetails[stage].advanceLabel;
      if (nextStage(stage)) {
        expect(label, `${stage} should offer an advance label`).not.toBe("");
      } else {
        expect(label, "the last stage advances nowhere").toBe("");
      }
    }
  });

  it("reports the number of steps in the journey", () => {
    expect(stageCount).toBe(13);
    expect(stageCount).toBe(lifecycleStages.length);
  });
});

describe("stageIndex / isLifecycleStage", () => {
  it("locates a known stage", () => {
    expect(stageIndex("Lead")).toBe(0);
    expect(stageIndex("Renewal / Expansion")).toBe(stageCount - 1);
  });

  // lifecycle_stage is free text in the database, so these are real inputs,
  // not hypotheticals.
  it("returns -1 for anything that is not a stage", () => {
    for (const value of ["", "lead", "Closed Won", null, undefined, "  Lead  "]) {
      expect(stageIndex(value), String(value)).toBe(-1);
      expect(isLifecycleStage(value), String(value)).toBe(false);
    }
  });
});

describe("stageNumber", () => {
  it("is 1-based for display", () => {
    expect(stageNumber("Lead")).toBe(1);
    expect(stageNumber("Invoicing")).toBe(9);
  });

  it("is null rather than 0 for an unknown stage", () => {
    // A caller printing "STEP 0 OF 13" would be worse than printing nothing.
    expect(stageNumber("Nonsense")).toBeNull();
  });
});

describe("nextStage / previousStage", () => {
  it("walks the journey forwards", () => {
    expect(nextStage("Signed / Won")).toBe("Invoicing");
    expect(nextStage("Invoicing")).toBe("Onboarding");
  });

  it("has nowhere to go at the end", () => {
    expect(nextStage("Renewal / Expansion")).toBeNull();
  });

  it("walks backwards and stops at the start", () => {
    expect(previousStage("Invoicing")).toBe("Signed / Won");
    expect(previousStage("Lead")).toBeNull();
  });

  it("returns null for an unknown stage in both directions", () => {
    expect(nextStage("Nonsense")).toBeNull();
    expect(previousStage("Nonsense")).toBeNull();
  });
});

describe("stagePosition", () => {
  it("marks earlier stages done, the current one current, later ones future", () => {
    expect(stagePosition("Lead", "Invoicing")).toBe("done");
    expect(stagePosition("Invoicing", "Invoicing")).toBe("current");
    expect(stagePosition("Onboarding", "Invoicing")).toBe("future");
  });

  // A bad stored value should make the rail look unstarted, not take the page
  // down or claim the client has finished steps they have not.
  it("draws the whole rail as future when the client's stage is unknown", () => {
    for (const stage of lifecycleStages) {
      expect(stagePosition(stage, "Nonsense"), stage).toBe("future");
    }
  });
});

describe("isAtOrPastStage", () => {
  it("is true at the marker and beyond", () => {
    expect(isAtOrPastStage("Signed / Won", "Signed / Won")).toBe(true);
    expect(isAtOrPastStage("Active Company", "Signed / Won")).toBe(true);
  });

  it("is false before the marker and for unknown stages", () => {
    expect(isAtOrPastStage("Proposal Sent", "Signed / Won")).toBe(false);
    expect(isAtOrPastStage("Nonsense", "Signed / Won")).toBe(false);
    expect(isAtOrPastStage(null, "Signed / Won")).toBe(false);
  });

  // Regression: acceptance-income.ts used to carry a hand-written set of "the
  // stages after won". Inserting Invoicing between Signed / Won and Onboarding
  // made that set wrong, so a client mid-billing whose SECOND proposal was
  // accepted got dragged back a step. Every stage from won onward must count.
  it("counts every stage from Signed / Won onward as at-or-past won", () => {
    const wonIndex = stageIndex("Signed / Won");
    for (const stage of lifecycleStages) {
      const expected = stageIndex(stage) >= wonIndex;
      expect(isAtOrPastStage(stage, "Signed / Won"), stage).toBe(expected);
    }
    expect(isAtOrPastStage("Invoicing", "Signed / Won")).toBe(true);
  });
});

describe("stageDetail", () => {
  it("returns copy for a known stage and null otherwise", () => {
    expect(stageDetail("Invoicing")?.lane).toBe("Billing");
    expect(stageDetail("Nonsense")).toBeNull();
    expect(stageDetail(null)).toBeNull();
  });
});
