import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/stripe/client", () => ({ verifyStripeWebhookSignature: vi.fn() }));
vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
  buildDataAuditEvent: (
    action: string,
    resourceType: string,
    resourceId: string,
    actorId: string | null,
    summary: string,
    before?: unknown,
    after?: unknown,
  ) => ({
    event_type: `data.${action}`,
    event_category: "data",
    severity: "info",
    actor_id: actorId,
    resource_type: resourceType,
    resource_id: resourceId,
    summary,
    before_state: before ?? null,
    after_state: after ?? null,
  }),
}));

const paymentMaybeSingle = vi.fn();
const paymentUpdateEq = vi.fn();
const invoiceMaybeSingle = vi.fn();

function buildAdminMock() {
  return {
    from: (table: string) => {
      if (table === "client_invoice_payments") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: paymentMaybeSingle }) }),
          update: () => ({ eq: paymentUpdateEq }),
        };
      }
      if (table === "client_invoices") {
        return {
          update: () => ({
            eq: () => ({
              neq: () => ({
                select: () => ({ maybeSingle: invoiceMaybeSingle }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => buildAdminMock()) }));

import { verifyStripeWebhookSignature } from "@/lib/stripe/client";
import { recordAuditEvent } from "@/lib/audit/events";
import { POST } from "./route";

const verifyMock = vi.mocked(verifyStripeWebhookSignature);
const auditMock = vi.mocked(recordAuditEvent);

function postRaw(body: string, signature: string | null = "t=1,v1=abc") {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers, body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  paymentUpdateEq.mockResolvedValue({ error: null });
});

describe("POST /api/stripe/webhook — signature", () => {
  it("401s and never touches the database when the signature is invalid", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });
    const response = await postRaw("{}");
    expect(response.status).toBe(401);
    expect(paymentMaybeSingle).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — checkout.session.completed", () => {
  it("marks the payment succeeded and the invoice paid", async () => {
    verifyMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          payment_intent: "pi_123",
          payment_method_types: ["card"],
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    paymentMaybeSingle.mockResolvedValue({
      data: { id: "payment-1", invoice_id: "invoice-1", status: "pending", stripe_event_id: null },
      error: null,
    });
    invoiceMaybeSingle.mockResolvedValue({
      data: { id: "invoice-1", invoice_number: "ACME-2026-INV-01", client_id: "client-1", total: 1250.5, currency: "usd" },
      error: null,
    });

    const response = await postRaw(JSON.stringify({ id: "evt_1" }));
    expect(response.status).toBe(200);

    // Payment row updated to succeeded, carrying the event id for idempotency.
    expect(paymentUpdateEq).toHaveBeenCalledWith("id", "payment-1");

    // Invoice flip audited.
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].event_type).toBe("data.update");
    expect(auditMock.mock.calls[0][0].after_state).toMatchObject({ status: "paid", stripe_event_id: "evt_1" });
  });

  it("is idempotent: a redelivered event for an already-processed payment does not re-flip the invoice", async () => {
    verifyMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", payment_intent: "pi_123", payment_method_types: ["card"] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    paymentMaybeSingle.mockResolvedValue({
      data: { id: "payment-1", invoice_id: "invoice-1", status: "succeeded", stripe_event_id: "evt_1" },
      error: null,
    });

    const response = await postRaw(JSON.stringify({ id: "evt_1" }));
    expect(response.status).toBe(200);
    expect(paymentUpdateEq).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("acknowledges 200 even when no matching payment row is found", async () => {
    verifyMock.mockReturnValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_unknown", payment_intent: null, payment_method_types: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    paymentMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await postRaw(JSON.stringify({ id: "evt_2" }));
    expect(response.status).toBe(200);
    expect(paymentUpdateEq).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — payment_intent.succeeded", () => {
  it("marks the payment succeeded and the invoice paid (the embedded Payment Element flow)", async () => {
    verifyMock.mockReturnValue({
      id: "evt_5",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_embedded_123",
          payment_method_types: ["card"],
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    paymentMaybeSingle.mockResolvedValue({
      data: { id: "payment-2", invoice_id: "invoice-2", status: "pending", stripe_event_id: null },
      error: null,
    });
    invoiceMaybeSingle.mockResolvedValue({
      data: { id: "invoice-2", invoice_number: "ACME-2026-INV-02", client_id: "client-1", total: 500, currency: "usd" },
      error: null,
    });

    const response = await postRaw(JSON.stringify({ id: "evt_5" }));
    expect(response.status).toBe(200);

    expect(paymentUpdateEq).toHaveBeenCalledWith("id", "payment-2");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].event_type).toBe("data.update");
    expect(auditMock.mock.calls[0][0].after_state).toMatchObject({ status: "paid", stripe_event_id: "evt_5" });
  });

  it("is idempotent: a redelivered event for an already-processed payment does not re-flip the invoice", async () => {
    verifyMock.mockReturnValue({
      id: "evt_5",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_embedded_123", payment_method_types: ["card"] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    paymentMaybeSingle.mockResolvedValue({
      data: { id: "payment-2", invoice_id: "invoice-2", status: "succeeded", stripe_event_id: "evt_5" },
      error: null,
    });

    const response = await postRaw(JSON.stringify({ id: "evt_5" }));
    expect(response.status).toBe(200);
    expect(paymentUpdateEq).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("acknowledges 200 even when no matching payment row is found (e.g. a Checkout-flow intent this handler does not own)", async () => {
    verifyMock.mockReturnValue({
      id: "evt_6",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_unknown", payment_method_types: [] } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    paymentMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await postRaw(JSON.stringify({ id: "evt_6" }));
    expect(response.status).toBe(200);
    expect(paymentUpdateEq).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/webhook — payment_intent.payment_failed", () => {
  it("marks the payment failed with the reported reason", async () => {
    verifyMock.mockReturnValue({
      id: "evt_3",
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: "pi_123",
          last_payment_error: { message: "Your card was declined.", code: "card_declined" },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    paymentMaybeSingle.mockResolvedValue({
      data: { id: "payment-1", status: "pending", stripe_event_id: null },
      error: null,
    });

    const response = await postRaw(JSON.stringify({ id: "evt_3" }));
    expect(response.status).toBe(200);
    expect(paymentUpdateEq).toHaveBeenCalledWith("id", "payment-1");
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });
});

describe("POST /api/stripe/webhook — unhandled event types", () => {
  it("acknowledges 200 without touching the database", async () => {
    verifyMock.mockReturnValue({ id: "evt_4", type: "customer.created", data: { object: {} } } as ReturnType<
      typeof verifyMock
    >);
    const response = await postRaw(JSON.stringify({ id: "evt_4" }));
    expect(response.status).toBe(200);
    expect(paymentMaybeSingle).not.toHaveBeenCalled();
  });
});
