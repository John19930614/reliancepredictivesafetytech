import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pipeline/access", () => ({ getPipelineAccess: vi.fn() }));
vi.mock("@/lib/stripe/config", () => ({ getStripeConfigStatus: vi.fn() }));
vi.mock("@/lib/stripe/payment-intents", () => ({ createInvoicePaymentIntent: vi.fn() }));
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

import { getPipelineAccess } from "@/lib/pipeline/access";
import { getStripeConfigStatus } from "@/lib/stripe/config";
import { createInvoicePaymentIntent } from "@/lib/stripe/payment-intents";
import { recordAuditEvent } from "@/lib/audit/events";
import { POST } from "./route";

const accessMock = vi.mocked(getPipelineAccess);
const configMock = vi.mocked(getStripeConfigStatus);
const createIntentMock = vi.mocked(createInvoicePaymentIntent);
const auditMock = vi.mocked(recordAuditEvent);

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in — the same shape                               */
/* app/employee/invoices/actions.test.ts uses for the caller's session client */
/* -------------------------------------------------------------------------- */

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((filters: Array<[string, unknown]>) => QueryResult);

function createSupabaseMock(routes: Record<string, Route>) {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];

  function resolve(table: string, filters: Array<[string, unknown]>): QueryResult {
    const route = routes[table];
    const result = typeof route === "function" ? route(filters) : route;
    return { data: result?.data ?? null, error: result?.error ?? null };
  }

  return {
    insertCalls,
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const api: any = {
        select: () => api,
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return api;
        },
        maybeSingle: () => Promise.resolve(resolve(table, filters)),
        insert(payload: unknown) {
          insertCalls.push({ table, payload });
          return api;
        },
        single: () => Promise.resolve(resolve(`${table}:insert`, filters)),
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return api;
    },
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/stripe/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function issuedInvoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_ID,
    client_id: CLIENT_ID,
    invoice_number: "ACME-2026-001-01",
    status: "issued",
    total: 500,
    currency: "usd",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  configMock.mockReturnValue({ enabled: true, configured: true, missing: [] });
});

describe("POST /api/stripe/payment-intent — access", () => {
  it("401s a signed-out caller before any Stripe or database call", async () => {
    accessMock.mockResolvedValue({
      supabase: null,
      userId: null,
      role: null,
      userEmail: null,
      canRead: false,
      canAdvance: false,
      canOverride: false,
      canDraftInvoice: false,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: INVOICE_ID });
    expect(response.status).toBe(401);
    expect(createIntentMock).not.toHaveBeenCalled();
  });

  it("403s a signed-in caller whose role cannot read invoices", async () => {
    const supabase = createSupabaseMock({});
    accessMock.mockResolvedValue({
      supabase,
      userId: "user-1",
      role: "field_technician",
      userEmail: "tech@example.com",
      canRead: false,
      canAdvance: false,
      canOverride: false,
      canDraftInvoice: false,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: INVOICE_ID });
    expect(response.status).toBe(403);
    expect(createIntentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/payment-intent — configuration", () => {
  it("503s when Stripe is not configured for this environment", async () => {
    configMock.mockReturnValue({ enabled: false, configured: false, missing: ["STRIPE_SECRET_KEY"] });
    accessMock.mockResolvedValue({
      supabase: createSupabaseMock({}),
      userId: "user-1",
      role: "operations_manager",
      userEmail: "ops@example.com",
      canRead: true,
      canAdvance: true,
      canOverride: false,
      canDraftInvoice: true,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: INVOICE_ID });
    expect(response.status).toBe(503);
    expect(createIntentMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/stripe/payment-intent — happy path", () => {
  it("re-reads the invoice server-side, creates a PaymentIntent, and records a pending payment row", async () => {
    const supabase = createSupabaseMock({
      client_invoices: { data: issuedInvoiceRow() },
      company_clients: { data: { id: CLIENT_ID, name: "Acme Co", email: "ap@acme.example" } },
      "client_invoice_payments:insert": { data: { id: "payment-1" } },
    });
    accessMock.mockResolvedValue({
      supabase,
      userId: "user-1",
      role: "operations_manager",
      userEmail: "ops@example.com",
      canRead: true,
      canAdvance: true,
      canOverride: false,
      canDraftInvoice: true,
      canSettleInvoice: false,
      isAdmin: false,
    });
    createIntentMock.mockResolvedValue({
      paymentIntentId: "pi_test_123",
      clientSecret: "pi_test_123_secret_abc",
      customerId: "cus_test_123",
    });

    const response = await post({ invoiceId: INVOICE_ID });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ clientSecret: "pi_test_123_secret_abc", paymentId: "payment-1" });

    // The amount handed to Stripe is the server-side re-read total (500), not
    // anything the request body could have supplied — the body only ever
    // carried invoiceId.
    expect(createIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: INVOICE_ID, amount: 500, currency: "usd", clientId: CLIENT_ID }),
    );

    const paymentInsert = supabase.insertCalls.find((call) => call.table === "client_invoice_payments");
    expect(paymentInsert?.payload).toMatchObject({
      invoice_id: INVOICE_ID,
      status: "pending",
      initiated_by: "user-1",
      stripe_payment_intent_id: "pi_test_123",
      stripe_customer_id: "cus_test_123",
    });

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].event_category).toBe("billing");
  });

  it("rejects a malformed invoiceId before touching Stripe or the database", async () => {
    accessMock.mockResolvedValue({
      supabase: createSupabaseMock({}),
      userId: "user-1",
      role: "operations_manager",
      userEmail: "ops@example.com",
      canRead: true,
      canAdvance: true,
      canOverride: false,
      canDraftInvoice: true,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: "not-a-uuid" });
    expect(response.status).toBe(400);
    expect(createIntentMock).not.toHaveBeenCalled();
  });

  it("409s a draft invoice — only an issued invoice is payable", async () => {
    const supabase = createSupabaseMock({
      client_invoices: { data: issuedInvoiceRow({ status: "draft" }) },
    });
    accessMock.mockResolvedValue({
      supabase,
      userId: "user-1",
      role: "operations_manager",
      userEmail: "ops@example.com",
      canRead: true,
      canAdvance: true,
      canOverride: false,
      canDraftInvoice: true,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: INVOICE_ID });
    expect(response.status).toBe(409);
    expect(createIntentMock).not.toHaveBeenCalled();
  });

  it("404s when the invoice does not exist or is not visible to this caller", async () => {
    const supabase = createSupabaseMock({
      client_invoices: { data: null },
    });
    accessMock.mockResolvedValue({
      supabase,
      userId: "user-1",
      role: "operations_manager",
      userEmail: "ops@example.com",
      canRead: true,
      canAdvance: true,
      canOverride: false,
      canDraftInvoice: true,
      canSettleInvoice: false,
      isAdmin: false,
    });

    const response = await post({ invoiceId: INVOICE_ID });
    expect(response.status).toBe(404);
    expect(createIntentMock).not.toHaveBeenCalled();
  });
});
