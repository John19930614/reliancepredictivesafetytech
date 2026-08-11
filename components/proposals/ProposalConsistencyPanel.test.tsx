// Render tests for the Figures check panel.
//
// consistency.test.ts already proves the detection arithmetic. Nothing here
// re-tests that. These assertions are about the two things only the component
// does, both of which write to a client-facing document if they are wrong:
//
//   * the mismatches actually reach the screen, so a seller is told before the
//     proposal goes out rather than after;
//   * "Apply" maps a revision back onto the RIGHT line item. The bridge rebuilds
//     the phase/service lists from whatever array it is handed, so an off-by-one
//     here would move one line's scope paragraph onto another line — a worse
//     defect than the stale number it set out to fix.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import { ProposalConsistencyPanel, type NarrativePatch } from "./ProposalConsistencyPanel";

const PROPOSAL_ID = "11111111-2222-4333-8444-555555555555";

/** includedUsers 50 / includedSites 5, with two lines still quoting the old scope. */
function driftedState(): GeneratorState {
  return {
    v: 1,
    fields: {
      packageSelect: "custom",
      annualPrice: "5000",
      includedUsers: "50",
      includedSites: "5",
      customSummary: "A pilot covering up to 50 users at five jobsites.",
    },
    phases: [
      {
        type: "phase",
        key: "discovery",
        name: "Discovery & Intake",
        qty: 1,
        price: 0,
        unit: "",
        desc: "Account setup and provisioning of up to 20 users.",
      },
      {
        type: "phase",
        key: "build",
        name: "Build & Configure",
        qty: 1,
        price: 0,
        unit: "",
        desc: "Live field use by up to 20 users at one jobsite.",
      },
    ],
    services: [],
  };
}

function cleanState(): GeneratorState {
  const state = driftedState();
  state.phases[0].desc = "Account setup and provisioning of up to 50 users.";
  state.phases[1].desc = "Live field use by up to 50 users across five jobsites.";
  return state;
}

/** The endpoint's reply for the two drifted phases. */
const draftResponse = {
  requiresHumanReview: true,
  findingCount: 3,
  revisions: [
    {
      regionId: "phase:1",
      kind: "phase",
      target: "1",
      label: "Phase 2: Build & Configure",
      before: "Live field use by up to 20 users at one jobsite.",
      after: "Live field use by up to 50 users across five jobsites.",
      note: "20 -> 50 users, one -> five jobsites",
      changed: true,
    },
  ],
};

function mockFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({ ok, json: async () => payload }) as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProposalConsistencyPanel", () => {
  it("names every mismatch and the figure the fields actually carry", () => {
    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={driftedState()} disabled={false} onApply={() => {}} />,
    );

    expect(screen.getByText(/3 mismatches/i)).toBeInTheDocument();
    expect(screen.getByText("Phase 1: Discovery & Intake")).toBeInTheDocument();
    expect(screen.getByText("Phase 2: Build & Configure")).toBeInTheDocument();
    expect(screen.getAllByText(/Included Users is 50/)).toHaveLength(2);
    expect(screen.getByText(/Included Jobsites is 5/)).toBeInTheDocument();
  });

  it("says plainly that it corrects nothing on its own, and counts the fixes on the button", () => {
    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={driftedState()} disabled={false} onApply={() => {}} />,
    );

    expect(screen.getByText(/Nothing below is corrected automatically/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix these 3 figures with AI/i })).toBeInTheDocument();
  });

  it("reports an all-clear and offers no rewrite when the prose already agrees", () => {
    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={cleanState()} disabled={false} onApply={() => {}} />,
    );

    expect(screen.getByText(/Narrative matches the fields/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fix .* with AI/i })).not.toBeInTheDocument();
  });

  it("posts the live state and shows the draft as before/after without applying it", async () => {
    const fetchMock = mockFetch(draftResponse);
    const onApply = vi.fn();
    const state = driftedState();

    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={state} disabled={false} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix .* with AI/i }));

    await waitFor(() => expect(screen.getByText(/Proposed wording/i)).toBeInTheDocument());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/proposals/${PROPOSAL_ID}/narrative`);
    expect(JSON.parse(String(init.body))).toEqual({ formData: state });

    expect(screen.getByText("Live field use by up to 20 users at one jobsite.")).toBeInTheDocument();
    expect(screen.getByText("Live field use by up to 50 users across five jobsites.")).toBeInTheDocument();
    expect(screen.getByText(/Review before applying/i)).toBeInTheDocument();
    // Nothing may reach the document until the seller says so.
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies a revision to its own line item and leaves the others byte-identical", async () => {
    mockFetch(draftResponse);
    const onApply = vi.fn();
    const state = driftedState();

    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={state} disabled={false} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix .* with AI/i }));
    await waitFor(() => expect(screen.getByText(/Proposed wording/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 passage/i }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const patch = onApply.mock.calls[0][0] as NarrativePatch;

    // The whole array goes back, because the bridge rebuilds the list wholesale.
    expect(patch.phases).toHaveLength(2);
    // Index 1 is the one the revision addressed.
    expect(patch.phases?.[1].desc).toBe("Live field use by up to 50 users across five jobsites.");
    // Index 0 is untouched, and every non-desc field survives on both.
    expect(patch.phases?.[0]).toEqual(state.phases[0]);
    expect(patch.phases?.[1]).toEqual({ ...state.phases[1], desc: patch.phases![1].desc });
    // No field or service edits were in this draft, so neither key is sent.
    expect(patch.fields).toBeUndefined();
    expect(patch.services).toBeUndefined();
  });

  it("lets the seller untick a passage, and applies nothing when none are left", async () => {
    mockFetch(draftResponse);
    const onApply = vi.fn();

    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={driftedState()} disabled={false} onApply={onApply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix .* with AI/i }));
    await waitFor(() => expect(screen.getByText(/Proposed wording/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("checkbox"));
    const applyButton = screen.getByRole("button", { name: /Apply 0 passages/i });
    expect(applyButton).toBeDisabled();
    fireEvent.click(applyButton);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("still shows the mismatches on a locked proposal, but will not draft or apply", () => {
    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={driftedState()} disabled onApply={() => {}} />,
    );

    expect(screen.getByText(/3 mismatches/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix .* with AI/i })).toBeDisabled();
    expect(screen.getByText(/Reopen it as a draft first/i)).toBeInTheDocument();
  });

  it("surfaces an endpoint error instead of failing silently", async () => {
    mockFetch({ error: "AI budget reached for today." }, false);

    render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={driftedState()} disabled={false} onApply={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fix .* with AI/i }));

    await waitFor(() => expect(screen.getByText("AI budget reached for today.")).toBeInTheDocument());
    expect(screen.queryByText(/Proposed wording/i)).not.toBeInTheDocument();
  });

  it("renders nothing at all before the generator has reported any state", () => {
    const { container } = render(
      <ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={null} disabled={false} onApply={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProposalConsistencyPanel — field passages", () => {
  it("routes an executive-summary rewrite into fields, not into a line item", async () => {
    mockFetch({
      requiresHumanReview: true,
      findingCount: 1,
      revisions: [
        {
          regionId: "field:customSummary",
          kind: "field",
          target: "customSummary",
          label: "Executive summary",
          before: "A pilot covering up to 20 users.",
          after: "A pilot covering up to 50 users.",
          note: "20 -> 50 users",
          changed: true,
        },
      ],
    });
    const onApply = vi.fn();
    const state = driftedState();
    state.fields.customSummary = "A pilot covering up to 20 users.";

    render(<ProposalConsistencyPanel proposalId={PROPOSAL_ID} state={state} disabled={false} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Fix .* with AI/i }));
    await waitFor(() => expect(screen.getByText(/Proposed wording/i)).toBeInTheDocument());

    // "Executive summary" appears twice — once as the findings heading and once
    // as this card's label — so the card is reached through its checkbox.
    const card = screen.getByRole("checkbox").closest("label")!;
    expect(within(card).getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Apply 1 passage/i }));
    const patch = onApply.mock.calls[0][0] as NarrativePatch;
    expect(patch.fields).toEqual({ customSummary: "A pilot covering up to 50 users." });
    expect(patch.phases).toBeUndefined();
  });
});
