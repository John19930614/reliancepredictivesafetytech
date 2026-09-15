import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/app/employee/invoices/actions", () => ({
  generateInvoiceFromProposal: vi.fn(async () => ({ ok: true, invoiceId: "invoice-1" })),
}));

import { generateInvoiceFromProposal } from "@/app/employee/invoices/actions";
import { GenerateInvoiceButton, type ProposalInvoiceLine } from "./GenerateInvoiceButton";

const lines: ProposalInvoiceLine[] = [
  {
    lineKey: "training",
    description: "On-site training",
    unit: "attendees",
    proposedQuantity: 10,
    committedQuantity: 2,
    remainingQuantity: 8,
    unitAmount: 105,
  },
  {
    lineKey: "audit",
    description: "Facility audit",
    unit: "audit",
    proposedQuantity: 1,
    committedQuantity: 1,
    remainingQuantity: 0,
    unitAmount: 600,
  },
  {
    lineKey: "classroom",
    description: "Classroom session",
    unit: "sessions",
    proposedQuantity: 2,
    committedQuantity: 0,
    remainingQuantity: 2,
    unitAmount: 250,
  },
];

function renderPanel() {
  return render(<GenerateInvoiceButton proposalId="proposal-1" lines={lines} />);
}

async function openPanel() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /generate invoice/i }));
  return { user, dialog: screen.getByRole("dialog", { name: /select work to invoice/i }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "generation-key-1") });
  vi.mocked(generateInvoiceFromProposal).mockResolvedValue({ ok: true, invoiceId: "invoice-1" });
});

describe("GenerateInvoiceButton", () => {
  it("uses multi-select checkboxes, disables fully billed work, and previews selected totals", async () => {
    renderPanel();
    const { user, dialog } = await openPanel();

    const training = within(dialog).getByRole("checkbox", { name: /on-site training/i });
    const audit = within(dialog).getByRole("checkbox", { name: /facility audit/i });
    const classroom = within(dialog).getByRole("checkbox", { name: /classroom session/i });
    expect(training).toBeEnabled();
    expect(classroom).toBeEnabled();
    expect(audit).toBeDisabled();
    expect(within(dialog).getByText(/fully billed/i)).toBeInTheDocument();

    await user.click(training);
    await user.click(classroom);

    expect(training).toBeChecked();
    expect(classroom).toBeChecked();
    expect(within(dialog).getAllByText("$1,340.00")).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: /generate draft invoice/i })).toBeEnabled();
  });

  it("caps quantity at the remaining amount and updates the line and subtotal previews", async () => {
    renderPanel();
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /on-site training/i }));
    const quantity = within(dialog).getByRole("spinbutton", { name: /invoice quantity for on-site training/i });
    expect(quantity).toHaveAttribute("max", "8");

    await user.clear(quantity);
    await user.type(quantity, "12");

    expect(quantity).toHaveValue(8);
    expect(within(dialog).getAllByText("$840.00")).toHaveLength(3);
  });

  it("previews proportional tax and the total without exceeding remaining accepted tax", async () => {
    render(
      <GenerateInvoiceButton
        proposalId="proposal-1"
        lines={lines}
        totals={{ proposedSubtotal: 1500, proposedTax: 120, remainingTax: 40 }}
      />,
    );
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /on-site training/i }));

    expect(within(dialog).getByText("Tax")).toBeInTheDocument();
    expect(within(dialog).getByText("$40.00")).toBeInTheDocument();
    expect(within(dialog).getByText("$880.00")).toBeInTheDocument();
  });

  it("sends selected quantities once and navigates to the generated draft", async () => {
    renderPanel();
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /on-site training/i }));
    const generate = within(dialog).getByRole("button", { name: /generate draft invoice/i });
    fireEvent.click(generate);
    fireEvent.click(generate);

    await waitFor(() => expect(generateInvoiceFromProposal).toHaveBeenCalledTimes(1));
    expect(generateInvoiceFromProposal).toHaveBeenCalledWith("proposal-1", "generation-key-1", [
      { lineKey: "training", quantity: 8 },
    ]);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/employee/invoices/invoice-1"));
  });

  it("reuses the idempotency key when a failed request is retried unchanged", async () => {
    vi.mocked(generateInvoiceFromProposal)
      .mockResolvedValueOnce({ ok: false, error: "Temporary failure." })
      .mockResolvedValueOnce({ ok: true, invoiceId: "invoice-2" });
    renderPanel();
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /on-site training/i }));
    const generate = within(dialog).getByRole("button", { name: /generate draft invoice/i });
    await user.click(generate);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Temporary failure.");

    await user.click(generate);

    await waitFor(() => expect(generateInvoiceFromProposal).toHaveBeenCalledTimes(2));
    expect(vi.mocked(generateInvoiceFromProposal).mock.calls[0]?.[1]).toBe("generation-key-1");
    expect(vi.mocked(generateInvoiceFromProposal).mock.calls[1]?.[1]).toBe("generation-key-1");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("requires a positive quantity and closes with Escape when idle", async () => {
    renderPanel();
    const { user, dialog } = await openPanel();

    await user.click(within(dialog).getByRole("checkbox", { name: /on-site training/i }));
    const quantity = within(dialog).getByRole("spinbutton", { name: /invoice quantity for on-site training/i });
    await user.clear(quantity);

    expect(within(dialog).getByRole("alert")).toHaveTextContent(/greater than zero/i);
    expect(within(dialog).getByRole("button", { name: /generate draft invoice/i })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate invoice/i })).toHaveFocus();
  });

  it("keeps keyboard focus inside the modal", async () => {
    renderPanel();
    const { dialog } = await openPanel();
    const firstLine = within(dialog).getByRole("checkbox", { name: /on-site training/i });
    const close = within(dialog).getByRole("button", { name: /close invoice panel/i });
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });

    expect(firstLine).toHaveFocus();
    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(close).toHaveFocus();

    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(cancel).toHaveFocus();
  });
});
