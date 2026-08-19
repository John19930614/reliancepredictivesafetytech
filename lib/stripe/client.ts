import "server-only";

import Stripe from "stripe";
import { configuredSiteUrl, getStripeConfig } from "./config";
import { getOrCreateStripeCustomerId } from "./customers";

let stripeSingleton: Stripe | null = null;

/**
 * The shared Stripe SDK instance for this process, built from getStripeConfig()
 * on first use. Throws the same clear "not enabled" / "missing settings" error
 * as getStripeConfig() itself when Stripe is not configured — callers should
 * check getStripeConfigStatus().configured first if they want to fail with a
 * 503 instead of a 500.
 */
export function getStripeClient(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  const config = getStripeConfig();
  // apiVersion intentionally omitted: the installed SDK major version pins its
  // own default API version, and pinning a literal string here would drift out
  // of sync with it the next time the dependency is upgraded.
  stripeSingleton = new Stripe(config.secretKey);
  return stripeSingleton;
}

export interface CreateInvoiceCheckoutSessionInput {
  invoiceId: string;
  /** Amount in MAJOR currency units (dollars), e.g. 1250.00 — never cents. */
  amount: number;
  /** ISO 4217, e.g. "usd". Case-insensitive; Stripe wants it lowercase. */
  currency: string;
  clientId: string;
  clientEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Printed on the Checkout line item when available. Cosmetic only. */
  invoiceNumber?: string | null;
}

export interface CreateInvoiceCheckoutSessionResult {
  sessionId: string;
  url: string | null;
  customerId: string;
}

/**
 * Creates a Stripe Checkout Session (mode: "payment") for one client invoice.
 *
 * The amount and currency are whatever the CALLER passes in — this function
 * does no invoice lookup of its own and trusts its input completely. The route
 * that calls it (app/api/stripe/checkout) is what re-reads client_invoices
 * server-side before calling this, which is the one place a client-supplied
 * amount must never be allowed to reach Stripe from.
 */
export async function createInvoiceCheckoutSession(
  input: CreateInvoiceCheckoutSessionInput,
): Promise<CreateInvoiceCheckoutSessionResult> {
  const stripe = getStripeClient();
  const customerId = await getOrCreateStripeCustomerId(stripe, input.clientId, input.clientEmail);

  const unitAmount = Math.round(input.amount * 100);
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    throw new Error("Invoice amount must be a positive number to create a Checkout Session.");
  }

  const metadata = {
    invoice_id: input.invoiceId,
    client_id: input.clientId,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    payment_intent_data: { metadata },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: input.invoiceNumber ? `Invoice ${input.invoiceNumber}` : "Invoice payment",
          },
        },
      },
    ],
  });

  return { sessionId: session.id, url: session.url, customerId };
}

/**
 * Verifies a Stripe webhook delivery's signature and returns the parsed event.
 * Throws (Stripe.errors.StripeSignatureVerificationError, or the config errors
 * from getStripeConfig()) on a missing header or a bad signature — the caller
 * is expected to catch and respond 401.
 */
export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string | null): Stripe.Event {
  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header.");
  }
  const config = getStripeConfig();
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, config.webhookSecret);
}

/**
 * Success/cancel return URLs for a Checkout Session against one invoice, built
 * from NEXT_PUBLIC_SITE_URL — the same convention lib/docusign/client.ts uses
 * to build its own callback URL. Query params, not a dedicated invoice-detail
 * route, so this does not assume any particular page shape exists.
 */
export function buildInvoiceCheckoutReturnUrls(invoiceId: string): { successUrl: string; cancelUrl: string } {
  const siteUrl = configuredSiteUrl();
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required so Stripe Checkout can return the client to the portal.");
  }
  return {
    successUrl: `${siteUrl}/employee/invoices?payment=success&invoice=${encodeURIComponent(invoiceId)}`,
    cancelUrl: `${siteUrl}/employee/invoices?payment=cancelled&invoice=${encodeURIComponent(invoiceId)}`,
  };
}
