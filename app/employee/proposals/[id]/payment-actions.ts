"use server";

// A THIN WRAPPER around createManualInvoice for the proposal detail page's
// Payments panel — not a second invoice-creation path.
//
// WHY THIS FILE EXISTS, rather than calling createManualInvoice directly from
// the client. app/employee/invoices/actions.ts already does every real thing
// a new payment-schedule line needs: validation, the client/proposal pairing
// check, the numbering trigger, the audit event. What it does NOT do is know
// about the proposal detail page — its own revalidateInvoiceSurfaces() touches
// /employee/invoices, the client's workflow page and /employee/finance, none
// of which is where staff are sitting when they add a line item from this
// panel. Duplicating createManualInvoice's body to add one more
// revalidatePath call would be the actual mistake CLAUDE.md's "no duplicated
// invoice-creation logic" instinct is warning against; calling through it and
// revalidating the one extra surface here is the additive fix.
import { revalidatePath } from "next/cache";
import { createManualInvoice, type ManualInvoiceResult } from "@/app/employee/invoices/actions";
import type { NewManualInvoiceInput } from "@/lib/invoices/manual";

export type { ManualInvoiceResult } from "@/app/employee/invoices/actions";

/**
 * Raises a draft invoice from the proposal Payments panel and, on success,
 * revalidates this proposal's detail page so the new Payment Schedule row
 * shows up without a manual refresh — mirroring how
 * app/employee/proposals/actions.ts revalidates `/employee/proposals/${id}`
 * after its own mutations.
 */
export async function createProposalScheduleInvoice(
  input: NewManualInvoiceInput,
): Promise<ManualInvoiceResult> {
  const result = await createManualInvoice(input);
  if (result.ok && input.proposalId) {
    revalidatePath(`/employee/proposals/${input.proposalId}`);
  }
  return result;
}
