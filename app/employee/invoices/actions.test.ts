// What createManualInvoice does with the two things the browser now sends it
// that it cannot be allowed to take on trust: the client, and the proposal the
// operator says this invoice bills against.
//
// The arithmetic is not retested here — lib/invoices/manual.test.ts owns every
// amount, and this action deliberately does none of its own. What is tested is
// the pairing, the numbering consequence that follows from it, and the two
// database refusals an operator has to be able to read.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/pipeline/access", () => ({ getPipelineAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { recordAuditEvent } from "@/lib/audit/events";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { resolvePipelineRoleFlags } from "@/lib/pipeline/policy";
import type { NewManualInvoiceInput } from "@/lib/invoices/manual";
import { createManualInvoice } from "./actions";

const accessMock = vi.mocked(getPipelineAccess);
const auditMock = vi.mocked(recordAuditEvent);

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "44444444-4444-4444-8444-444444444444";
const PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in, following the workflow actions' own test       */
/* -------------------------------------------------------------------------- */

interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

type Route = QueryResult | ((query: QueryRecord) => QueryResult);

function createSupabaseMock(routes: Record<string, Route>) {
  const calls: QueryRecord[] = [];

  function resolve(record: QueryRecord): { data: unknown; error: unknown } {
    const route = routes[`${record.table}:${record.op}`];
    const result = typeof route === "function" ? route(record) : route;
    return { data: result?.data ?? null, error: result?.error ?? null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      insert(payload: unknown) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      delete() {
        record.op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      maybeSingle: () => Promise.resolve(resolve(record)),
      single: () => Promise.resolve(resolve(record)),
      then: (onFulfilled?: any, onRejected?: any) =>
        Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    from(table: string) {
      const record: QueryRecord = { table, op: "select", filters: [] };
      calls.push(record);
      return builder(record);
    },
  };
}

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

function findCall(supabase: SupabaseMock, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((call) => call.table === table && call.op === op);
}

function signIn(supabase: unknown, role = "admin") {
  const flags = resolvePipelineRoleFlags(role, true);
  accessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role,
    userEmail: "dana@example.com",
    ...flags,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function invoiceInput(over: Partial<NewManualInvoiceInput> = {}): NewManualInvoiceInput {
  return {
    clientId: CLIENT_ID,
    currency: "USD",
    issueDate: "2026-03-10",
    paymentTerms: "Net 30 from invoice date",
    taxAmount: 0,
    lines: [
      {
        description: "Site safety audit",
        quantity: 1,
        unitAmount: 1500,
        unit: "Session",
        qtyBasis: "flat",
        serviceDate: "2026-03-02",
      },
    ],
    ...over,
  };
}

/** The routes a successful raise needs, with the pieces a test wants to move. */
function routesFor(
  over: {
    client?: QueryResult;
    proposal?: QueryResult;
    invoiceInsert?: Route;
  } = {},
): Record<string, Route> {
  return {
    "company_clients:select": over.client ?? { data: { id: CLIENT_ID, name: "Wondfo USA", company_slug: "WONDFOUSA" } },
    "client_proposals:select":
      over.proposal ?? {
        data: {
          id: PROPOSAL_ID,
          client_id: CLIENT_ID,
          proposal_number: "WONDFOUSA-2026-001",
          title: "EHS Program Support",
        },
      },
    "client_invoices:insert":
      over.invoiceInsert ?? { data: { id: INVOICE_ID, invoice_number: "WONDFOUSA-2026-INV-01" } },
    "client_invoice_line_items:insert": {},
    "client_invoices:delete": { data: [{ id: INVOICE_ID }] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* No proposal — the case this form was built for                              */
/* -------------------------------------------------------------------------- */

describe("createManualInvoice — with no proposal behind it", () => {
  it("writes a null proposal_id, which is what keeps the {SLUG}-{YYYY}-INV-{NN} number", async () => {
    const supabase = createSupabaseMock(routesFor());
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput());

    expect(result.ok).toBe(true);
    const insert = findCall(supabase, "client_invoices", "insert");
    expect((insert?.payload as { proposal_id: string | null }).proposal_id).toBeNull();
    // Nothing was read from client_proposals: there was nothing to check.
    expect(findCall(supabase, "client_proposals", "select")).toBeUndefined();
  });

  it("still refuses a client with no company slug, because nothing else can number it", async () => {
    const supabase = createSupabaseMock(
      routesFor({ client: { data: { id: CLIENT_ID, name: "Wondfo USA", company_slug: null } } }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Wondfo USA has no company slug");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Billing against a proposal                                                  */
/* -------------------------------------------------------------------------- */

describe("createManualInvoice — billing against a proposal", () => {
  it("writes the chosen proposal_id once it has proved the proposal is this client's", async () => {
    const supabase = createSupabaseMock(
      routesFor({ invoiceInsert: { data: { id: INVOICE_ID, invoice_number: "WONDFOUSA-2026-001-01" } } }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result).toMatchObject({ ok: true, invoiceNumber: "WONDFOUSA-2026-001-01" });
    const insert = findCall(supabase, "client_invoices", "insert");
    expect((insert?.payload as { proposal_id: string | null }).proposal_id).toBe(PROPOSAL_ID);

    // The proposal was READ, by id, rather than taken as posted.
    expect(findCall(supabase, "client_proposals", "select")?.filters).toContainEqual(["id", PROPOSAL_ID]);
  });

  it("refuses a proposal belonging to another client, and writes nothing", async () => {
    // The attack this check exists for: a posted uuid that names someone else's
    // contract would spend a number off it and print their proposal number on
    // this client's invoice.
    const supabase = createSupabaseMock(
      routesFor({
        proposal: {
          data: {
            id: PROPOSAL_ID,
            client_id: OTHER_CLIENT_ID,
            proposal_number: "OTHERCO-2026-004",
            title: "Someone else's contract",
          },
        },
      }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("does not belong to Wondfo USA");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses a proposal that cannot be read at all", async () => {
    const supabase = createSupabaseMock(routesFor({ proposal: { data: null } }));
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("could not be found");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("refuses a malformed proposal reference before it queries anything for it", async () => {
    const supabase = createSupabaseMock(routesFor());
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: "not-a-uuid" }));

    expect(result).toMatchObject({ ok: false, error: "Malformed proposal reference." });
    expect(findCall(supabase, "client_proposals", "select")).toBeUndefined();
  });

  it("refuses a proposal with no document number rather than minting the other shape", async () => {
    // The trigger's parent branch needs proposal_number and falls THROUGH to the
    // manual shape without it — an invoice carrying a proposal_id and a
    // {SLUG}-{YYYY}-INV-{NN} number contradicts its own row.
    const supabase = createSupabaseMock(
      routesFor({
        proposal: { data: { id: PROPOSAL_ID, client_id: CLIENT_ID, proposal_number: null, title: "Unnumbered" } },
      }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no document number");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("does not demand a company slug, because the parent proposal names the number", async () => {
    // A client with a legacy-numbered proposal and no slug is a real state, and
    // an invoice against that proposal is numbered {PROPOSAL}-{NN} — the slug is
    // not what names it.
    const supabase = createSupabaseMock(
      routesFor({
        client: { data: { id: CLIENT_ID, name: "Wondfo USA", company_slug: null } },
        proposal: {
          data: { id: PROPOSAL_ID, client_id: CLIENT_ID, proposal_number: "RPS-2026-0007", title: "Legacy" },
        },
        invoiceInsert: { data: { id: INVOICE_ID, invoice_number: "RPS-2026-0007-01" } },
      }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result).toMatchObject({ ok: true, invoiceNumber: "RPS-2026-0007-01" });
  });

  it("passes the contract-value guard's own refusal through instead of flattening it", async () => {
    // guard_client_invoice_total() raises a check_violation, and friendlyError
    // maps every 23514 to "One of the values is not accepted" — which names
    // neither the total nor the contract the operator has to go and look at.
    const supabase = createSupabaseMock(
      routesFor({
        invoiceInsert: {
          error: {
            code: "23514",
            message: "invoices against this proposal would total 12000.00, above its contract value of 10000.00",
            hint: "Void or reprice an existing invoice, or raise the proposal value.",
          },
        },
      }),
    );
    signIn(supabase);

    const result = await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain("WONDFOUSA-2026-001");
    expect(result.error).toContain("above its contract value of 10000.00");
    expect(result.error).toContain("Void or reprice an existing invoice");
    expect(result.error).not.toContain("One of the values is not accepted");
  });

  it("records the proposal on the audit event rather than a hardcoded null", async () => {
    const supabase = createSupabaseMock(routesFor());
    signIn(supabase);

    await createManualInvoice(invoiceInput({ proposalId: PROPOSAL_ID }));

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0] as { summary?: string; after_state?: { proposal_id?: string | null } };
    expect(event.after_state?.proposal_id).toBe(PROPOSAL_ID);
    expect(event.summary).toContain("WONDFOUSA-2026-001");
  });
});

/* -------------------------------------------------------------------------- */
/* Line descriptions                                                           */
/* -------------------------------------------------------------------------- */

describe("createManualInvoice — line descriptions", () => {
  it("writes a multi-line description to the column with its break intact", async () => {
    const supabase = createSupabaseMock(routesFor());
    signIn(supabase);

    const result = await createManualInvoice(
      invoiceInput({
        lines: [
          {
            description: "Training\r\nBiosafety Training: Classroom and Practical.",
            quantity: 1,
            unitAmount: 1500,
            unit: "Session",
            qtyBasis: "flat",
            serviceDate: null,
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    const lines = findCall(supabase, "client_invoice_line_items", "insert")?.payload as Array<{ description: string }>;
    // Normalised (CRLF folded), not flattened.
    expect(lines[0].description).toBe("Training\nBiosafety Training: Classroom and Practical.");
  });
});
