// Render tests for the AI review panel.
//
// review-checks.test.ts proves the detection; route.test.ts proves the
// endpoint. These assertions cover what only the component does: the automated
// findings reach the screen at any stage, the drafted edits render as
// before/after diffs that apply ONLY on a human's tick — through the bridge in
// the editor, through saveProposalDraft on the detail page — and a locked
// proposal shows the drafts read-only.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

// Server Actions cannot run under vitest; the panel only needs them to resolve.
vi.mock("@/app/employee/proposals/actions", () => ({
  saveProposalDraft: vi.fn(async () => ({ ok: true })),
}));

import { saveProposalDraft } from "@/app/employee/proposals/actions";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { ProposalAiReviewPanel } from "./ProposalAiReviewPanel";

const saveMock = vi.mocked(saveProposalDraft);

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

const reviewWithEdit = {
  deterministic: [],
  ai: {
    verdict: "needs_attention",
    summary: "Solid scope; one service description overpromises.",
    findings: [
      { area: "terms", severity: "warn", message: "Assumptions omit client obligations.", suggestion: "State what the client provides." },
    ],
    edits: [],
  },
  edits: [
    {
      regionId: "service:0",
      kind: "service",
      target: "0",
      label: "Service line 1: Compliance Audit",
      // EXACTLY the catalog sentence for `complianceAudit`. The row stores an
      // empty desc, so this is the text the document prints and the reviewer
      // was shown — and the apply guard compares against it, resolved the same
      // way. A paraphrase here means the edit is (correctly) refused as stale.
      before:
        "Structured audit against OSHA and company program requirements, delivered as a scored findings report with prioritized corrective actions and due dates.",
      after: "A structured audit scored against OSHA requirements, delivered as a findings report.",
      note: "tightened scope",
      changed: true,
    },
  ],
  model: "gpt-4o-mini",
  requiresHumanReview: true,
  status: "in_review",
};

function stubFetch(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })));
}

function renderPanel(options: { status?: Parameters<typeof ProposalAiReviewPanel>[0]["status"]; onApply?: (patch: unknown) => void } = {}) {
  return render(
    <ProposalAiReviewPanel
      proposalId={PROPOSAL_ID}
      status={options.status ?? "in_review"}
      state={gappyState()}
      validUntil={null}
      clientAssigned={true}
      onApply={options.onApply as never}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProposalAiReviewPanel", () => {
  it("shows the automated checks and the human-in-the-loop framing before any run", () => {
    renderPanel();
    expect(screen.getByText("AI review")).toBeTruthy();
    expect(screen.getByText(/Available at every stage/)).toBeTruthy();
    expect(screen.getByText(/nothing lands on the proposal until you read/)).toBeTruthy();
    expect(screen.getByText("Automated checks")).toBeTruthy();
    expect(screen.getByText(/prints no bios/)).toBeTruthy();
    expect(screen.getByText(/executive summary is empty/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Run AI review/ })).toBeTruthy();
  });

  it("names the workflow stage it is reviewing", () => {
    renderPanel({ status: "sent" });
    expect(screen.getByText(/Stage:/).textContent).toContain("Sent");
  });

  it("renders findings and drafted edits after a run, applied to nothing", async () => {
    stubFetch(reviewWithEdit);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));

    await waitFor(() => expect(screen.getByText("AI reviewer")).toBeTruthy());
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/Suggestion: State what the client provides./)).toBeTruthy();
    expect(screen.getByText("Proposed changes")).toBeTruthy();
    expect(screen.getByText("Nothing applied yet")).toBeTruthy();
    expect(screen.getByText(/Structured audit against OSHA and company program requirements/)).toBeTruthy();
    expect(screen.getByText(/delivered as a findings report/)).toBeTruthy();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("applies ticked edits through saveProposalDraft on the detail page and refreshes", async () => {
    stubFetch(reviewWithEdit);
    renderPanel({ status: "in_review" });
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText("Proposed changes")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Apply 1 change and save/ }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [savedId, savedState] = saveMock.mock.calls[0] as [string, GeneratorState];
    expect(savedId).toBe(PROPOSAL_ID);
    expect(savedState.services[0].desc).toBe(
      "A structured audit scored against OSHA requirements, delivered as a findings report.",
    );
    // Everything else passes through untouched.
    expect(savedState.services[0].price).toBe(1750);
    expect(savedState.fields.clientCompany).toBe("Hunzinger Construction");
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/Applied and saved 1 change/)).toBeTruthy());
  });

  it("hands ticked edits to the editor bridge when mounted with onApply, and does not save itself", async () => {
    const onApply = vi.fn();
    stubFetch(reviewWithEdit);
    renderPanel({ status: "draft", onApply });
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText("Proposed changes")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Apply 1 change$/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const patch = onApply.mock.calls[0][0] as { services?: Array<{ desc: string }>; fields?: unknown };
    expect(patch.services?.[0].desc).toBe(
      "A structured audit scored against OSHA requirements, delivered as a findings report.",
    );
    expect(patch.fields).toBeUndefined();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Save when the wording reads right/)).toBeTruthy();
  });

  it("refuses an edit whose target text changed after the review ran", async () => {
    // The index in an edit is resolved against the state POSTed at review time.
    // If the seller edits or reorders lines before clicking Apply, that index
    // can point at a different row — and the diff on screen still shows the old
    // text, so a human reading it carefully would see nothing wrong. The guard
    // compares the text being replaced against the text that was reviewed.
    stubFetch({
      ...reviewWithEdit,
      edits: [{ ...reviewWithEdit.edits[0], before: "A paragraph that is no longer in this proposal." }],
    });
    const onApply = vi.fn();
    renderPanel({ status: "draft", onApply });
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText("Proposed changes")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Apply 1 change$/ }));

    expect(onApply).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/changed after the review ran/)).toBeTruthy());
  });

  it("shows drafts read-only on a locked proposal — no apply, no checkboxes", async () => {
    stubFetch({ ...reviewWithEdit, status: "sent" });
    renderPanel({ status: "sent" });
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText("Proposed changes")).toBeTruthy());

    expect(screen.getByText(/This proposal is locked/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Apply/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("surfaces the skip reason when the AI layer is unavailable", async () => {
    stubFetch({
      deterministic: [],
      ai: null,
      aiSkippedReason: "AI budget reached for today. It resets at midnight UTC.",
      requiresHumanReview: true,
      status: "draft",
    });
    renderPanel({ status: "draft" });
    fireEvent.click(screen.getByRole("button", { name: /Run AI review/ }));
    await waitFor(() => expect(screen.getByText(/AI budget reached/)).toBeTruthy());
  });
});
