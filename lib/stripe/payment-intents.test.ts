import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* -------------------------------------------------------------------------- */
/* Mocks — same shape as lib/stripe/client.test.ts, since this module reuses  */
/* the same Stripe SDK singleton and the same customer lookup.                */
/* -------------------------------------------------------------------------- */

const paymentIntentsCreate = vi.fn();
const customersCreate = vi.fn();

vi.mock("stripe", () => {
  // A plain `function` so `new Stripe(...)` can construct it — see
  // lib/stripe/client.test.ts's own comment for why this cannot be an arrow
  // function passed to vi.fn().mockImplementation().
  function FakeStripe() {
    return {
      paymentIntents: { create: paymentIntentsCreate },
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
] as const;
let saved: Record<string, string | undefined>;

function enableStripe() {
  process.env.STRIPE_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";
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
  paymentIntentsCreate.mockResolvedValue({ id: "pi_test_123", client_secret: "pi_test_123_secret_abc" });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("createInvoicePaymentIntent", () => {
  it("creates a PaymentIntent with cents, metadata, and a reused customer", async () => {
    enableStripe();
    adminMaybeSingle.mockResolvedValueOnce({
      data: { id: "client-1", name: "Acme Co", stripe_customer_id: "cus_existing" },
      error: null,
    });
    const { createInvoicePaymentIntent } = await import("./payment-intents");

    const result = await createInvoicePaymentIntent({
      invoiceId: "11111111-2222-4333-8444-555555555555",
      amount: 1250.5,
      currency: "USD",
      clientId: "client-1",
      clientEmail: "ap@acme.example",
    });

    expect(result).toEqual({
      paymentIntentId: "pi_test_123",
      clientSecret: "pi_test_123_secret_abc",
      customerId: "cus_existing",
    });

    expect(customersCreate).not.toHaveBeenCalled();
    expect(paymentIntentsCreate).toHaveBeenCalledTimes(1);
    const params = paymentIntentsCreate.mock.calls[0][0];
    expect(params.customer).toBe("cus_existing");
    // 1250.50 dollars -> 125050 cents, never a float truncated to 125049/51.
    expect(params.amount).toBe(125050);
    expect(params.currency).toBe("usd");
    expect(params.automatic_payment_methods).toEqual({ enabled: true });
    expect(params.metadata).toEqual({
      invoice_id: "11111111-2222-4333-8444-555555555555",
      client_id: "client-1",
    });
  });

  it("creates and persists a Stripe customer when the client has none yet", async () => {
    enableStripe();
    const { createInvoicePaymentIntent } = await import("./payment-intents");

    const result = await createInvoicePaymentIntent({
      invoiceId: "11111111-2222-4333-8444-555555555555",
      amount: 100,
      currency: "usd",
      clientId: "client-1",
      clientEmail: "ap@acme.example",
    });

    expect(result.customerId).toBe("cus_new123");
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ap@acme.example", name: "Acme Co", metadata: { client_id: "client-1" } }),
    );
    expect(adminUpdateEq).toHaveBeenCalled();
  });

  it("rejects a non-positive amount without calling Stripe", async () => {
    enableStripe();
    const { createInvoicePaymentIntent } = await import("./payment-intents");

    await expect(
      createInvoicePaymentIntent({
        invoiceId: "11111111-2222-4333-8444-555555555555",
        amount: 0,
        currency: "usd",
        clientId: "client-1",
        clientEmail: null,
      }),
    ).rejects.toThrow(/positive/i);

    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it("throws a clear error when Stripe is not configured", async () => {
    // Stripe left disabled.
    const { createInvoicePaymentIntent } = await import("./payment-intents");

    await expect(
      createInvoicePaymentIntent({
        invoiceId: "11111111-2222-4333-8444-555555555555",
        amount: 100,
        currency: "usd",
        clientId: "client-1",
        clientEmail: null,
      }),
    ).rejects.toThrow(/not enabled/i);
  });

  it("throws when Stripe returns no client secret", async () => {
    enableStripe();
    paymentIntentsCreate.mockResolvedValueOnce({ id: "pi_test_456", client_secret: null });
    const { createInvoicePaymentIntent } = await import("./payment-intents");

    await expect(
      createInvoicePaymentIntent({
        invoiceId: "11111111-2222-4333-8444-555555555555",
        amount: 100,
        currency: "usd",
        clientId: "client-1",
        clientEmail: null,
      }),
    ).rejects.toThrow(/client secret/i);
  });
});
