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

import { loadInvoiceLines, updateDraftInvoiceLines } from "@/app/employee/clients/[id]/workflow/actions";
import { InvoicePanel, type InvoiceView } from "./InvoicePanel";

const loadMock = vi.mocked(loadInvoiceLines);
const saveMock = vi.mocked(updateDraftInvoiceLines);

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const LINE_ID = "55555555-5555-4555-8555-555555555555";

function invoice(over: Partial<InvoiceView> = {}): InvoiceView {
  return {
    id: INVOICE_ID,
    invoice_number: "RPS-INV-2026-0001",
    status: "draft",
    total: 1260,
    currency: "USD",
    issue_date: null,
    due_date: null,
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
      invoices={[invoice()]}
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
