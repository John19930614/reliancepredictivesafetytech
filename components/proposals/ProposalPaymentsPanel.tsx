// The Payments panel on the proposal detail page — a payment schedule, a
// Create Invoice flow, an embedded Stripe payment form, and a summary
// sidebar.
//
// A thin SERVER component: every row it renders (invoices, their line items)
// is a prop computed by app/employee/proposals/[id]/page.tsx in the same
// Promise.all batch as the DocuSign/Share panel data, so this file does no
// Supabase reads of its own — matching how ProposalDocusignPanel and
// ProposalSharePanel are fed on this same page. Only the truly interactive
// pieces (the schedule's Pay Now buttons, the Stripe Elements form) live in
// the "use client" children.

import { CreditCard, ShieldCheck } from "lucide-react";
import { ProposalPaymentsInteractive, type ScheduleInvoice } from "./ProposalPaymentsInteractive";

export interface ProposalPaymentsPanelProps {
  proposalId: string;
  clientId: string;
  proposalTitle: string;
  proposalSummary: string | null;
  invoices: ScheduleInvoice[];
  /** description -> what one line of the "next due" invoice bills for. */
  nextDueLineItems: string[];
  stripeConfigured: boolean;
  stripePublishableKey: string;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDueDate(value: string | null): string {
  if (!value) return "No due date on file";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "No due date on file" : parsed.toLocaleDateString();
}

/**
 * The invoice the summary card should headline: the earliest-due UNPAID
 * (issued) invoice, falling back to the earliest still-draft one so a
 * proposal with nothing issued yet still tells staff what is coming. null
 * once every invoice is paid or void, or when there are none at all.
 */
function nextDueInvoice(invoices: ScheduleInvoice[]): ScheduleInvoice | null {
  const byDueDate = (a: ScheduleInvoice, b: ScheduleInvoice) => (a.dueDate ?? "9999-99-99").localeCompare(b.dueDate ?? "9999-99-99");
  const issued = invoices.filter((invoice) => invoice.status === "issued").sort(byDueDate);
  if (issued.length > 0) return issued[0];
  const drafts = invoices.filter((invoice) => invoice.status === "draft").sort(byDueDate);
  return drafts[0] ?? null;
}

const defaultCurrency = "USD";

export function ProposalPaymentsPanel({
  proposalId,
  clientId,
  proposalTitle,
  proposalSummary,
  invoices,
  nextDueLineItems,
  stripeConfigured,
  stripePublishableKey,
}: ProposalPaymentsPanelProps) {
  const currency = invoices[0]?.currency ?? defaultCurrency;
  const dueInvoice = nextDueInvoice(invoices);

  // "What you're paying for" — the due invoice's own line items when there
  // are any, otherwise the proposal's own summary/title, so the card is never
  // empty just because nobody itemised the invoice.
  const whatYouArePaying =
    nextDueLineItems.length > 0
      ? nextDueLineItems
      : proposalSummary
        ? [proposalSummary]
        : [proposalTitle];

  return (
    <div className="form-panel" style={{ marginTop: 20 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CreditCard color="var(--portal-gold)" size={18} /> Payments
      </h2>
      <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
        Raise a payment-schedule line against this proposal, and accept a card payment against it directly on this
        page.
      </p>

      <div className="document-grid" style={{ marginTop: 4 }}>
        <section>
          <ProposalPaymentsInteractive
            clientId={clientId}
            currency={currency}
            invoices={invoices}
            proposalId={proposalId}
            stripeConfigured={stripeConfigured}
            stripePublishableKey={stripePublishableKey}
          />
        </section>

        <aside className="form-panel" style={{ margin: 0 }}>
          <h3 style={{ margin: 0 }}>Payment summary</h3>

          {dueInvoice ? (
            <>
              <p style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: 12 }}>
                {formatMoney(dueInvoice.total, dueInvoice.currency)}
              </p>
              <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem" }}>
                Due {formatDueDate(dueInvoice.dueDate)}
              </p>
            </>
          ) : (
            <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", marginTop: 12 }}>
              Nothing is currently due on this proposal.
            </p>
          )}

          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginTop: 16 }}>What you&rsquo;re paying for</p>
          <ul style={{ fontSize: "0.85rem", margin: "6px 0 0", paddingLeft: 18 }}>
            {whatYouArePaying.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <p
            style={{
              alignItems: "center",
              borderTop: "1px solid #ececec",
              color: "var(--portal-muted)",
              display: "flex",
              fontSize: "0.8rem",
              gap: 6,
              marginTop: 16,
              paddingTop: 12,
            }}
          >
            <ShieldCheck size={14} /> Secure checkout, processed by Stripe
          </p>
        </aside>
      </div>
    </div>
  );
}
