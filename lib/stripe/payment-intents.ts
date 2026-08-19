import "server-only";

// Embedded Stripe payments against one client invoice — a PaymentIntent, not a
// Checkout Session.
//
// This is a SEPARATE, ADDITIVE path from lib/stripe/client.ts's
// createInvoiceCheckoutSession: that one builds a hosted Checkout Session (the
// browser is redirected to Stripe's own page), and the proposal detail page
// instead embeds Stripe's Payment Element directly on the page — card number,
// expiry, CVC and billing address typed without ever leaving the portal. That
// UI needs a PaymentIntent client secret to mount against, which is all this
// module produces. Nothing here writes to Supabase — the caller
// (app/api/stripe/payment-intent/route.ts) owns the client_invoice_payments
// row, exactly as app/api/stripe/checkout/route.ts owns its own row around
// createInvoiceCheckoutSession.
//
// The amount, currency and client are trusted CALLER input here, same as
// createInvoiceCheckoutSession — the route that calls this is what re-reads
// client_invoices server-side first. See that route's own comment for why a
// client-supplied amount must never reach either function.

import { getStripeClient } from "./client";
import { getOrCreateStripeCustomerId } from "./customers";

export interface CreateInvoicePaymentIntentInput {
  invoiceId: string;
  /** Amount in MAJOR currency units (dollars), e.g. 1250.00 — never cents. */
  amount: number;
  /** ISO 4217, e.g. "usd". Case-insensitive; Stripe wants it lowercase. */
  currency: string;
  clientId: string;
  clientEmail: string | null;
}

export interface CreateInvoicePaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
  customerId: string;
}

/**
 * Creates a Stripe PaymentIntent for one client invoice, for the embedded
 * Payment Element to confirm client-side.
 *
 * `automatic_payment_methods` is left enabled rather than pinning
 * `payment_method_types: ["card"]`: the product screenshot shows a card form,
 * but Stripe decides at confirm-time which of the account's enabled payment
 * methods actually fit the amount/currency/customer, and hard-coding "card"
 * here would silently stop that working the day the account turns on anything
 * else. `metadata` mirrors createInvoiceCheckoutSession's shape exactly so the
 * webhook and any Stripe-side reconciliation read the same two keys
 * regardless of which flow created the PaymentIntent.
 */
export async function createInvoicePaymentIntent(
  input: CreateInvoicePaymentIntentInput,
): Promise<CreateInvoicePaymentIntentResult> {
  const stripe = getStripeClient();
  const customerId = await getOrCreateStripeCustomerId(stripe, input.clientId, input.clientEmail);

  const unitAmount = Math.round(input.amount * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    throw new Error("Invoice amount must be a positive number to create a PaymentIntent.");
  }

  const intent = await stripe.paymentIntents.create({
    amount: unitAmount,
    currency: input.currency.toLowerCase(),
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    metadata: {
      invoice_id: input.invoiceId,
      client_id: input.clientId,
    },
  });

  if (!intent.client_secret) {
    // Never actually null for a freshly created PaymentIntent, but the SDK
    // types it as nullable — surfaced as a clear error rather than handing the
    // browser `undefined` to mount Elements against.
    throw new Error("Stripe did not return a client secret for this PaymentIntent.");
  }

  return { paymentIntentId: intent.id, clientSecret: intent.client_secret, customerId };
}
