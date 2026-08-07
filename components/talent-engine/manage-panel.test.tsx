// RBAC + patch-shape tests for the Talent Engine's two management islands.
//
// These panels exist because `verifyCandidateCertification`, `updateCandidate`,
// `updateJobOrder` and `setJobOrderStatus` shipped with no caller: certification
// verification is what releases the submittal gate, so with no control for it,
// every job order carrying cert requirements dead-ended. What is worth testing
// is therefore not that the components render, but that:
//
//   * the verify control reaches the action with the certification it names,
//     and is offered for exactly the certs that are still unverified (the match
//     is case-insensitive because the ACTION normalises before it compares);
//   * the permission gates hold in the UI — a viewer who cannot approve or
//     cannot propose still SEES the control, disabled, with the reason;
//   * the patch carries only CHANGED fields, and carries no rate key at all
//     without `canSetRate`. The server re-checks every one of these, but a
//     request that would be refused should not be made, and an update that
//     names `certifications` unnecessarily makes the action re-derive the
//     verified list — an unrelated edit must not cost a verification.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

// Server Actions cannot run under vitest; the islands only need them to resolve.
vi.mock("@/app/employee/talent-engine/actions", () => ({
  updateCandidate: vi.fn(async () => ({ ok: true })),
  updateJobOrder: vi.fn(async () => ({ ok: true })),
  setJobOrderStatus: vi.fn(async () => ({ ok: true })),
  verifyCandidateCertification: vi.fn(async () => ({ ok: true })),
}));

import {
  setJobOrderStatus,
  updateCandidate,
  updateJobOrder,
  verifyCandidateCertification,
} from "@/app/employee/talent-engine/actions";
import type { CandidateRow, JobOrderWithClient } from "@/lib/talent-engine/types";
import { CandidateManagePanel } from "./CandidateManagePanel";
import { JobOrderManagePanel } from "./JobOrderManagePanel";

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT_ID = "44444444-4444-4444-8444-444444444444";

function candidateFixture(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id: CANDIDATE_ID,
    full_name: "Maria Reyes",
    email: "maria@example.com",
    phone: "602-555-0134",
    years_experience: 14,
    // "OSHA 30" is verified under a different case on purpose — see below.
    certifications: ["CSP", "OSHA 30"],
    verified_certifications: ["osha 30"],
    cert_expiry_date: null,
    verticals: ["Pharma"],
    location: "Phoenix, AZ",
    willing_to_relocate: false,
    pay_expectation: 70,
    availability_date: "2026-09-01",
    status: "available",
    notes: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function orderFixture(overrides: Partial<JobOrderWithClient> = {}): JobOrderWithClient {
  return {
    id: ORDER_ID,
    client_id: CLIENT_ID,
    title: "Sr. EHS Manager — Data Center",
    vertical: "Data Center",
    location: "Austin, TX",
    cert_requirements: ["CSP"],
    bill_rate: 95,
    min_spread: 20,
    openings: 1,
    priority: "normal",
    status: "open",
    start_date: "2026-09-15",
    notes: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    client: { id: CLIENT_ID, name: "Northwind Construction" },
    ...overrides,
  };
}

const clients = [
  { id: CLIENT_ID, name: "Northwind Construction" },
  { id: OTHER_CLIENT_ID, name: "Cascade Industrial" },
];

/** Both panels are collapsed until the operator opens them. */
async function openPanel() {
  await userEvent.click(screen.getByRole("button", { name: /^Manage / }));
}

async function renderCandidatePanel(props: { canPropose?: boolean; canApprove?: boolean; candidate?: CandidateRow } = {}) {
  render(
    <CandidateManagePanel
      canApprove={props.canApprove ?? true}
      canPropose={props.canPropose ?? true}
      candidate={props.candidate ?? candidateFixture()}
    />,
  );
  await openPanel();
}

async function renderOrderPanel(props: { canPropose?: boolean; canSetRate?: boolean; order?: JobOrderWithClient } = {}) {
  render(
    <JobOrderManagePanel
      canPropose={props.canPropose ?? true}
      canSetRate={props.canSetRate ?? true}
      clients={clients}
      order={props.order ?? orderFixture()}
    />,
  );
  await openPanel();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CandidateManagePanel — certification verification", () => {
  it("offers Verify for an unverified certification only", async () => {
    await renderCandidatePanel();

    expect(screen.getByRole("button", { name: /Verify CSP for Maria Reyes/ })).toBeInTheDocument();
    // "OSHA 30" is verified as "osha 30". The action lower-cases before it
    // compares, so a case-sensitive UI would offer a button that always fails.
    expect(screen.queryByRole("button", { name: /Verify OSHA 30/ })).toBeNull();
  });

  it("verifies the certification the button names", async () => {
    await renderCandidatePanel();
    await userEvent.click(screen.getByRole("button", { name: /Verify CSP for Maria Reyes/ }));

    expect(verifyCandidateCertification).toHaveBeenCalledWith(CANDIDATE_ID, "CSP");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows a viewer who cannot approve the control and the reason, rather than hiding it", async () => {
    await renderCandidatePanel({ canApprove: false });

    const verify = screen.getByRole("button", { name: /Verify CSP for Maria Reyes/ });
    expect(verify).toBeDisabled();
    expect(verify).toHaveAttribute("title", expect.stringContaining("human gate"));
    expect(screen.getAllByText(/your role can see the claim but not confirm it/).length).toBeGreaterThan(0);

    await userEvent.click(verify);
    expect(verifyCandidateCertification).not.toHaveBeenCalled();
  });

  it("states the consequence an unverified certification carries", async () => {
    await renderCandidatePanel();
    expect(screen.getByText(/blocks the submittal/)).toBeInTheDocument();
  });

  it("offers no input for the verified list — it is the approver's column alone", async () => {
    await renderCandidatePanel();
    expect(document.querySelector('[name="verified_certifications"]')).toBeNull();
  });
});

describe("CandidateManagePanel — editing", () => {
  it("sends only the field that changed", async () => {
    await renderCandidatePanel();

    const location = screen.getByRole("textbox", { name: /Location/ });
    await userEvent.clear(location);
    await userEvent.type(location, "Denver, CO");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateCandidate).toHaveBeenCalledWith(CANDIDATE_ID, { location: "Denver, CO" });
    // An untouched cert list must never ride along: updateCandidate() re-derives
    // the verified list whenever `certifications` is named.
    expect(vi.mocked(updateCandidate).mock.calls[0][1]).not.toHaveProperty("certifications");
  });

  it("sends a status move", async () => {
    await renderCandidatePanel();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Status/ }), "placed");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateCandidate).toHaveBeenCalledWith(CANDIDATE_ID, { status: "placed" });
  });

  it("does not call the action when nothing changed", async () => {
    await renderCandidatePanel();
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateCandidate).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing changed/)).toBeInTheDocument();
  });

  it("freezes the edit fields, with the reason, for a viewer who cannot propose", async () => {
    await renderCandidatePanel({ canPropose: false });

    expect(screen.getByRole("textbox", { name: /Location/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /Status/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save changes/ })).toBeDisabled();
    expect(screen.getAllByText(/requires proposing permission/).length).toBeGreaterThan(0);
  });

  it("keeps verification available to an approver who cannot propose", async () => {
    await renderCandidatePanel({ canPropose: false, canApprove: true });
    expect(screen.getByRole("button", { name: /Verify CSP for Maria Reyes/ })).toBeEnabled();
  });
});

describe("JobOrderManagePanel — status", () => {
  it("moves the order to the status the button names", async () => {
    await renderOrderPanel();
    await userEvent.click(screen.getByRole("button", { name: /Move .* to On Hold/ }));

    expect(setJobOrderStatus).toHaveBeenCalledWith(ORDER_ID, "on_hold");
  });

  it("disables the status the order is already in and says so", async () => {
    await renderOrderPanel();

    const current = screen.getByRole("button", { name: /Move .* to Open/ });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("title", expect.stringContaining("already"));
    expect(screen.getByRole("button", { name: /Move .* to Filled/ })).toBeEnabled();
  });

  it("disables every status move, with the reason, for a viewer who cannot propose", async () => {
    await renderOrderPanel({ canPropose: false });

    for (const label of ["Open", "On Hold", "Filled", "Closed"]) {
      expect(screen.getByRole("button", { name: new RegExp(`Move .* to ${label}`) })).toBeDisabled();
    }
    expect(screen.getAllByText(/requires proposing permission/).length).toBeGreaterThan(0);
  });
});

describe("JobOrderManagePanel — editing", () => {
  it("sends only the field that changed", async () => {
    await renderOrderPanel();

    const location = screen.getByRole("textbox", { name: /Location/ });
    await userEvent.clear(location);
    await userEvent.type(location, "Dallas, TX");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateJobOrder).toHaveBeenCalledWith(ORDER_ID, { location: "Dallas, TX" });
  });

  it("sends the new bill rate when the viewer may set rates", async () => {
    await renderOrderPanel({ canSetRate: true });

    const billRate = screen.getByRole("textbox", { name: /Bill rate/ });
    await userEvent.clear(billRate);
    await userEvent.type(billRate, "110");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateJobOrder).toHaveBeenCalledWith(ORDER_ID, { billRate: 110 });
  });

  it("never names a rate key without rate permission", async () => {
    await renderOrderPanel({ canSetRate: false });

    const billRate = screen.getByRole("textbox", { name: /Bill rate/ });
    expect(billRate).toBeDisabled();
    // The reason sits on the wrapping <label>, as it does on the intake form —
    // a disabled input takes no hover of its own, but its label still does.
    expect(billRate.closest("label")).toHaveAttribute(
      "title",
      expect.stringContaining("rate-setting permission"),
    );
    expect(screen.getByRole("textbox", { name: /Spread floor/ })).toBeDisabled();

    const location = screen.getByRole("textbox", { name: /Location/ });
    await userEvent.clear(location);
    await userEvent.type(location, "Dallas, TX");
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    // The rate inputs still hold the order's current rates. Naming them at all
    // trips the server's rate gate and refuses the whole edit.
    const patch = vi.mocked(updateJobOrder).mock.calls[0][1];
    expect(patch).not.toHaveProperty("billRate");
    expect(patch).not.toHaveProperty("minSpread");
    expect(patch).toEqual({ location: "Dallas, TX" });
  });

  it("reassigns the client without disturbing anything else", async () => {
    await renderOrderPanel();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Client/ }), OTHER_CLIENT_ID);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateJobOrder).toHaveBeenCalledWith(ORDER_ID, { clientId: OTHER_CLIENT_ID });
  });

  it("keeps an order's own client selectable when it is missing from the picker list", async () => {
    await renderOrderPanel({ order: orderFixture({ client_id: "55555555-5555-4555-8555-555555555555", client: { id: "55555555-5555-4555-8555-555555555555", name: "Legacy Client" } }) });

    const select = screen.getByRole("combobox", { name: /Client/ }) as HTMLSelectElement;
    expect(select.value).toBe("55555555-5555-4555-8555-555555555555");
    expect(screen.getByRole("option", { name: "Legacy Client" })).toBeInTheDocument();
  });

  it("does not call the action when nothing changed", async () => {
    await renderOrderPanel();
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(updateJobOrder).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing changed/)).toBeInTheDocument();
  });
});
