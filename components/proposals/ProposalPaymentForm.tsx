"use client";

// The embedded "Make a Payment" card — Stripe's Payment Element mounted
// directly on the proposal page, not a redirect to hosted Checkout.
//
// TWO STEPS, because a PaymentIntent has to exist before Elements has
// anything to mount against: (1) the operator picks which unpaid invoice to
// pay, which POSTs invoiceId to /api/stripe/payment-intent and gets back a
// clientSecret; (2) only once that arrives does <Elements> mount with
// <PaymentElement>, and stripe.confirmPayment() runs client-side against it.
// Nothing about the amount is decided here — the route re-reads the invoice
// server-side, exactly as /api/stripe/checkout does for the hosted flow.
//
// `configured` comes from the server (ProposalPaymentsPanel, reading
// getStripeConfigStatus()) rather than being guessed client-side from whether
// loadStripe() throws — the publishable key is public by definition
// (NEXT_PUBLIC_*), but whether the *server* half (secret key, webhook secret)
// is also set is not something the browser can know without asking, and a
// misconfigured environment should read as "not configured" rather than a
// half-mounted card form that can never confirm.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";

export interface PayableInvoice {
  id: string;
  invoiceNumber: string | null;
  total: number;
  currency: string;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** Mounted only once a clientSecret exists — see the two-step comment above. */
function CheckoutForm({
  proposalId,
  onSucceeded,
}: {
  proposalId: string;
  onSucceeded: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError("");

    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/employee/proposals/${proposalId}`
        : `/employee/proposals/${proposalId}`;

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      // Most cards resolve without leaving the page; a payment method that
      // genuinely needs a redirect (e.g. some bank flows) still gets one —
      // Stripe decides, this just avoids bouncing a plain card payment through
      // one for nothing.
      redirect: "if_required",
    });

    if (confirmError) {
      setSubmitting(false);
      setError(confirmError.message ?? "The payment could not be confirmed.");
      return;
    }

    setSubmitting(false);
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      onSucceeded();
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <PaymentElement />
      {error ? (
        <div className="success-box portal-alert portal-alert-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
      <button
        className="button button-primary"
        disabled={submitting || !stripe || !elements}
        style={{ marginTop: 12 }}
        type="submit"
      >
        {submitting ? <Loader2 className="spin" size={16} /> : <CreditCard size={16} />}
        {submitting ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}

export function ProposalPaymentForm({
  proposalId,
  invoices,
  configured,
  publishableKey,
  selectedInvoiceId,
  onSelectInvoice,
}: {
  proposalId: string;
  invoices: PayableInvoice[];
  configured: boolean;
  publishableKey: string;
  selectedInvoiceId: string;
  onSelectInvoice: (invoiceId: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [succeeded, setSucceeded] = useState(false);

  // Created once, lazily, and only when Stripe is actually configured — never
  // handed an empty publishable key to fail on internally.
  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (configured && publishableKey ? loadStripe(publishableKey) : null),
    [configured, publishableKey],
  );

  async function startPayment(invoiceId: string) {
    onSelectInvoice(invoiceId);
    setClientSecret(null);
    setFetchError("");
    setSucceeded(false);
    if (!invoiceId) return;

    setLoadingSecret(true);
    try {
      const response = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const body = (await response.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
      if (!response.ok || !body.clientSecret) {
        setFetchError(body.error ?? "Could not start this payment.");
        return;
      }
      setClientSecret(body.clientSecret);
    } catch {
      setFetchError("Could not reach the payment service. Check your connection and try again.");
    } finally {
      setLoadingSecret(false);
    }
  }

  if (!configured) {
    return (
      <div className="empty-state" style={{ marginTop: 12 }}>
        Payments are not configured for this environment yet — card payments cannot be accepted here until Stripe is
        set up.
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="empty-state" style={{ marginTop: 12 }}>
        Nothing is currently due. Issue an invoice from the payment schedule above to accept a payment against it.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label className="field">
        <span>Invoice to pay</span>
        <select
          disabled={loadingSecret}
          onChange={(event) => startPayment(event.target.value)}
          value={selectedInvoiceId}
        >
          <option value="">Choose an unpaid invoice</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNumber ?? "Invoice"} — {formatMoney(invoice.total, invoice.currency)}
            </option>
          ))}
        </select>
      </label>

      {fetchError ? (
        <div className="success-box portal-alert portal-alert-error" role="alert" style={{ marginTop: 12 }}>
          {fetchError}
        </div>
      ) : null}

      {succeeded ? (
        <div className="success-box" role="status" style={{ marginTop: 12 }}>
          Payment received. The invoice will show as paid shortly.
        </div>
      ) : null}

      {loadingSecret ? (
        <p style={{ color: "var(--portal-muted)", marginTop: 12 }}>
          <Loader2 className="spin" size={14} /> Preparing the payment form…
        </p>
      ) : null}

      {!loadingSecret && clientSecret && stripePromise ? (
        <Elements options={{ clientSecret }} stripe={stripePromise}>
          <CheckoutForm proposalId={proposalId} onSucceeded={() => setSucceeded(true)} />
        </Elements>
      ) : null}

      <p style={{ alignItems: "center", color: "var(--portal-muted)", display: "flex", fontSize: "0.8rem", gap: 6, marginTop: 16 }}>
        <ShieldCheck size={14} /> Secure checkout — card details are entered directly into Stripe's own form and never
        touch our servers.
      </p>
    </div>
  );
}
