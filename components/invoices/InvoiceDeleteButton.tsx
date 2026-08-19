"use client";

// The delete control on a ledger row.
//
// WHY A COMPONENT AND NOT A FORM ACTION ON THE PAGE. The ledger is a server
// component and deleting an invoice is irreversible, so the click that does it
// has to be the SECOND one — which needs state, which needs a client boundary.
// This is the smallest thing that can hold that state.
//
// THE CONFIRM IS IN THE MARKUP, NOT IN window.confirm. A browser dialog blocks
// the whole page while it is open, cannot be read or driven by a test, and is
// suppressed outright in embedded and automated contexts — where it turns a
// destructive button into one that silently does nothing. Two buttons and a
// sentence do the same job, visibly. Nothing in this codebase uses a native
// dialog, and this is not the place to start.
//
// The rule itself is not decided here. lib/invoices/deletion.ts decides, the
// server action decides again from its own read of the row, and this component
// only chooses between offering the control and explaining why there is none.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteInvoice } from "@/app/employee/invoices/actions";
import { canDeleteInvoice, type DeletableInvoice, type DeletionActor } from "@/lib/invoices/deletion";

interface InvoiceDeleteButtonProps {
  invoiceId: string;
  /** The columns the rule turns on, straight off the row the page read. */
  invoice: DeletableInvoice;
  /** Who is asking, resolved on the server from the same helper the page gates on. */
  actor: DeletionActor;
  /**
   * Employee standing — is_company_portal_employee(), as the RLS policy names
   * it. Kept OUT of canDeleteInvoice, which answers "may this row go" and is not
   * an authentication check; carried here because the ledger is also visible to
   * finance-module accounts that hold no pipeline role at all, and those should
   * see no delete affordance and no explanation of one.
   */
  canDelete: boolean;
}

export function InvoiceDeleteButton({ invoiceId, invoice, actor, canDelete }: InvoiceDeleteButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing at all, rather than a refusal: someone with no standing to delete
  // any invoice does not need a sentence about this one.
  if (!canDelete) return null;

  const verdict = canDeleteInvoice(invoice, actor);

  // A quiet sentence rather than a disabled button. A greyed-out control invites
  // the operator to hunt for the permission that would enable it; the rule here
  // is not about permission at all for an issued invoice, and the sentence names
  // void — the route that does work — which is the only version of this that
  // teaches anyone anything.
  if (!verdict.ok) {
    return <span className="table-subtext">{verdict.reason}</span>;
  }

  if (!confirming) {
    return (
      <button
        className="button button-neutral button-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        type="button"
      >
        <Trash2 aria-hidden="true" size={13} /> Delete
      </button>
    );
  }

  return (
    <>
      <span className="table-subtext">Delete {invoice.invoiceNumber} for good?</span>
      <button
        className="button button-danger button-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const result = await deleteInvoice(invoiceId);
              if (result.ok) {
                setConfirming(false);
                router.refresh();
                return;
              }
              // Kept open on a refusal, with the reason showing: closing the
              // confirm would look exactly like the delete having worked.
              setError(result.error ?? "Could not delete that invoice.");
            } catch {
              setError("Something went wrong reaching the server. Try again in a moment.");
            }
          })
        }
        type="button"
      >
        <Trash2 aria-hidden="true" size={13} /> Confirm delete
      </button>
      <button
        className="button button-neutral button-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setConfirming(false);
        }}
        type="button"
      >
        Cancel
      </button>
      {error ? (
        <span className="table-subtext" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
