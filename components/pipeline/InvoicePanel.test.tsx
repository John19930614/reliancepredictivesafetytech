// The billing panel, and the one behaviour it exists to make possible.
//
// A class was quoted at 12 seats x $105 = $1,260. Ten people turned up. The
// invoice has to say $1,050, and the operator has to be able to SEE that it
// will before they commit to it — the previous panel showed a total and no
// lines at all, so the only ways to correct one were to void a numbered record
// over a headcount or to edit the exported document.
//
// So the assertions here are about four things and nothing else:
//   1. the lines are visible, and the amount follows the quantity as it is
//      typed — a preview, computed by the same function the server uses;
//   2. a FLAT fee does not follow its quantity, because a retainer must not
//      double when somebody types 2 into a box that does not price anything;
//   3. what reaches the server is quantities, never a total;
//   4. an invoice the client has already seen offers no inputs at all.
//
// The actions module is mocked wholesale — a component test must never reach
// Supabase, and the real module is a "use server" file anyway.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

// Deleting lives in the invoice ledger's actions file, beside the manual raise,
// and is mocked separately for the same reason as the rest: a component test
// must never reach Supabase, and the real module is a "use server" file.
vi.mock("@/app/employee/invoices/actions", () => ({
  deleteInvoice: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/clients",
}));

vi.mock("@/app/employee/clients/[id]/workflow/actions", () => ({
  createInvoiceFromProposal: vi.fn(async () => ({ ok: true })),
  loadInvoiceLines: vi.fn(async () => ({ ok: true, lines: [], taxAmount: 0, editable: true })),
  settleInvoice: vi.fn(async () => ({ ok: true })),
  updateDraftInvoiceLines: vi.fn(async () => ({ ok: true, subtotal: 1050, total: 1050 })),
  updateInvoiceDetails: vi.fn(async () => ({ ok: true })),
}));

import { loadInvoiceLines, updateDraftInvoiceLines, updateInvoiceDetails } from "@/app/employee/clients/[id]/workflow/actions";
import { deleteInvoice } from "@/app/employee/invoices/actions";
import { InvoicePanel, type InvoiceView } from "./InvoicePanel";

const loadMock = vi.mocked(loadInvoiceLines);
const saveMock = vi.mocked(updateDraftInvoiceLines);
const detailsMock = vi.mocked(updateInvoiceDetails);
const deleteMock = vi.mocked(deleteInvoice);

const storedDetails = {
  consultantName: "R. Alvarez",
  jobName: "Refinery turnaround — confined space",
  paymentTerms: "Due upon receipt",
  clientAgreementRef: "MSA-4417",
  preparedBy: "J. Haldemann",
};

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const LINE_ID = "55555555-5555-4555-8555-555555555555";
/** The signed-in operator, and the person who raised the default draft. */
const USER_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_USER_ID = "88888888-8888-4888-8888-888888888888";

function invoice(over: Partial<InvoiceView> = {}): InvoiceView {
  return {
    id: INVOICE_ID,
    invoice_number: "RPS-INV-2026-0001",
    status: "draft",
    total: 1260,
    currency: "USD",
    issue_date: null,
    due_date: null,
    issued_at: null,
    created_by: USER_ID,
    ...over,
  };
}

const seatLine = {
  id: LINE_ID,
  description: "Confined Space Entry — classroom",
  quantity: 12,
  unitAmount: 105,
  unit: "Seat",
  qtyBasis: "attendee",
  serviceDate: "2026-08-20",
  lineTotal: 1260,
};

/** Makes the lazy read return `lines` for the next expand. */
function withLines(lines: unknown[], over: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadMock.mockResolvedValue({ ok: true, lines, taxAmount: 0, subtotal: 1260, total: 1260, editable: true, ...over } as any);
}

function renderPanel(over: Partial<Parameters<typeof InvoicePanel>[0]> = {}) {
  return render(
    <InvoicePanel
      canDraftInvoice
      canSettleInvoice
      clientId={CLIENT_ID}
      currentUserId={USER_ID}
      invoices={[invoice()]}
      isAdmin
      proposals={[]}
      unavailable={false}
      {...over}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvoicePanel line items", () => {
  it("shows nothing about lines until the invoice is opened, then reads them once", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    expect(loadMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/confined space entry/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /lines/i }));

    await waitFor(() => expect(screen.getByText(/confined space entry/i)).toBeInTheDocument());
    expect(loadMock).toHaveBeenCalledWith(INVOICE_ID);
  });

  // THE CASE FROM THE MEETING, at the point the operator can still change their
  // mind: the amount follows the quantity as it is typed.
  it("recomputes 12 seats to 10 live, before anything is saved", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    // The line amount, the subtotal and the total all read 1,260 to begin with.
    expect(screen.getAllByText("$1,260.00").length).toBeGreaterThan(0);

    await user.clear(quantity);
    await user.type(quantity, "10");

    // …and all of them follow the quantity down together.
    await waitFor(() => expect(screen.getAllByText("$1,050.00").length).toBe(3));
    // Nothing has been written: the preview is a preview.
    expect(saveMock).not.toHaveBeenCalled();
  });

  // A retainer must not double because somebody typed 2 into a box that does
  // not price anything.
  it("holds a flat fee at its unit amount however the quantity is edited", async () => {
    const user = userEvent.setup();
    withLines([
      { ...seatLine, description: "Monthly retainer", quantity: 1, unitAmount: 2500, qtyBasis: "flat", lineTotal: 2500 },
    ]);
    renderPanel({ invoices: [invoice({ total: 2500 })] });

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for monthly retainer/i);

    await user.clear(quantity);
    await user.type(quantity, "4");

    await waitFor(() => expect(screen.getAllByText("$2,500.00").length).toBeGreaterThan(0));
    expect(screen.queryByText("$10,000.00")).not.toBeInTheDocument();
  });

  // The browser proposes quantities; the server decides amounts.
  it("sends the quantity and never a total", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    await user.clear(quantity);
    await user.type(quantity, "10");
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    const [invoiceId, edits] = saveMock.mock.calls[0];
    expect(invoiceId).toBe(INVOICE_ID);
    expect(edits).toEqual([{ id: LINE_ID, quantity: 10, unit: "Seat", qtyBasis: "attendee", serviceDate: "2026-08-20" }]);
    for (const edit of edits) {
      expect(edit).not.toHaveProperty("lineTotal");
      expect(edit).not.toHaveProperty("total");
    }
  });

  it("does not call the server when nothing was changed", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    await screen.findByLabelText(/quantity for confined space entry/i);
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByText(/nothing has changed/i)).toBeInTheDocument();
  });

  // An emptied box is not a free invoice.
  it("refuses to save a quantity of zero without asking the server", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    await user.clear(quantity);
    await user.type(quantity, "0");
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/quantity above zero/i);
  });

  it("reports a refusal from the server rather than looking like it did nothing", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    saveMock.mockResolvedValue({ ok: false, error: "Only a draft invoice can be edited." } as any);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    await user.clear(quantity);
    await user.type(quantity, "10");
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/only a draft invoice/i));
  });

  // The server's notice is the thing the operator did not know, and it is about
  // money — it outranks the canned success line.
  it("surfaces a server notice in place of the success message", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    saveMock.mockResolvedValue({
      ok: true,
      total: 1050,
      notice: "This invoice carried a 126.00 adjustment from the proposal that is not a line.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    await user.clear(quantity);
    await user.type(quantity, "10");
    await user.click(screen.getByRole("button", { name: /save lines/i }));

    await waitFor(() => expect(screen.getByText(/126\.00 adjustment/i)).toBeInTheDocument());
  });

  it("restores the stored figures when the edit is discarded", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    const quantity = await screen.findByLabelText(/quantity for confined space entry/i);
    await user.clear(quantity);
    await user.type(quantity, "3");
    await user.click(screen.getByRole("button", { name: /discard changes/i }));

    await waitFor(() => expect(screen.getByLabelText(/quantity for confined space entry/i)).toHaveValue(12));
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe("InvoicePanel editing permissions", () => {
  // An issued invoice has been seen by the client; changing what it says after
  // that is a credit note, not an edit.
  it("offers no inputs on an invoice that is not a draft", async () => {
    const user = userEvent.setup();
    withLines([seatLine], { editable: false });
    renderPanel({ invoices: [invoice({ status: "issued", issue_date: "2026-08-14" })] });

    await user.click(screen.getByRole("button", { name: /view lines/i }));

    await waitFor(() => expect(screen.getByText(/confined space entry/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/quantity for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save lines/i })).not.toBeInTheDocument();
    // The figures are still there to read.
    const row = screen.getByText(/confined space entry/i).closest("tr");
    expect(within(row as HTMLElement).getByText("12")).toBeInTheDocument();
  });

  // Repricing writes client_invoices, which carries a single admin-only UPDATE
  // policy — offering the inputs to anyone else would promise a write the
  // database refuses halfway through.
  it("offers no inputs to a non-admin, even on a draft", async () => {
    const user = userEvent.setup();
    withLines([seatLine], { editable: false });
    renderPanel({ canSettleInvoice: false });

    await user.click(screen.getByRole("button", { name: /view lines/i }));

    await waitFor(() => expect(screen.getByText(/confined space entry/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/quantity for/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit invoice details/i })).not.toBeInTheDocument();
  });

  it("reports a failed read instead of showing an empty invoice", async () => {
    const user = userEvent.setup();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadMock.mockResolvedValue({ ok: false, error: "Invoice not found or you do not have permission." } as any);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i));
  });
});


/**
 * The defect these cover: the details form opened on EMPTY boxes because the
 * panel was never sent what was stored. updateInvoiceDetails reads an empty box
 * as "cleared", so saving the form — to change the tax, say — silently wiped the
 * consultant, the job name, the payment terms, the agreement reference and the
 * preparer from a document the client renders.
 */
describe("InvoicePanel invoice details", () => {
  async function openDetails() {
    const user = userEvent.setup();
    withLines([seatLine], { details: storedDetails, taxAmount: 25 });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /edit invoice details/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /edit invoice details/i }));

    return user;
  }

  it("opens the form on what is stored, not on blanks", async () => {
    await openDetails();

    expect(screen.getByLabelText(/consultant/i)).toHaveValue(storedDetails.consultantName);
    expect(screen.getByLabelText(/job name/i)).toHaveValue(storedDetails.jobName);
    expect(screen.getByLabelText(/payment terms/i)).toHaveValue(storedDetails.paymentTerms);
    expect(screen.getByLabelText(/client agreement/i)).toHaveValue(storedDetails.clientAgreementRef);
    expect(screen.getByLabelText(/prepared by/i)).toHaveValue(storedDetails.preparedBy);
    expect(screen.getByLabelText(/^tax$/i)).toHaveValue(25);
  });

  it("does not wipe the stored fields when only the tax is changed", async () => {
    const user = await openDetails();

    const tax = screen.getByLabelText(/^tax$/i);
    await user.clear(tax);
    await user.type(tax, "40");
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(detailsMock).toHaveBeenCalled());
    expect(detailsMock).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({ ...storedDetails, taxAmount: 40 }),
    );
  });

  it("still clears a field the operator actually empties", async () => {
    const user = await openDetails();

    await user.clear(screen.getByLabelText(/consultant/i));
    await user.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() => expect(detailsMock).toHaveBeenCalled());
    expect(detailsMock).toHaveBeenCalledWith(
      INVOICE_ID,
      expect.objectContaining({ consultantName: "", jobName: storedDetails.jobName }),
    );
  });

  it("falls back to blanks when the server sends no details", async () => {
    const user = userEvent.setup();
    withLines([seatLine]);
    renderPanel();

    await user.click(screen.getByRole("button", { name: /lines/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /edit invoice details/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /edit invoice details/i }));

    expect(screen.getByLabelText(/consultant/i)).toHaveValue("");
  });
});

/* -------------------------------------------------------------------------- */
/* Deleting an invoice that was never issued                                  */
/* -------------------------------------------------------------------------- */

// The rule, restated where an operator meets it: a draft has never left the
// building, so it can be removed; anything a client has been sent keeps its row
// and gets voided. The panel must never offer a control the server would refuse,
// and must never destroy an invoice on a single click.
describe("InvoicePanel deleting an invoice", () => {
  it("takes two clicks, and calls the server only on the second", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    // Nothing has gone to the server yet — the first click only asks.
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByText(/for good\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(INVOICE_ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText(/RPS-INV-2026-0001 deleted\./i)).toBeInTheDocument();
  });

  it("backs out without deleting anything when the operator keeps it", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("shows the server's refusal rather than a silent no-op", async () => {
    const user = userEvent.setup();
    deleteMock.mockResolvedValueOnce({ ok: false, error: "RPS-INV-2026-0001 was not deleted." });
    renderPanel();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/was not deleted/i);
  });

  // THE CASE THE WHOLE RULE EXISTS FOR.
  it("offers no delete control on an issued invoice, and names void instead", () => {
    renderPanel({
      invoices: [invoice({ status: "issued", issued_at: "2026-08-14T16:20:00.000Z", issue_date: "2026-08-14" })],
    });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    // The refusal names the invoice and the route that does work, because a
    // panel can show several invoices and "this invoice" points at none of them.
    expect(screen.getByText(/RPS-INV-2026-0001 has been issued/i)).toBeInTheDocument();
    expect(screen.getByText(/void it instead/i)).toBeInTheDocument();
  });

  it("keeps a void invoice that had been issued, rather than offering to delete it", () => {
    renderPanel({
      invoices: [invoice({ status: "void", issued_at: "2026-08-14T16:20:00.000Z" })],
    });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByText(/has to be kept/i)).toBeInTheDocument();
  });

  it("offers a never-issued void to an admin and refuses it to everyone else", () => {
    const voided = invoice({ status: "void", issued_at: null });

    const { unmount } = renderPanel({ invoices: [voided], isAdmin: true });
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    unmount();

    renderPanel({ invoices: [voided], isAdmin: false });
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only a portal admin can delete it/i)).toBeInTheDocument();
  });

  it("lets the employee who raised a draft delete it without being an admin", () => {
    renderPanel({ canSettleInvoice: false, isAdmin: false, currentUserId: USER_ID });
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("refuses another employee's draft and says who can", () => {
    renderPanel({ canSettleInvoice: false, isAdmin: false, currentUserId: OTHER_USER_ID });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByText(/only the employee who raised draft RPS-INV-2026-0001/i)).toBeInTheDocument();
  });

  // Employee standing is the coarse gate, held outside the pure rule: a viewer
  // with no right to raise an invoice has no business being told the conditions
  // under which one could be destroyed.
  it("offers nothing at all without the right to draft invoices", () => {
    renderPanel({ canDraftInvoice: false, canSettleInvoice: false });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/only the employee who raised draft/i)).not.toBeInTheDocument();
  });

  it("never offers to delete a paid invoice", () => {
    renderPanel({
      invoices: [invoice({ status: "paid", issued_at: "2026-08-14T16:20:00.000Z", issue_date: "2026-08-14" })],
    });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be deleted or voided/i)).toBeInTheDocument();
  });
});
