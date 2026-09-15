import type { ProposalLineItem, ProposalTotals } from "@/lib/proposals/pricing";

/** A quantity already reserved by a non-void proposal invoice line. */
export interface CommittedProposalLineQuantity {
  lineKey: string;
  quantity: number | string;
}

/** The only proposal-line data a browser may choose when generating an invoice. */
export interface ProposalBillingSelection {
  lineKey: string;
  quantity: number;
}

export interface ProposalBillingLine {
  lineKey: string;
  /** Zero-based position in computeProposalTotals().lineItems. */
  lineOrder: number;
  source: ProposalLineItem["source"];
  sourceKey: string;
  name: string;
  description: string;
  unit: string;
  originalUnitAmount: number;
  /** Accepted unit price after applying the proposal-level discount. */
  approvedUnitAmount: number;
  proposedQuantity: number;
  committedQuantity: number;
  remainingQuantity: number;
  proposedValue: number;
  committedValue: number;
  remainingValue: number;
}

export interface ProposalBillingSummary {
  revisionId: string;
  lines: ProposalBillingLine[];
  proposedSubtotal: number;
  committedSubtotal: number;
  remainingSubtotal: number;
  proposedTax: number;
  committedTax: number;
  remainingTax: number;
  proposedTotal: number;
  committedTotal: number;
  remainingTotal: number;
}

export type ProposalBillingSelectionProblemCode =
  | "empty_selection"
  | "invalid_line_key"
  | "duplicate_line"
  | "unknown_line"
  | "invalid_quantity"
  | "exceeds_remaining";

export interface ProposalBillingSelectionProblem {
  code: ProposalBillingSelectionProblemCode;
  index: number | null;
  lineKey: string | null;
  message: string;
}

export interface PricedProposalBillingSelectionLine {
  lineKey: string;
  lineOrder: number;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
}

export interface PricedProposalBillingSelection {
  ok: boolean;
  problems: ProposalBillingSelectionProblem[];
  lines: PricedProposalBillingSelectionLine[];
  subtotal: number;
  tax: number;
  total: number;
}

function finiteNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundInvoiceMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundInvoiceQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Stable identity for a line in an immutable accepted revision.
 *
 * Catalog keys are not identities: the same service may appear twice, and a
 * custom row may have no key at all. The accepted revision plus its stored fee
 * table order is both deterministic for legacy rows and unique within the
 * document the client accepted.
 */
export function proposalBillingLineKey(revisionId: string, lineOrder: number): string {
  const revision = revisionId.trim();
  if (!revision) throw new Error("An accepted revision id is required to identify proposal lines.");
  if (!Number.isInteger(lineOrder) || lineOrder < 0) throw new Error("Proposal line order must be a non-negative integer.");
  return `${revision}:${lineOrder}`;
}

/** Combine reservations from several draft/issued/paid invoices by source line. */
export function mergeCommittedProposalQuantities(
  committed: readonly CommittedProposalLineQuantity[],
): Record<string, number> {
  const merged: Record<string, number> = {};

  for (const row of committed) {
    const lineKey = typeof row.lineKey === "string" ? row.lineKey.trim() : "";
    const quantity = finiteNumber(row.quantity);
    if (!lineKey || quantity <= 0) continue;
    merged[lineKey] = roundInvoiceQuantity((merged[lineKey] ?? 0) + quantity);
  }

  return merged;
}

function proportionalTax(subtotal: number, proposedSubtotal: number, proposedTax: number): number {
  if (!(subtotal > 0) || !(proposedSubtotal > 0) || !(proposedTax > 0)) return 0;
  return roundInvoiceMoney((proposedTax * subtotal) / proposedSubtotal);
}

/**
 * Builds the read model for partial billing from one accepted revision.
 * Prices are snapshots derived from that revision; committed rows contribute
 * quantities only and therefore cannot replace descriptions or prices.
 */
export function buildProposalBillingSummary(
  revisionId: string,
  totals: ProposalTotals,
  committed: readonly CommittedProposalLineQuantity[] = [],
  committedTaxAmount?: number,
): ProposalBillingSummary {
  const committedByLine = mergeCommittedProposalQuantities(committed);
  const undiscountedSubtotal = roundInvoiceMoney(
    totals.lineItems.reduce((sum, line) => sum + Math.max(0, finiteNumber(line.amount)), 0),
  );
  const discountedSubtotal = Math.max(0, roundInvoiceMoney(undiscountedSubtotal - Math.max(0, totals.discount)));
  const discountScale = undiscountedSubtotal > 0 ? discountedSubtotal / undiscountedSubtotal : 1;

  const lines = totals.lineItems.map((line, lineOrder): ProposalBillingLine => {
    const lineKey = proposalBillingLineKey(revisionId, lineOrder);
    const proposedQuantity = Math.max(0, roundInvoiceQuantity(finiteNumber(line.qty)));
    const committedQuantity = Math.max(0, roundInvoiceQuantity(committedByLine[lineKey] ?? 0));
    const remainingQuantity = Math.max(0, roundInvoiceQuantity(proposedQuantity - committedQuantity));
    const originalUnitAmount = Math.max(0, roundInvoiceMoney(finiteNumber(line.price)));
    const approvedUnitAmount = Math.max(0, roundInvoiceMoney(originalUnitAmount * discountScale));
    const proposedValue = roundInvoiceMoney(proposedQuantity * approvedUnitAmount);
    const committedValue = roundInvoiceMoney(committedQuantity * approvedUnitAmount);
    const remainingValue = roundInvoiceMoney(remainingQuantity * approvedUnitAmount);

    return {
      lineKey,
      lineOrder,
      source: line.source,
      sourceKey: line.key,
      name: line.name,
      description: line.desc,
      unit: line.unit,
      originalUnitAmount,
      approvedUnitAmount,
      proposedQuantity,
      committedQuantity,
      remainingQuantity,
      proposedValue,
      committedValue,
      remainingValue,
    };
  });

  const proposedSubtotal = roundInvoiceMoney(lines.reduce((sum, line) => sum + line.proposedValue, 0));
  const committedSubtotal = roundInvoiceMoney(lines.reduce((sum, line) => sum + line.committedValue, 0));
  const remainingSubtotal = roundInvoiceMoney(lines.reduce((sum, line) => sum + line.remainingValue, 0));
  const proposedTax = Math.max(0, roundInvoiceMoney(totals.tax));
  const committedTax = Math.min(
    proposedTax,
    Math.max(
      0,
      committedTaxAmount === undefined
        ? proportionalTax(committedSubtotal, proposedSubtotal, proposedTax)
        : roundInvoiceMoney(finiteNumber(committedTaxAmount)),
    ),
  );
  const remainingTax = Math.max(0, roundInvoiceMoney(proposedTax - committedTax));

  return {
    revisionId: revisionId.trim(),
    lines,
    proposedSubtotal,
    committedSubtotal,
    remainingSubtotal,
    proposedTax,
    committedTax,
    remainingTax,
    proposedTotal: roundInvoiceMoney(proposedSubtotal + proposedTax),
    committedTotal: roundInvoiceMoney(committedSubtotal + committedTax),
    remainingTotal: roundInvoiceMoney(remainingSubtotal + remainingTax),
  };
}

export function validateProposalBillingSelections(
  billing: ProposalBillingSummary,
  selections: readonly ProposalBillingSelection[],
): ProposalBillingSelectionProblem[] {
  if (selections.length === 0) {
    return [{ code: "empty_selection", index: null, lineKey: null, message: "Select at least one proposal line to invoice." }];
  }

  const available = new Map(billing.lines.map((line) => [line.lineKey, line]));
  const seen = new Set<string>();
  const problems: ProposalBillingSelectionProblem[] = [];

  selections.forEach((selection, index) => {
    const candidate = selection && typeof selection === "object"
      ? (selection as Partial<ProposalBillingSelection>)
      : {};
    const lineKey = typeof candidate.lineKey === "string" ? candidate.lineKey.trim() : "";
    if (!lineKey) {
      problems.push({ code: "invalid_line_key", index, lineKey: null, message: "Each selected proposal line needs an identifier." });
      return;
    }
    if (seen.has(lineKey)) {
      problems.push({ code: "duplicate_line", index, lineKey, message: "Each proposal line may be selected only once." });
      return;
    }
    seen.add(lineKey);

    const line = available.get(lineKey);
    if (!line) {
      problems.push({ code: "unknown_line", index, lineKey, message: "A selected line is not part of the accepted proposal revision." });
      return;
    }

    const quantity = typeof candidate.quantity === "number" ? candidate.quantity : Number.NaN;
    const roundedQuantity = roundInvoiceQuantity(quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || Math.abs(quantity - roundedQuantity) > 1e-9) {
      problems.push({
        code: "invalid_quantity",
        index,
        lineKey,
        message: "Quantity must be greater than zero and use no more than two decimal places.",
      });
      return;
    }
    if (roundedQuantity > line.remainingQuantity) {
      problems.push({
        code: "exceeds_remaining",
        index,
        lineKey,
        message: `Quantity cannot exceed the ${line.remainingQuantity} remaining on this proposal line.`,
      });
    }
  });

  return problems;
}

/** Price a valid browser selection exclusively from the accepted revision. */
export function priceProposalBillingSelections(
  billing: ProposalBillingSummary,
  selections: readonly ProposalBillingSelection[],
): PricedProposalBillingSelection {
  const problems = validateProposalBillingSelections(billing, selections);
  if (problems.length > 0) return { ok: false, problems, lines: [], subtotal: 0, tax: 0, total: 0 };

  const byKey = new Map(billing.lines.map((line) => [line.lineKey, line]));
  const lines = selections.map((selection) => {
    const source = byKey.get(selection.lineKey.trim())!;
    const quantity = roundInvoiceQuantity(selection.quantity);
    return {
      lineKey: source.lineKey,
      lineOrder: source.lineOrder,
      quantity,
      unitAmount: source.approvedUnitAmount,
      lineTotal: roundInvoiceMoney(quantity * source.approvedUnitAmount),
    };
  });
  const subtotal = roundInvoiceMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  // Every partial invoice rounds tax independently. Cap the last slice at the
  // actual uncommitted tax so a sequence of otherwise-correct cent roundings
  // can never bill more tax than the accepted revision approved.
  const tax = Math.min(
    billing.remainingTax,
    proportionalTax(subtotal, billing.proposedSubtotal, billing.proposedTax),
  );

  return {
    ok: true,
    problems: [],
    lines,
    subtotal,
    tax,
    total: roundInvoiceMoney(subtotal + tax),
  };
}
