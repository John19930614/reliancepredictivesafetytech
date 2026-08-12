// Render tests for the AI review panel.
//
// review-checks.test.ts proves the detection; route.test.ts proves the
// endpoint. These assertions cover what only the component does: the automated
// findings actually reach the screen at any stage, the advisory framing is
// always present, and a run renders the model's findings as advisory content
// rather than applying anything.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { ProposalAiReviewPanel } from "./ProposalAiReviewPanel";

const PROPOSAL_ID = "11111111-2222-4333-8444-555555555555";

/** Missing team + summary, so the automated layer has something to say. */
function gappyState(): GeneratorState {
  return {
    v: 1,
    fields: {
      clientCompany: "Hunzinger Construction",
      clientContacts: "Kevin Sanducker | Safety Director | kevin@hunzinger.example",
      packageSelect: "blank",
    },
    phases: [],
    services: [{ type: "service", key: "complianceAudit", name: "", qty: 1, price: 1750, desc: "", unit: "" }],
  };
}

function renderPanel(status: Parameters<typeof ProposalAiReviewPanel>[0]["status"] = "in_review") {
  return render(
    <ProposalAiReviewPanel
      proposalId={PROPOSAL_ID}
      status={status}
      state={gappyState()}
      validUntil={null}
      clientAssigned={true}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProposalAiReviewPanel", () => {
  it("shows the automated checks and the advisory framing before any run", () => {
    renderPanel();
    expect(screen.getByText("AI review")).toBeTruthy();
    expect(screen.getByText(/Advisory only, at every stage/)).toBeTruthy();
    expect(screen.getByText("Automated checks")).toBeTruthy();
    expect(screen.getByText(/prints no bios/)).toBeTruthy();
    expect(screen.getByText(/executive summary is empty/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Run AI review/ })).toBeTruthy();
  });

  it("names the workflow stage it is reviewing", () => {
    renderPanel("sent");
    expect(screen.getByText(/Stage:/).textContent).toContain("Sent");
  });

  it("renders the model's findings as advisory content after a run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          deterministic: [],
          ai: {
            verdict: "needs_attention",
            summary: "Solid scope; the assumptions block is thin.",
            findings: [
              { area: "terms", severity: "warn", message: "Assumptions omit client obligations.", suggestion: "State what the client provides." },
            ],
          },
          model: "gpt-4o-mini",
          requiresHumanReview: true,
          status: "in_review",
        }),
      })),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));

    await waitFor(() => expect(screen.getByText("AI reviewer")).toBeTruthy());
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText("Review before acting")).toBeTruthy();
    expect(screen.getByText(/assumptions block is thin/)).toBeTruthy();
    expect(screen.getByText(/Suggestion: State what the client provides./)).toBeTruthy();
  });

  it("surfaces the skip reason when the AI layer is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          deterministic: [],
          ai: null,
          aiSkippedReason: "AI budget reached for today. It resets at midnight UTC.",
          requiresHumanReview: true,
          status: "draft",
        }),
      })),
    );

    renderPanel("draft");
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText(/AI budget reached/)).toBeTruthy());
  });
});
