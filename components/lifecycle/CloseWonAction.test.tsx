// The button that calls a deal won.
//
// Marking a deal won puts a number into other people's reports, and undoing it
// takes an admin reopen. So three things matter here and are pinned below:
//
//   1. It does not fire on one click. A stray click on a card that just
//      re-rendered under the cursor must not close a deal.
//   2. A refused close is REPORTED. The server refuses a deal with no company
//      and a deal at an earlier step; if those messages did not reach the
//      screen the operator would click again, see nothing, and assume the
//      feature was broken.
//   3. Once won, the control stops being a button. Nothing here offers to
//      un-win a deal — that path is the admin reopen in the header.
//
// The actions module is mocked wholesale — a component test must never reach
// Supabase, and the real module is a "use server" file anyway.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/lifecycle",
}));

vi.mock("@/app/employee/lifecycle/actions", () => ({
  markOpportunityWon: vi.fn(async () => ({ ok: true })),
}));

import { markOpportunityWon } from "@/app/employee/lifecycle/actions";
import { CloseWonAction } from "./CloseWonAction";

const wonMock = vi.mocked(markOpportunityWon);

const OPP_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CloseWonAction", () => {
  it("asks before closing, and does not call the server on the first click", async () => {
    const user = userEvent.setup();
    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    await user.click(screen.getByRole("button", { name: /^close won$/i }));

    expect(wonMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /yes, close it won/i })).toBeInTheDocument();
  });

  it("closes the deal on confirmation and refreshes", async () => {
    const user = userEvent.setup();
    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    await user.click(screen.getByRole("button", { name: /^close won$/i }));
    await user.click(screen.getByRole("button", { name: /yes, close it won/i }));

    await waitFor(() => expect(wonMock).toHaveBeenCalledWith(OPP_ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("backs out without calling the server", async () => {
    const user = userEvent.setup();
    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    await user.click(screen.getByRole("button", { name: /^close won$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(wonMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^close won$/i })).toBeInTheDocument();
  });

  it("shows the server's refusal instead of reporting success", async () => {
    const user = userEvent.setup();
    wonMock.mockResolvedValueOnce({ ok: false, error: "Attach this opportunity to a company before closing it won." });

    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    await user.click(screen.getByRole("button", { name: /^close won$/i }));
    await user.click(screen.getByRole("button", { name: /yes, close it won/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Attach this opportunity to a company");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a thrown request rather than leaving the screen silent", async () => {
    const user = userEvent.setup();
    wonMock.mockRejectedValueOnce(new Error("network down"));

    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    await user.click(screen.getByRole("button", { name: /^close won$/i }));
    await user.click(screen.getByRole("button", { name: /yes, close it won/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  // The server refuses this too; disabling the button says why before the click
  // rather than after it.
  it("is inert with no company attached, and says so", () => {
    render(<CloseWonAction canAdvance clientId={null} opportunityId={OPP_ID} won={false} />);

    expect(screen.getByRole("button", { name: /^close won$/i })).toBeDisabled();
    expect(screen.getByText(/not attached to a company/i)).toBeInTheDocument();
  });

  it("is inert for a role that cannot move opportunities", () => {
    render(<CloseWonAction canAdvance={false} clientId={CLIENT_ID} opportunityId={OPP_ID} won={false} />);

    expect(screen.getByRole("button", { name: /^close won$/i })).toBeDisabled();
  });

  it("offers no button at all once the deal is won", () => {
    render(<CloseWonAction canAdvance clientId={CLIENT_ID} opportunityId={OPP_ID} won />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/closed won/i)).toBeInTheDocument();
  });
});
