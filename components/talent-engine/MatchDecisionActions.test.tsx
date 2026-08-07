// Partial-outcome tests for the Talent Engine's approval buttons.
//
// The failure these exist to prevent, observed in production on 2026-08-07:
// "Approve & Submit" chains approveMatch() then submitMatch(). The approval
// lands, the submittal is refused (an unverified required certification), and
// because approveMatch() ends with revalidatePath(), Next re-renders the queue
// — which selects only `pending_approval` / `counter_proposed` — and the card
// is removed. Any message held in the card's own state goes with it. The
// operator saw a card vanish and concluded the candidate had gone to a client.
// Nothing had been sent.
//
// So the assertions below are about two things and nothing else:
//   1. a refused submittal is reported as APPROVED-BUT-NOT-SUBMITTED, never as
//      a success, and names why;
//   2. that report OUTLIVES the card. `unmount()` here stands in for the queue
//      re-render that removes it in production.
//
// The actions module is mocked wholesale — a component test must never reach
// Supabase, and the real module is server-only anyway.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/talent-engine",
}));

vi.mock("@/app/employee/talent-engine/actions", () => ({
  approveMatch: vi.fn(async () => ({ ok: true })),
  counterMatch: vi.fn(async () => ({ ok: true })),
  holdMatch: vi.fn(async () => ({ ok: true })),
  rejectMatch: vi.fn(async () => ({ ok: true })),
  submitMatch: vi.fn(async () => ({ ok: true })),
}));

import { approveMatch, rejectMatch, submitMatch } from "@/app/employee/talent-engine/actions";
import { MatchDecisionActions, dismissPartialSubmittalBanner } from "./MatchDecisionActions";

const MATCH_ID = "44444444-4444-4444-8444-444444444444";
const CANDIDATE = "Marisol Vega";
const DESK_HREF = "/employee/talent-engine/desk";

/** The exact wording assertSubmittable() returns for an unverified cert. */
const certBlock =
  'Cannot submit: OSHA 30 is required by "Refinery Turnaround Safety Lead" and has not been verified.';

function renderActions(overrides: Partial<Parameters<typeof MatchDecisionActions>[0]> = {}) {
  return render(
    <MatchDecisionActions
      aiDraft="Strong fit on vertical and spread."
      belowFloor={false}
      canApprove
      canSetRate
      candidateName={CANDIDATE}
      matchId={MATCH_ID}
      proposedPayRate={null}
      {...overrides}
    />,
  );
}

/** The out-of-tree banner, or null. Deliberately found by id: it is not part of any card. */
function banner(): HTMLElement | null {
  const host = document.getElementById("talent-partial-outcome-banner");
  return host?.firstElementChild ? (host.firstElementChild as HTMLElement) : null;
}

const approveButton = () => screen.getByRole("button", { name: `Approve and submit ${CANDIDATE}` });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(approveMatch).mockResolvedValue({ ok: true });
  vi.mocked(submitMatch).mockResolvedValue({ ok: true });
  vi.mocked(rejectMatch).mockResolvedValue({ ok: true });
});

afterEach(async () => {
  // The banner is intentionally immune to RTL's cleanup(), so clear it by hand
  // and let React flush the empty render before the next test queries the DOM.
  dismissPartialSubmittalBanner();
  await act(async () => {});
});

describe("Approve & Submit — clean success", () => {
  it("stays one click: approves, submits, refreshes, and says nothing extra", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(approveMatch).toHaveBeenCalledWith(MATCH_ID, undefined);
    expect(submitMatch).toHaveBeenCalledWith(MATCH_ID);
    // No confirmation step, no banner, no error on the happy path.
    expect(banner()).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Approve & Submit — approval lands, submittal refused", () => {
  it("reports both steps separately and never as a success", async () => {
    vi.mocked(submitMatch).mockResolvedValue({ ok: false, error: certBlock });
    const user = userEvent.setup();
    const view = renderActions();

    await user.click(approveButton());

    const notice = await waitFor(() => {
      const found = banner();
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

    // The two steps are distinguished, and the server's own reason is carried
    // through verbatim rather than paraphrased.
    expect(notice).toHaveAttribute("role", "alert");
    expect(notice).toHaveTextContent(/Approved/);
    expect(notice).toHaveTextContent(/NOT submitted/);
    expect(notice).toHaveTextContent(CANDIDATE);
    expect(notice).toHaveTextContent(/nothing has been sent/i);
    expect(notice).toHaveTextContent(certBlock);

    // Belt and braces: on the chance this card does outlive the action, the
    // inline error says the same thing rather than nothing or something softer.
    const inline = within(view.container).getByRole("alert");
    expect(inline).toHaveTextContent(/NOT submitted/);
    expect(inline).toHaveTextContent(certBlock);
    expect(inline).toHaveTextContent(DESK_HREF);

    // A partial outcome is not a completed decision: no queue refresh is claimed.
    expect(refresh).not.toHaveBeenCalled();
  });

  it("tells the operator where to finish it", async () => {
    vi.mocked(submitMatch).mockResolvedValue({ ok: false, error: certBlock });
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());
    const notice = await waitFor(() => banner() as HTMLElement);

    const link = within(notice).getByRole("link", { name: /placement desk/i });
    expect(link).toHaveAttribute("href", DESK_HREF);
    expect(notice).toHaveTextContent(/retry the submittal/i);
  });

  it("SURVIVES the queue re-render that removes the card", async () => {
    vi.mocked(submitMatch).mockResolvedValue({ ok: false, error: certBlock });
    const user = userEvent.setup();
    const view = renderActions();

    await user.click(approveButton());
    await waitFor(() => expect(banner()).not.toBeNull());

    // What Next does after approveMatch()'s revalidatePath(): the match is no
    // longer `pending_approval`, so the card is dropped from the queue.
    view.unmount();

    expect(screen.queryByRole("button", { name: `Approve and submit ${CANDIDATE}` })).not.toBeInTheDocument();
    const notice = banner();
    expect(notice).not.toBeNull();
    expect(notice).toHaveTextContent(certBlock);
    expect(within(notice as HTMLElement).getByRole("link", { name: /placement desk/i })).toHaveAttribute(
      "href",
      DESK_HREF,
    );
  });

  it("does not clear itself — only a human dismiss removes it", async () => {
    vi.mocked(submitMatch).mockResolvedValue({ ok: false, error: certBlock });
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());
    const notice = await waitFor(() => banner() as HTMLElement);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(banner()).not.toBeNull();

    await user.click(within(notice).getByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(banner()).toBeNull());
  });

  it("treats a submittal that throws the same way — never silence", async () => {
    vi.mocked(submitMatch).mockRejectedValue(new Error("socket hang up"));
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());

    const notice = await waitFor(() => banner() as HTMLElement);
    expect(notice).toHaveTextContent(/NOT submitted/);
    expect(notice).toHaveTextContent(/did not answer/i);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("Approve & Submit — approval refused", () => {
  it("never reaches the submittal and reports inline, where the card still is", async () => {
    const refusal = "This match's 4 spread is under the 12 floor. Add a note explaining the exception.";
    vi.mocked(approveMatch).mockResolvedValue({ ok: false, error: refusal });
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(refusal);
    expect(submitMatch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    // Nothing was approved, so nothing claims an approval.
    expect(banner()).toBeNull();
  });

  it("surfaces a field-level refusal when there is no top-level error", async () => {
    vi.mocked(approveMatch).mockResolvedValue({ ok: false, fieldErrors: { note: "A note is required." } });
    const user = userEvent.setup();
    renderActions();

    await user.click(approveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("A note is required.");
    expect(submitMatch).not.toHaveBeenCalled();
  });
});

describe("Every other decision", () => {
  it("reports a thrown Server Action instead of failing silently", async () => {
    vi.mocked(rejectMatch).mockRejectedValue(new Error("Failed to fetch"));
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: `Reject ${CANDIDATE}` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/did not answer/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the decision buttons closed to a reviewer without approval rights", () => {
    renderActions({ canApprove: false });

    expect(approveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: `Reject ${CANDIDATE}` })).toBeDisabled();
    expect(screen.getByText(/human gate/i)).toBeInTheDocument();
  });
});
