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
import { createManualInvoice, deleteInvoice } from "./actions";

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
      // The delete path filters on `issued_at is null` as well as on the id, so
      // the stand-in has to record that filter or the test cannot prove the
      // compare-and-set is there.
      is(column: string, value: unknown) {
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

/* -------------------------------------------------------------------------- */
/* Deleting an invoice that was never issued                                  */
/* -------------------------------------------------------------------------- */

// lib/invoices/deletion.test.ts owns the rule itself, exhaustively. What is
// tested here is the three things only the action can get wrong: that it judges
// the row IT read rather than anything the caller sent, that it does not report
// success over a delete RLS filtered to nothing, and that the audit trail can
// still explain the hole the ledger is left with.

const DELETED_INVOICE = "66666666-6666-4666-8666-666666666666";

function invoiceRow(over: Record<string, unknown> = {}) {
  return {
    id: DELETED_INVOICE,
    client_id: CLIENT_ID,
    invoice_number: "WONDFOUSA-2026-INV-07",
    status: "draft",
    total: 1500,
    currency: "USD",
    issued_at: null,
    created_by: "user-1",
    ...over,
  };
}

function deleteRoutes(over: { invoice?: QueryResult; removal?: Route } = {}): Record<string, Route> {
  return {
    "client_invoices:select": over.invoice ?? { data: invoiceRow() },
    "company_clients:select": { data: { id: CLIENT_ID, name: "Wondfo USA" } },
    "client_invoices:delete": over.removal ?? { data: [{ id: DELETED_INVOICE }] },
  };
}

describe("deleteInvoice", () => {
  it("removes a never-issued draft and records what it destroyed", async () => {
    const supabase = createSupabaseMock(deleteRoutes());
    signIn(supabase);

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result).toEqual({ ok: true, invoiceNumber: "WONDFOUSA-2026-INV-07" });

    // The line items are NOT deleted by hand — the FK is `on delete cascade`,
    // and a hand-rolled delete would be a second failure mode for no gain.
    expect(supabase.calls.some((call) => call.table === "client_invoice_line_items")).toBe(false);

    // The audit event is the only thing that will still be able to answer "what
    // was WONDFOUSA-2026-INV-07" tomorrow, so it carries the whole row's story.
    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0];
    expect(event.event_type).toBe("data.delete");
    expect(event.event_category).toBe("billing");
    expect(event.severity).toBe("warn");
    expect(event.summary).toContain("WONDFOUSA-2026-INV-07");
    expect(event.before_state).toMatchObject({
      invoice_number: "WONDFOUSA-2026-INV-07",
      status: "draft",
      total: 1500,
      client_name: "Wondfo USA",
    });
  });

  it("filters the delete on issued_at being null, not just on the id", async () => {
    const supabase = createSupabaseMock(deleteRoutes());
    signIn(supabase);

    await deleteInvoice(DELETED_INVOICE);

    // Compare-and-set: somebody issuing the invoice between the read and the
    // delete must win that race, because the alternative is a document a client
    // already holds vanishing.
    const removal = findCall(supabase, "client_invoices", "delete");
    expect(removal?.filters).toEqual([
      ["id", DELETED_INVOICE],
      ["status", "draft"],
      ["issued_at", null],
    ]);
  });

  it("refuses an issued invoice, names it, and points at void instead", async () => {
    const supabase = createSupabaseMock(
      deleteRoutes({ invoice: { data: invoiceRow({ status: "issued", issued_at: "2026-08-14T16:20:00.000Z" }) } }),
    );
    signIn(supabase);

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "WONDFOUSA-2026-INV-07 has been issued, so a client holds a document bearing that number. " +
        "Void it instead: that withdraws the claim, keeps the number spent, and records why.",
    );
    // Refused before any write, and with nothing written to the audit trail
    // either: nothing happened, so nothing is recorded as having happened.
    expect(findCall(supabase, "client_invoices", "delete")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("judges the row it read, not the status a caller might wish for", async () => {
    // A draft raised by somebody else, asked for by a non-admin employee. The
    // RLS policy would filter this to zero rows; the action refuses it first so
    // the operator gets a sentence rather than a silent no-op.
    const supabase = createSupabaseMock(deleteRoutes({ invoice: { data: invoiceRow({ created_by: "user-2" }) } }));
    signIn(supabase, "employee");

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Only the employee who raised draft WONDFOUSA-2026-INV-07");
    expect(findCall(supabase, "client_invoices", "delete")).toBeUndefined();
  });

  it("does NOT report success when the delete matched zero rows", async () => {
    // PostgREST reports no error for a DELETE that RLS filtered to nothing, so
    // an unchecked delete would claim to have removed an invoice still sitting
    // on the ledger. This is the trap the whole `count` check exists for.
    const supabase = createSupabaseMock(deleteRoutes({ removal: { data: [] } }));
    signIn(supabase);

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("WONDFOUSA-2026-INV-07 was not deleted");
    // And nothing is recorded: an audit line saying the invoice was destroyed
    // would be a lie about a row that is still there.
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses an invoice it cannot read at all", async () => {
    const supabase = createSupabaseMock(deleteRoutes({ invoice: { data: null } }));
    signIn(supabase);

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not be found/i);
  });

  it("refuses a caller with no portal role before it reads anything", async () => {
    const supabase = createSupabaseMock(deleteRoutes());
    signIn(supabase, "client_user");

    const result = await deleteInvoice(DELETED_INVOICE);

    expect(result).toEqual({ ok: false, error: "You do not have permission to delete invoices." });
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses a malformed invoice reference rather than querying on it", async () => {
    const supabase = createSupabaseMock(deleteRoutes());
    signIn(supabase);

    const result = await deleteInvoice("not-a-uuid");

    expect(result).toEqual({ ok: false, error: "Malformed invoice reference." });
    expect(supabase.calls).toHaveLength(0);
  });
});
