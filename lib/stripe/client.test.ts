import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Mocks — the Stripe SDK and the Supabase admin client, never really reached */
/* -------------------------------------------------------------------------- */

const checkoutSessionsCreate = vi.fn();
const webhooksConstructEvent = vi.fn();
const customersCreate = vi.fn();

vi.mock("stripe", () => {
  // A plain `function` (not an arrow function) so `new Stripe(...)` can
  // construct it — vi.fn().mockImplementation(arrow) is not constructible and
  // throws "is not a constructor" the moment lib/stripe/client.ts does `new`.
  function FakeStripe() {
    return {
      checkout: { sessions: { create: checkoutSessionsCreate } },
      webhooks: { constructEvent: webhooksConstructEvent },
      customers: { create: customersCreate },
    };
  }
  return { default: FakeStripe };
});

const adminMaybeSingle = vi.fn();
const adminUpdateEq = vi.fn();

function adminChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: adminMaybeSingle,
    update: () => ({ eq: adminUpdateEq }),
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: () => adminChain() })),
}));

const ENV_KEYS = [
  "STRIPE_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;
let saved: Record<string, string | undefined>;

function enableStripe() {
  process.env.STRIPE_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
  process.env.NEXT_PUBLIC_SITE_URL = "https://portal.example.com/";
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  vi.clearAllMocks();
  vi.resetModules();
  adminMaybeSingle.mockResolvedValue({
    data: { id: "client-1", name: "Acme Co", stripe_customer_id: null },
    error: null,
  });
  adminUpdateEq.mockResolvedValue({ error: null });
  customersCreate.mockResolvedValue({ id: "cus_new123" });
  checkoutSessionsCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

/* -------------------------------------------------------------------------- */
/* createInvoiceCheckoutSession                                               */
/* -------------------------------------------------------------------------- */

describe("createInvoiceCheckoutSession", () => {
  it("builds a payment-mode Checkout Session with the invoice/client metadata and a reused customer", async () => {
    enableStripe();
    adminMaybeSingle.mockResolvedValueOnce({
      data: { id: "client-1", name: "Acme Co", stripe_customer_id: "cus_existing" },
      error: null,
    });
    const { createInvoiceCheckoutSession } = await import("./client");

    const result = await createInvoiceCheckoutSession({
      invoiceId: "11111111-2222-4333-8444-555555555555",
      amount: 1250.5,
      currency: "USD",
      clientId: "client-1",
      clientEmail: "ap@acme.example",
      successUrl: "https://portal.example.com/employee/invoices?payment=success",
      cancelUrl: "https://portal.example.com/employee/invoices?payment=cancelled",
      invoiceNumber: "ACME-2026-INV-01",
    });

    expect(result).toEqual({
      sessionId: "cs_test_123",
      url: "https://checkout.stripe.com/pay/cs_test_123",
      customerId: "cus_existing",
    });

    // No new customer created: the row already had one.
    expect(customersCreate).not.toHaveBeenCalled();

    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const params = checkoutSessionsCreate.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.customer).toBe("cus_existing");
    expect(params.success_url).toBe("https://portal.example.com/employee/invoices?payment=success");
    expect(params.cancel_url).toBe("https://portal.example.com/employee/invoices?payment=cancelled");
    expect(params.metadata).toEqual({
      invoice_id: "11111111-2222-4333-8444-555555555555",
      client_id: "client-1",
    });
    expect(params.payment_intent_data.metadata).toEqual(params.metadata);
    expect(params.line_items).toHaveLength(1);
    // 1250.50 dollars -> 125050 cents, never a float truncated to 125049/51.
    expect(params.line_items[0].price_data.unit_amount).toBe(125050);
    expect(params.line_items[0].price_data.currency).toBe("usd");
    expect(params.line_items[0].price_data.product_data.name).toBe("Invoice ACME-2026-INV-01");
  });

  it("creates and persists a Stripe customer when the client has none yet", async () => {
    enableStripe();
    // adminMaybeSingle default (beforeEach) has stripe_customer_id: null.
    const { createInvoiceCheckoutSession } = await import("./client");

    const result = await createInvoiceCheckoutSession({
      invoiceId: "11111111-2222-4333-8444-555555555555",
      amount: 100,
      currency: "usd",
      clientId: "client-1",
      clientEmail: "ap@acme.example",
      successUrl: "https://portal.example.com/success",
      cancelUrl: "https://portal.example.com/cancel",
    });

    expect(result.customerId).toBe("cus_new123");
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ap@acme.example", name: "Acme Co", metadata: { client_id: "client-1" } }),
    );
    // The new customer id is written back onto company_clients.
    expect(adminUpdateEq).toHaveBeenCalled();
  });

  it("rejects a non-positive amount without calling Stripe", async () => {
    enableStripe();
    const { createInvoiceCheckoutSession } = await import("./client");

    await expect(
      createInvoiceCheckoutSession({
        invoiceId: "11111111-2222-4333-8444-555555555555",
        amount: 0,
        currency: "usd",
        clientId: "client-1",
        clientEmail: null,
        successUrl: "https://portal.example.com/success",
        cancelUrl: "https://portal.example.com/cancel",
      }),
    ).rejects.toThrow(/positive/i);

    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("throws a clear error when Stripe is not configured", async () => {
    // Stripe left disabled.
    const { createInvoiceCheckoutSession } = await import("./client");

    await expect(
      createInvoiceCheckoutSession({
        invoiceId: "11111111-2222-4333-8444-555555555555",
        amount: 100,
        currency: "usd",
        clientId: "client-1",
        clientEmail: null,
        successUrl: "https://portal.example.com/success",
        cancelUrl: "https://portal.example.com/cancel",
      }),
    ).rejects.toThrow(/not enabled/i);
  });
});

/* -------------------------------------------------------------------------- */
/* verifyStripeWebhookSignature                                               */
/* -------------------------------------------------------------------------- */

describe("verifyStripeWebhookSignature", () => {
  it("delegates to stripe.webhooks.constructEvent with the configured secret", async () => {
    enableStripe();
    webhooksConstructEvent.mockReturnValue({ id: "evt_123", type: "checkout.session.completed" });
    const { verifyStripeWebhookSignature } = await import("./client");

    const event = verifyStripeWebhookSignature("{}", "t=1,v1=abc");
    expect(event).toEqual({ id: "evt_123", type: "checkout.session.completed" });
    expect(webhooksConstructEvent).toHaveBeenCalledWith("{}", "t=1,v1=abc", "whsec_123");
  });

  it("throws when the signature header is missing", async () => {
    enableStripe();
    const { verifyStripeWebhookSignature } = await import("./client");
    expect(() => verifyStripeWebhookSignature("{}", null)).toThrow(/signature/i);
    expect(webhooksConstructEvent).not.toHaveBeenCalled();
  });

  it("propagates a bad-signature rejection from the SDK", async () => {
    enableStripe();
    webhooksConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const { verifyStripeWebhookSignature } = await import("./client");
    expect(() => verifyStripeWebhookSignature("{}", "t=1,v1=bad")).toThrow(/no signatures found/i);
  });
});

/* -------------------------------------------------------------------------- */
/* buildInvoiceCheckoutReturnUrls                                             */
/* -------------------------------------------------------------------------- */

describe("buildInvoiceCheckoutReturnUrls", () => {
  it("builds success/cancel URLs from NEXT_PUBLIC_SITE_URL, trailing slash trimmed", async () => {
    enableStripe();
    const { buildInvoiceCheckoutReturnUrls } = await import("./client");
    const urls = buildInvoiceCheckoutReturnUrls("11111111-2222-4333-8444-555555555555");
    expect(urls.successUrl).toBe(
      "https://portal.example.com/employee/invoices?payment=success&invoice=11111111-2222-4333-8444-555555555555",
    );
    expect(urls.cancelUrl).toBe(
      "https://portal.example.com/employee/invoices?payment=cancelled&invoice=11111111-2222-4333-8444-555555555555",
    );
  });

  it("throws when NEXT_PUBLIC_SITE_URL is unset", async () => {
    enableStripe();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const { buildInvoiceCheckoutReturnUrls } = await import("./client");
    expect(() => buildInvoiceCheckoutReturnUrls("11111111-2222-4333-8444-555555555555")).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });
});
