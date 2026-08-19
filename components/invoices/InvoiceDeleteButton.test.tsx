// The delete control on a ledger row, and the three things it must never do.
//
//   1. DESTROY AN INVOICE ON ONE CLICK. The first click asks; only the second
//      one reaches the server. There is no undo behind it.
//   2. USE A NATIVE DIALOG. window.confirm blocks the page, cannot be styled or
//      read, and is suppressed outright in automated and embedded contexts —
//      where it silently turns "delete" into a button that does nothing. The
//      spies below fail the test if any of them is so much as touched.
//   3. OFFER ITSELF ON A ROW THE SERVER WOULD REFUSE. The rule is
//      lib/invoices/deletion.ts's, and a row that does not qualify gets the
//      sentence saying why — including, for an issued invoice, the void route
//      that does work.
//
// The action is mocked wholesale: a component test must never reach Supabase,
// and the real module is a "use server" file.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/invoices",
}));

vi.mock("@/app/employee/invoices/actions", () => ({
  deleteInvoice: vi.fn(async () => ({ ok: true, invoiceNumber: "WONDFOUSA-2026-INV-07" })),
}));

import { deleteInvoice } from "@/app/employee/invoices/actions";
import { InvoiceDeleteButton } from "./InvoiceDeleteButton";
import type { DeletableInvoice, DeletionActor } from "@/lib/invoices/deletion";

const deleteMock = vi.mocked(deleteInvoice);

const INVOICE_ID = "66666666-6666-4666-8666-666666666666";
const NUMBER = "WONDFOUSA-2026-INV-07";
const CREATOR = "user-1";
const OTHER = "user-2";

function invoice(over: Partial<DeletableInvoice> = {}): DeletableInvoice {
  return { invoiceNumber: NUMBER, status: "draft", issuedAt: null, createdBy: CREATOR, ...over };
}

function renderButton(over: { invoice?: DeletableInvoice; actor?: DeletionActor; canDelete?: boolean } = {}) {
  return render(
    <InvoiceDeleteButton
      actor={over.actor ?? { userId: CREATOR, isAdmin: false }}
      canDelete={over.canDelete ?? true}
      invoice={over.invoice ?? invoice()}
      invoiceId={INVOICE_ID}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InvoiceDeleteButton", () => {
  it("asks first and only calls the server on the second click", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(`Delete ${NUMBER} for good`, "i"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(INVOICE_ID));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("uses no native browser dialog at any point", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const alertSpy = vi.spyOn(window, "alert");
    const promptSpy = vi.spyOn(window, "prompt");
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalled());

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
    promptSpy.mockRestore();
  });

  it("backs out on Cancel without touching the server", async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("keeps the confirm open and shows the server's refusal", async () => {
    // Closing the confirm on a refusal would look exactly like success.
    deleteMock.mockResolvedValueOnce({ ok: false, error: `${NUMBER} was not deleted — reload and try again.` });
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/was not deleted/i);
    expect(screen.getByRole("button", { name: /confirm delete/i })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows no button on an issued invoice, and names void instead", () => {
    renderButton({ invoice: invoice({ status: "issued", issuedAt: "2026-08-14T16:20:00.000Z" }) });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${NUMBER} has been issued`, "i"))).toBeInTheDocument();
    expect(screen.getByText(/void it instead/i)).toBeInTheDocument();
  });

  it("shows no button on another employee's draft, and says who can", () => {
    renderButton({ actor: { userId: OTHER, isAdmin: false } });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Only the employee who raised draft ${NUMBER}`, "i"))).toBeInTheDocument();
  });

  it("lets an admin delete a never-issued void, and refuses everyone else", () => {
    const voided = invoice({ status: "void", issuedAt: null });

    const { unmount } = renderButton({ invoice: voided, actor: { userId: OTHER, isAdmin: true } });
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    unmount();

    renderButton({ invoice: voided, actor: { userId: CREATOR, isAdmin: false } });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/only a portal admin can delete it/i)).toBeInTheDocument();
  });

  // A finance-module account with no pipeline role can read this ledger. It gets
  // nothing at all — not a button, and not a sentence about a rule it is not
  // party to.
  it("renders nothing without employee standing", () => {
    const { container } = renderButton({ canDelete: false });
    expect(container).toBeEmptyDOMElement();
  });
});
