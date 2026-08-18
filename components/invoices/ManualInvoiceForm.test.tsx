// The two things this form decides that nothing downstream can undo.
//
//   1. WHICH PROPOSAL, if any, the invoice bills against. That choice changes
//      the number the database mints and switches on the contract-value
//      ceiling, so the picker must offer the SELECTED client's proposals and
//      nobody else's, and the preview must read the way the number will.
//   2. WHAT THE DESCRIPTION SAYS. It carries a heading and its detail on
//      separate lines, so the control has to be able to hold a newline and the
//      newline has to survive the trip to the server.
//
// The actions are mocked wholesale: a component test must never reach Supabase,
// and both modules are "use server" files.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/invoices",
}));

vi.mock("@/app/employee/invoices/actions", () => ({
  createManualInvoice: vi.fn(async () => ({ ok: true, invoiceId: "inv-1", invoiceNumber: "WONDFOUSA-2026-INV-01" })),
}));

vi.mock("@/app/employee/clients/[id]/actions", () => ({
  assignCompanySlug: vi.fn(async () => ({ ok: true })),
}));

import { createManualInvoice } from "@/app/employee/invoices/actions";
import { ManualInvoiceForm } from "./ManualInvoiceForm";

const createMock = vi.mocked(createManualInvoice);

const WONDFO = "11111111-1111-4111-8111-111111111111";
const HUNZINGER = "44444444-4444-4444-8444-444444444444";

const clients = [
  { id: WONDFO, name: "Wondfo USA", company_slug: "WONDFOUSA" },
  { id: HUNZINGER, name: "Hunzinger Construction", company_slug: "HUNZINGERCONSTRUCTION" },
];

const proposals = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    client_id: WONDFO,
    title: "EHS Program Support",
    proposal_number: "WONDFOUSA-2026-001",
    proposal_value: 42000,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    client_id: WONDFO,
    title: "Respiratory Protection Review",
    proposal_number: "WONDFOUSA-2026-002",
    proposal_value: null,
  },
];

function renderForm() {
  return render(<ManualInvoiceForm clients={clients} proposals={proposals} year={2026} />);
}

/**
 * The "Billing against" control.
 *
 * Matched loosely because the label wraps the field's own hint text as well as
 * its name, the way every .field in this form does.
 */
function proposalPicker(): HTMLSelectElement {
  return screen.getByLabelText(/Billing against/) as HTMLSelectElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ManualInvoiceForm — choosing the proposal to bill against", () => {
  it("offers nothing until a client is chosen", () => {
    renderForm();
    expect(proposalPicker()).toBeDisabled();
    expect(screen.getByText("Choose a client first")).toBeInTheDocument();
  });

  it("lists that client's proposals with their number, title and value", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);

    expect(proposalPicker()).not.toBeDisabled();
    expect(screen.getByRole("option", { name: /WONDFOUSA-2026-001 · EHS Program Support · 42,000/ })).toBeInTheDocument();
    // A proposal with no value recorded still bills; it simply has no figure.
    expect(screen.getByRole("option", { name: "WONDFOUSA-2026-002 · Respiratory Protection Review" })).toBeInTheDocument();
  });

  it("repopulates when the client changes, and empties for a client with none", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);
    await user.selectOptions(proposalPicker(), "22222222-2222-4222-8222-222222222222");
    expect(proposalPicker().value).toBe("22222222-2222-4222-8222-222222222222");

    // Hunzinger has no proposals: the picker empties, disables, and — this is
    // the part that matters — does NOT keep Wondfo's selection, which the
    // server would refuse and which would meanwhile preview the wrong number.
    await user.selectOptions(screen.getByLabelText("Client"), HUNZINGER);

    expect(proposalPicker()).toBeDisabled();
    expect(proposalPicker().value).toBe("");
    expect(screen.getByText("This client has no proposals to bill against")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /WONDFOUSA-2026-001/ })).not.toBeInTheDocument();
  });

  it("previews the -INV- number with no proposal and the {PROPOSAL}-NN number with one", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);
    expect(screen.getByText(/this invoice becomes WONDFOUSA-2026-INV-01/)).toBeInTheDocument();

    await user.selectOptions(proposalPicker(), "22222222-2222-4222-8222-222222222222");

    // The other shape entirely — and the ceiling that comes with it is said out
    // loud, because it can refuse the invoice at the database.
    expect(screen.getByText(/this invoice becomes WONDFOUSA-2026-001-01/)).toBeInTheDocument();
    expect(screen.getByText(/cannot total more than its recorded value/)).toBeInTheDocument();
    expect(screen.queryByText(/this invoice becomes WONDFOUSA-2026-INV-01/)).not.toBeInTheDocument();
  });

  it("posts the chosen proposal, and posts none when none was chosen", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);
    await user.type(screen.getByLabelText("Description for line 1"), "Site audit");
    await user.type(screen.getByLabelText("Unit price for line 1"), "1500");
    await user.click(screen.getByRole("button", { name: /Raise draft invoice/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].proposalId).toBe("");

    createMock.mockClear();
    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);
    await user.selectOptions(proposalPicker(), "22222222-2222-4222-8222-222222222222");
    await user.type(screen.getByLabelText("Description for line 1"), "Site audit");
    await user.type(screen.getByLabelText("Unit price for line 1"), "1500");
    await user.click(screen.getByRole("button", { name: /Raise draft invoice/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].proposalId).toBe("22222222-2222-4222-8222-222222222222");
  });
});

describe("ManualInvoiceForm — multi-line descriptions", () => {
  it("uses a control that can hold a newline at all", () => {
    renderForm();
    // An <input> silently drops the break, whatever is typed or pasted into it.
    expect(screen.getByLabelText("Description for line 1").tagName).toBe("TEXTAREA");
  });

  it("sends the heading and its detail as two lines", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.selectOptions(screen.getByLabelText("Client"), WONDFO);
    await user.type(
      screen.getByLabelText("Description for line 1"),
      "Training{enter}Biosafety Training: Classroom and Practical.",
    );
    await user.type(screen.getByLabelText("Unit price for line 1"), "1500");
    await user.click(screen.getByRole("button", { name: /Raise draft invoice/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].lines[0].description).toBe(
      "Training\nBiosafety Training: Classroom and Practical.",
    );
  });
});
