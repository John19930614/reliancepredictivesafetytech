// Step 7's link control.
//
// Two behaviours are worth pinning down, because getting either wrong is
// invisible until somebody is looking at the wrong contract:
//
//   1. The company gate. A proposal is written FOR a company, so a deal that
//      arrived as an anonymous lead has to be attached to one before there is
//      anything to link. If the picker rendered anyway, the operator would pick
//      a proposal and be told no by the server for reasons the screen never
//      explained.
//   2. A refused link is REPORTED, never swallowed. The server refuses a
//      cross-company link and a proposal already claimed by another deal; if
//      those messages did not reach the screen, the operator would read the
//      absent proposal as a rendering glitch and try again.
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
  linkOpportunityToClient: vi.fn(async () => ({ ok: true })),
  linkProposalToOpportunity: vi.fn(async () => ({ ok: true })),
}));

import { linkOpportunityToClient, linkProposalToOpportunity } from "@/app/employee/lifecycle/actions";
import { ProposalLink } from "./ProposalLink";

const attachMock = vi.mocked(linkOpportunityToClient);
const linkMock = vi.mocked(linkProposalToOpportunity);

const OPP_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "33333333-3333-4333-8333-333333333333";

const clients = [{ id: CLIENT_ID, name: "Northbridge Rail" }];
const linkable = [{ id: PROPOSAL_ID, label: "P-0042 — Predictive Maintenance" }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalLink without a company", () => {
  it("asks for the company first and does not offer a proposal picker", () => {
    render(
      <ProposalLink
        canManage
        clientId={null}
        clients={clients}
        linkable={linkable}
        linked={[]}
        opportunityId={OPP_ID}
      />,
    );

    expect(screen.getByRole("button", { name: /attach company/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /link proposal/i })).not.toBeInTheDocument();
  });

  it("attaches the chosen company and refreshes", async () => {
    const user = userEvent.setup();
    render(
      <ProposalLink canManage clientId={null} clients={clients} linkable={[]} linked={[]} opportunityId={OPP_ID} />,
    );

    await user.selectOptions(screen.getByLabelText(/company/i), CLIENT_ID);
    await user.click(screen.getByRole("button", { name: /attach company/i }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledWith(OPP_ID, CLIENT_ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("keeps the button inert until a company is chosen", () => {
    render(
      <ProposalLink canManage clientId={null} clients={clients} linkable={[]} linked={[]} opportunityId={OPP_ID} />,
    );

    expect(screen.getByRole("button", { name: /attach company/i })).toBeDisabled();
  });
});

describe("ProposalLink with a company", () => {
  it("links the chosen proposal", async () => {
    const user = userEvent.setup();
    render(
      <ProposalLink
        canManage
        clientId={CLIENT_ID}
        clients={clients}
        linkable={linkable}
        linked={[]}
        opportunityId={OPP_ID}
      />,
    );

    await user.click(screen.getByRole("button", { name: /link proposal/i }));

    await waitFor(() => expect(linkMock).toHaveBeenCalledWith(OPP_ID, PROPOSAL_ID, true));
  });

  it("unlinks a linked proposal, and links to the document itself", async () => {
    const user = userEvent.setup();
    render(
      <ProposalLink
        canManage
        clientId={CLIENT_ID}
        clients={clients}
        linkable={[]}
        linked={linkable}
        opportunityId={OPP_ID}
      />,
    );

    expect(screen.getByRole("link", { name: /P-0042/ })).toHaveAttribute(
      "href",
      `/employee/proposals/${PROPOSAL_ID}`,
    );

    await user.click(screen.getByRole("button", { name: /unlink/i }));

    await waitFor(() => expect(linkMock).toHaveBeenCalledWith(OPP_ID, PROPOSAL_ID, false));
  });

  it("shows the server's refusal instead of reporting success", async () => {
    const user = userEvent.setup();
    linkMock.mockResolvedValueOnce({ ok: false, error: "That proposal belongs to a different company." });

    render(
      <ProposalLink
        canManage
        clientId={CLIENT_ID}
        clients={clients}
        linkable={linkable}
        linked={[]}
        opportunityId={OPP_ID}
      />,
    );

    await user.click(screen.getByRole("button", { name: /link proposal/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("belongs to a different company");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a thrown request rather than leaving the screen silent", async () => {
    const user = userEvent.setup();
    linkMock.mockRejectedValueOnce(new Error("network down"));

    render(
      <ProposalLink
        canManage
        clientId={CLIENT_ID}
        clients={clients}
        linkable={linkable}
        linked={[]}
        opportunityId={OPP_ID}
      />,
    );

    await user.click(screen.getByRole("button", { name: /link proposal/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  // Read-only roles see the state of the deal; they do not get to change which
  // contract prices it.
  it("disables every control for a caller who cannot manage", () => {
    render(
      <ProposalLink
        canManage={false}
        clientId={CLIENT_ID}
        clients={clients}
        linkable={linkable}
        linked={linkable}
        opportunityId={OPP_ID}
      />,
    );

    expect(screen.getByRole("button", { name: /link proposal/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /unlink/i })).toBeDisabled();
  });

  it("says plainly when nothing prices the deal yet", () => {
    render(
      <ProposalLink canManage clientId={CLIENT_ID} clients={clients} linkable={[]} linked={[]} opportunityId={OPP_ID} />,
    );

    expect(screen.getByText(/no proposal prices this deal yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /build a proposal/i })).toHaveAttribute("href", "/employee/proposals");
  });
});
