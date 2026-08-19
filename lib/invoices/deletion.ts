// WHEN AN INVOICE MAY BE DESTROYED, AND WHEN IT MAY ONLY BE RETIRED.
//
// There was no delete path anywhere in this application until now, and that was
// nearly right: an invoice is a numbered financial record, and deleting one is
// the sort of thing bookkeeping exists to make impossible. `void` already does
// the honest version of "this invoice is no longer a claim" — it keeps the row,
// keeps the number spent, and records `void_reason` and `voided_at` so a later
// reader can see both that the claim was made and that it was withdrawn.
//
// But there is one case void does not serve. An invoice that was raised and
// never issued has never left the building. Nobody holds a copy of it, no money
// has been claimed against it, and it appears on no client's desk. Removing it
// is not the destruction of a record — there is no record of anything, only a
// draft somebody started and abandoned. Leaving those on the ledger forever, as
// permanent "void" rows, buries the invoices that matter under test junk.
//
// So the rule is one line, and it is about `issuedAt`, not about status:
//
//     DELETE WHAT WAS NEVER ISSUED. VOID WHAT WAS.
//
// Once `issued_at` is set, a client holds a document bearing that number.
// Erasing the row destroys the record of a claim that was really made, and no
// amount of role checking makes that acceptable — so an ever-issued invoice is
// refused here in every status, including `void`. A voided-after-issue invoice
// is precisely the evidence that the claim was raised and withdrawn; it is the
// most valuable row in the table, not the most disposable one.
//
// WHY EVERY REFUSAL NAMES THE INVOICE NUMBER. These sentences are read in a
// ledger of many rows and in a panel of several invoices, where "this invoice"
// identifies nothing. The number is the one thing an operator can carry to a
// colleague, search the audit trail for, or type into an email — so it is in
// the sentence, not merely on the row above it.
//
// WHY THIS MODULE IS PURE. The same decision has to be made in three places —
// the server action that performs the delete, the ledger row that offers the
// control, and the workflow panel that offers it alongside void — and if those
// three disagree the UI either dangles a button that always fails or hides one
// that would have worked. One function, no Supabase import, exhaustively tested.
//
// IT IS NOT THE ENFORCEMENT. The RLS policy "Admins can delete invoices" is:
//
//     is_company_portal_admin()
//     or (status = 'draft' and created_by = auth.uid()
//         and is_company_portal_employee())
//
// Everything below is at least as strict as that predicate and never looser —
// notably it refuses an ever-issued draft, which the policy would allow, and it
// refuses a never-issued `void` row to anyone but an admin. A check that is
// looser than the database produces a button that reports success on a write
// PostgREST filtered to zero rows; a check that is stricter simply declines to
// offer something, which is a survivable kind of wrong.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT ASK is whether the caller is a portal
// employee at all. That is the coarse gate every other action on these surfaces
// already applies before it does anything — getPipelineAccess() on the server,
// the page's own redirect in the browser — and duplicating it here would invite
// a caller to treat this function as the authentication it is not. It answers
// one question: given that you are staff, may this row go?

/**
 * The four facts this decision turns on, in the shape the callers hold them.
 *
 * Note `issuedAt` rather than `issueDate`: `issue_date` is a plain date an
 * operator types on a draft and says nothing about whether anyone has seen the
 * document, while `issued_at` is stamped by settleInvoice at the moment of
 * issue and is the only column that does.
 */
export interface DeletableInvoice {
  /** Printed in every refusal, because "this invoice" names nothing in a list. */
  invoiceNumber: string;
  status: string;
  /** The moment the invoice was issued to the client; null while it is unsent. */
  issuedAt: string | null;
  /** The employee who raised it, per the RLS policy's `created_by` term. */
  createdBy: string | null;
}

/** Who is asking. The two terms of the RLS predicate that vary by person. */
export interface DeletionActor {
  userId: string;
  /** is_company_portal_admin() */
  isAdmin: boolean;
}

/**
 * Allowed, or refused with a sentence an operator can act on.
 *
 * Never a bare boolean, on purpose: "no" without "and here is the supported
 * route instead" is how somebody ends up editing an exported PDF.
 */
export type InvoiceDeletability = { ok: true } | { ok: false; reason: string };

/**
 * True when this invoice has ever been issued to a client.
 *
 * `issuedAt` is the whole test, not `status`. A voided invoice keeps whatever
 * `issued_at` it had, so status alone cannot distinguish "voided a draft nobody
 * saw" from "voided a document sitting in a client's inbox" — and those two
 * have opposite answers.
 *
 * A blank string is treated as never issued rather than as issued: it is not a
 * moment, and reading it as one would strand genuine drafts on the ledger.
 */
function wasEverIssued(invoice: DeletableInvoice): boolean {
  return typeof invoice.issuedAt === "string" && invoice.issuedAt.trim() !== "";
}

/** The number, or a stand-in, so a refusal never opens with "undefined". */
function label(invoice: DeletableInvoice): string {
  const number = (invoice.invoiceNumber ?? "").trim();
  return number === "" ? "This invoice" : number;
}

/**
 * Whether `actor` may delete `invoice` outright, rather than void it.
 *
 * The order of the tests is deliberate: first the facts that refuse everyone
 * regardless of role (paid, ever-issued), and only then the who-are-you
 * questions, which are the only ones a different person could answer
 * differently. Asking about roles first would tell an operator "ask an admin"
 * about a document no admin may delete either.
 */
export function canDeleteInvoice(invoice: DeletableInvoice, actor: DeletionActor): InvoiceDeletability {
  const name = label(invoice);

  // Paid first, and refused for everyone. A paid invoice is the record of money
  // that actually arrived; it cannot even be voided (see settleInvoice, where
  // `paid` has no legal transitions at all), so this refusal deliberately does
  // NOT offer void the way the issued ones do — pointing at a route the app
  // does not have is worse than saying there is none. Checked ahead of
  // `issuedAt` so an anomalous paid row with no issued_at — which the column
  // CHECK does not forbid, since only `issued` requires the stamp — still gets
  // the message that is true about it.
  if (invoice.status === "paid") {
    return {
      ok: false,
      reason: `${name} has been paid, and a paid invoice is the record of money that arrived. It cannot be deleted or voided.`,
    };
  }

  if (wasEverIssued(invoice)) {
    if (invoice.status === "void") {
      return {
        ok: false,
        reason:
          `${name} was issued before it was voided, so a client holds a document bearing that number. ` +
          `The void is the record that the claim was made and withdrawn — it has to be kept.`,
      };
    }
    return {
      ok: false,
      reason:
        `${name} has been issued, so a client holds a document bearing that number. ` +
        `Void it instead: that withdraws the claim, keeps the number spent, and records why.`,
    };
  }

  // From here down the invoice has never been issued.

  if (invoice.status === "draft") {
    // The RLS policy's own terms, restated: the admin, or the employee whose
    // name is on the draft. Anyone else is refused rather than shown a control
    // the database would filter to zero rows.
    if (actor.isAdmin) return { ok: true };
    // `createdBy` is nullable — the FK is `on delete set null` — so a draft
    // raised by someone whose auth user has since been removed has no owner.
    // Nobody "is" null, and an empty userId is nobody, so neither may match.
    if (invoice.createdBy !== null && invoice.createdBy !== "" && invoice.createdBy === actor.userId) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        `Only the employee who raised draft ${name}, or a portal admin, can delete it. ` +
        `Ask an admin, or void it to take it off the ledger.`,
    };
  }

  if (invoice.status === "void") {
    // A draft voided without ever being issued: nobody was ever asked for
    // anything, so the row is abandoned or test data rather than evidence.
    // Still admin-only, because "it was never issued" is a claim about history
    // that ought to be checked by someone who can also read the audit trail —
    // and because an employee's own honest mistake is a draft, not a void.
    if (actor.isAdmin) return { ok: true };
    return {
      ok: false,
      reason: `${name} was voided before it was ever issued, so only a portal admin can delete it.`,
    };
  }

  if (invoice.status === "issued") {
    // Status says issued, `issuedAt` says otherwise. The column CHECK
    // client_invoices_issued_has_date should make this unreachable; if it is
    // reached, the row cannot prove it never left the building, and the safe
    // reading of an unprovable claim about a financial record is "no".
    return {
      ok: false,
      reason:
        `${name} is marked issued but carries no issued-at timestamp, so nothing here can show it never reached ` +
        `the client. Void it instead.`,
    };
  }

  // An unrecognised status is a schema that moved without this module. Refuse,
  // and name the only shape that is ever deletable.
  return {
    ok: false,
    reason: `${name} is ${invoice.status}, and only an invoice that was never issued can be deleted. Void it instead.`,
  };
}
