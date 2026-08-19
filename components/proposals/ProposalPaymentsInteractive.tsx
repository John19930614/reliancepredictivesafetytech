"use client";

// The interactive half of the Payments panel: the Payment Schedule table, the
// Create Invoice toggle, and the Make a Payment card — grouped into one
// client component because "Pay Now" on a schedule row and the invoice picker
// in the payment card are the SAME choice made from two places, and sharing
// that selection needs client state a server component cannot hold. Nothing
// here fetches its own data: every invoice row is a prop straight from
// ProposalPaymentsPanel, which is the server component that actually queries
// Supabase, matching how ProposalDocusignPanel and ProposalSharePanel are fed
// on this same page.

import { useRef, useState } from "react";
import { CreditCard } from "lucide-react";
import { ProposalInvoiceForm } from "./ProposalInvoiceForm";
import { ProposalPaymentForm, type PayableInvoice } from "./ProposalPaymentForm";

export interface ScheduleInvoice {
  id: string;
  invoiceNumber: string | null;
  kind: string;
  status: string;
  dueDate: string | null;
  total: number;
  currency: string;
}

const kindLabels: Record<string, string> = {
  deposit: "Deposit",
  full: "Full payment",
  balance: "Balance",
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDueDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

/**
 * draft -> Pending, void -> Void, paid -> Paid, issued -> Due Soon (within 14
 * days of today, overdue included) or Pending otherwise — the mapping the
 * product screenshot specifies.
 */
function scheduleStatus(invoice: ScheduleInvoice, today: Date): { label: string; className: string } {
  if (invoice.status === "void") return { label: "Void", className: "record-badge-danger" };
  if (invoice.status === "paid") return { label: "Paid", className: "badge-green" };
  if (invoice.status === "draft") return { label: "Pending", className: "record-badge-neutral" };

  // issued
  if (invoice.dueDate) {
    const due = new Date(`${invoice.dueDate}T00:00:00Z`);
    if (!Number.isNaN(due.getTime())) {
      const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);
      if (daysUntilDue <= 14) return { label: "Due Soon", className: "record-badge-gold" };
    }
  }
  return { label: "Pending", className: "record-badge-neutral" };
}

export function ProposalPaymentsInteractive({
  proposalId,
  clientId,
  currency,
  invoices,
  stripeConfigured,
  stripePublishableKey,
}: {
  proposalId: string;
  clientId: string;
  currency: string;
  invoices: ScheduleInvoice[];
  stripeConfigured: boolean;
  stripePublishableKey: string;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const paymentCardRef = useRef<HTMLDivElement>(null);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

  const payable: PayableInvoice[] = invoices
    .filter((invoice) => invoice.status === "issued")
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      currency: invoice.currency,
    }));

  function payNow(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    paymentCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Payment schedule</h3>
        <ProposalInvoiceForm clientId={clientId} currency={currency} proposalId={proposalId} />
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 12 }}>
          No invoices have been raised against this proposal yet.
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Item</th>
                <th>Due date</th>
                <th>Status</th>
                <th>Amount</th>
                <th aria-label="Pay" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const status = scheduleStatus(invoice, today);
                const unpaid = invoice.status === "issued" || invoice.status === "draft";
                return (
                  <tr key={invoice.id}>
                    <td>
                      {kindLabels[invoice.kind] ?? invoice.kind}
                      <br />
                      <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}>
                        {invoice.invoiceNumber ?? "Not yet numbered"}
                      </span>
                    </td>
                    <td>{formatDueDate(invoice.dueDate)}</td>
                    <td>
                      <span className={`record-badge ${status.className}`}>{status.label}</span>
                    </td>
                    <td>{formatMoney(invoice.total, invoice.currency)}</td>
                    <td>
                      {invoice.status === "issued" ? (
                        <button
                          className="button button-primary button-sm"
                          onClick={() => payNow(invoice.id)}
                          type="button"
                        >
                          <CreditCard size={13} /> Pay now
                        </button>
                      ) : unpaid ? (
                        <span style={{ color: "var(--portal-muted)", fontSize: "0.8rem" }}>Not yet issued</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div ref={paymentCardRef} className="form-panel" style={{ marginTop: 20 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          <CreditCard color="var(--portal-gold)" size={18} /> Make a payment
        </h3>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", marginTop: 8 }}>
          Card number, expiration, CVC and billing address are entered directly into Stripe&rsquo;s own embedded form
          below.
        </p>
        <ProposalPaymentForm
          configured={stripeConfigured}
          invoices={payable}
          onSelectInvoice={setSelectedInvoiceId}
          proposalId={proposalId}
          publishableKey={stripePublishableKey}
          selectedInvoiceId={selectedInvoiceId}
        />
      </div>
    </div>
  );
}
