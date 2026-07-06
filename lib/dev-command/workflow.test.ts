import { describe, expect, it } from "vitest";
import { isGate, isTerminal, nextStage, phaseForStage, stageIndex, WORKFLOW_STAGES } from "./workflow";

describe("dev-command workflow", () => {
  it("orders the 17 stages from intake to complete", () => {
    expect(WORKFLOW_STAGES[0]).toBe("intake");
    expect(WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1]).toBe("complete");
    expect(WORKFLOW_STAGES.length).toBe(17);
  });

  it("advances to the next stage in order", () => {
    expect(nextStage("intake")).toBe("requirements_review");
    expect(nextStage("approval_required")).toBe("approved_for_drafting");
  });

  it("returns null past the terminal stage or for an unknown stage", () => {
    expect(nextStage("complete")).toBeNull();
    expect(nextStage("not_a_stage")).toBeNull();
  });

  it("identifies the two human-approval gate stages", () => {
    expect(isGate("approval_required")).toBe(true);
    expect(isGate("human_final_approval")).toBe(true);
    expect(isGate("code_draft")).toBe(false);
  });

  it("identifies terminal stages, including off-ramps not in the ordered list", () => {
    expect(isTerminal("complete")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("blocked")).toBe(true);
    expect(isTerminal("intake")).toBe(false);
  });

  it("reports stage position for progress display", () => {
    expect(stageIndex("intake")).toBe(0);
    expect(stageIndex("complete")).toBe(WORKFLOW_STAGES.length - 1);
    expect(stageIndex("not_a_stage")).toBe(-1);
  });

  it("maps stages to the agent phase that drives them", () => {
    expect(phaseForStage("code_draft")).toBe("draft");
    expect(phaseForStage("qa_review")).toBe("test");
    expect(phaseForStage("intake")).toBe("other");
  });
});
