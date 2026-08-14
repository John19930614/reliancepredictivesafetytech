import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/pipeline/access", () => ({ getPipelineAccess: vi.fn() }));
vi.mock("@/lib/pipeline/facts", () => ({ loadClientWorkflowFacts: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@/lib/audit/events";
import { getPipelineAccess } from "@/lib/pipeline/access";
import { loadClientWorkflowFacts } from "@/lib/pipeline/facts";
import { resolvePipelineRoleFlags } from "@/lib/pipeline/policy";
import type { ClientWorkflowFacts } from "@/lib/pipeline/gates";
import {
  advanceClientStage,
  createInvoiceFromProposal,
  overrideClientStage,
  settleInvoice,
} from "./actions";

const accessMock = vi.mocked(getPipelineAccess);
const factsMock = vi.mocked(loadClientWorkflowFacts);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const PROPOSAL_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_CLIENT_ID = "44444444-4444-4444-8444-444444444444";

/* -------------------------------------------------------------------------- */
/* Chainable Supabase stand-in, following app/employee/files/actions.test.ts   */
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
      update(payload: unknown) {
        record.op = "update";
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
      order: () => api,
      limit: () => api,
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

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown) {
  const flags = resolvePipelineRoleFlags(role, role !== null);
  accessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role,
    ...flags,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function signOut() {
  accessMock.mockResolvedValue({
    supabase: null,
    userId: null,
    role: null,
    canRead: false,
    canAdvance: false,
    canOverride: false,
    canDraftInvoice: false,
    canSettleInvoice: false,
    isAdmin: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function facts(over: Partial<ClientWorkflowFacts> = {}): ClientWorkflowFacts {
  return {
    stage: "Lead",
    owner: "Dana Reyes",
    checklist: [],
    proposals: [],
    invoices: [],
    requiredDocuments: [],
    hasPrimaryContact: false,
    ...over,
  };
}

/** Makes loadClientWorkflowFacts return the given facts. */
function withFacts(value: ClientWorkflowFacts) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  factsMock.mockResolvedValue({ facts: value, invoices: [], invoicesUnavailable: false } as any);
}

function clientRow(over: Record<string, unknown> = {}) {
  return { id: CLIENT_ID, name: "Ironline Construction", lifecycle_stage: "Lead", owner: "Dana Reyes", ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* RBAC                                                                       */
/* -------------------------------------------------------------------------- */

describe("workflow action RBAC", () => {
  it("refuses every action when signed out, and never queries", async () => {
    const supabase = createSupabaseMock({});
    signOut();

    expect(await advanceClientStage(CLIENT_ID)).toEqual({ ok: false, error: "You must be signed in." });
    signOut();
    expect((await overrideClientStage(CLIENT_ID, "a good long reason")).ok).toBe(false);
    signOut();
    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full")).ok).toBe(false);
    signOut();
    expect((await settleInvoice(INVOICE_ID, "issued")).ok).toBe(false);

    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  // Overriding a gate and settling an invoice are the two admin-only acts.
  it("refuses override to a non-admin portal role and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await overrideClientStage(CLIENT_ID, "client signed on paper, scan Monday");

    expect(result).toEqual({
      ok: false,
      error: "Admin role required to move a client past an unfinished step.",
    });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses invoice settlement to a non-admin portal role and never queries", async () => {
    const supabase = createSupabaseMock({});
    signIn("internal_reviewer", supabase);

    const result = await settleInvoice(INVOICE_ID, "issued");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Admin role required");
    expect(supabase.calls).toHaveLength(0);
  });

  it("lets an in-whitelist non-admin advance and draft an invoice", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow() },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("marketing", supabase);
    withFacts(facts({ stage: "Lead", owner: "Dana Reyes" }));

    expect(await advanceClientStage(CLIENT_ID)).toEqual({ ok: true });
    expect(auditMock.mock.calls[0][0].actor_role).toBe("marketing");
  });

  it("refuses every action to a role outside the is_company_portal_employee() whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    expect((await advanceClientStage(CLIENT_ID)).ok).toBe(false);
    expect((await overrideClientStage(CLIENT_ID, "a good long reason")).ok).toBe(false);
    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full")).ok).toBe(false);
    expect((await settleInvoice(INVOICE_ID, "issued")).ok).toBe(false);

    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed client reference before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("admin", supabase);

    expect(await advanceClientStage("not-a-uuid")).toEqual({ ok: false, error: "Malformed client reference." });
    expect(supabase.calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* advanceClientStage                                                         */
/* -------------------------------------------------------------------------- */

describe("advanceClientStage", () => {
  it("moves the client on, stamps the clock, and records the transition", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Signed / Won" }) },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("admin", supabase);
    withFacts(facts({ stage: "Signed / Won", proposals: [{ status: "accepted" }] }));

    const result = await advanceClientStage(CLIENT_ID);

    expect(result).toEqual({ ok: true });

    const update = findCall(supabase, "company_clients", "update");
    expect(update?.payload).toMatchObject({ lifecycle_stage: "Invoicing" });
    expect((update?.payload as Record<string, unknown>).stage_changed_at).toBeTruthy();

    // Compare-and-set on the stage we read, so a concurrent move is refused
    // rather than silently overwritten.
    expect(update?.filters).toContainEqual(["lifecycle_stage", "Signed / Won"]);

    const transition = findCall(supabase, "client_stage_transitions", "insert");
    expect(transition?.payload).toMatchObject({
      from_stage: "Signed / Won",
      to_stage: "Invoicing",
      was_override: false,
      override_reason: null,
      blocked_reasons: [],
      changed_by: "user-1",
    });
  });

  it("audits the move at info severity and revalidates every surface", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow() },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("admin", supabase);
    withFacts(facts());

    await advanceClientStage(CLIENT_ID);

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].severity).toBe("info");
    for (const path of [
      `/employee/clients/${CLIENT_ID}/workflow`,
      `/employee/clients/${CLIENT_ID}`,
      "/employee/sales",
      "/employee/active-companies",
      "/m/leads",
    ]) {
      expect(revalidateMock).toHaveBeenCalledWith(path);
    }
  });

  // The button was rendered at some earlier moment; a requirement can be
  // un-ticked between render and click, so the gate is re-run against a fresh
  // read rather than trusted from the page.
  it("refuses when the step is unfinished, naming what is outstanding, and writes nothing", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Invoicing" }) },
    });
    signIn("admin", supabase);
    withFacts(facts({ stage: "Invoicing", invoices: [{ status: "draft" }] }));

    const result = await advanceClientStage(CLIENT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Raise an invoice and issue it");
    expect(findCall(supabase, "company_clients", "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses at the last stage of the journey", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Renewal / Expansion" }) },
    });
    signIn("admin", supabase);

    const result = await advanceClientStage(CLIENT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("last stage");
    expect(findCall(supabase, "company_clients", "update")).toBeUndefined();
  });

  it("refuses a client parked on a stage that is not in the journey", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Closed Won" }) },
    });
    signIn("admin", supabase);

    const result = await advanceClientStage(CLIENT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Closed Won");
  });

  it("reports a missing client rather than claiming success", async () => {
    const supabase = createSupabaseMock({ "company_clients:select": { data: null } });
    signIn("admin", supabase);

    expect((await advanceClientStage(CLIENT_ID)).ok).toBe(false);
  });

  // PostgREST reports no error for an UPDATE that matched zero rows.
  it("treats a zero-row update as a concurrent move, not a success", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow() },
      "company_clients:update": { data: [] },
    });
    signIn("admin", supabase);
    withFacts(facts());

    const result = await advanceClientStage(CLIENT_ID);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("changed while you were looking at it");
    expect(auditMock).not.toHaveBeenCalled();
  });

  // The stage has already changed by then; failing the whole action would tell
  // the operator the move did not happen when it did.
  it("still succeeds when the history insert fails", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow() },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": { error: { message: "relation missing" } },
      "company_sales_activities:insert": {},
    });
    signIn("admin", supabase);
    withFacts(facts());

    expect(await advanceClientStage(CLIENT_ID)).toEqual({ ok: true });
  });
});

/* -------------------------------------------------------------------------- */
/* overrideClientStage                                                        */
/* -------------------------------------------------------------------------- */

describe("overrideClientStage", () => {
  it("moves past an unfinished step and freezes the skipped requirements", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Invoicing" }) },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("super_admin", supabase);
    withFacts(facts({ stage: "Invoicing", invoices: [] }));

    const result = await overrideClientStage(CLIENT_ID, "Client pays on their own PO cycle, billing follows in Q4.");

    expect(result).toEqual({ ok: true });

    const transition = findCall(supabase, "client_stage_transitions", "insert");
    expect(transition?.payload).toMatchObject({
      to_stage: "Onboarding",
      was_override: true,
      override_reason: "Client pays on their own PO cycle, billing follows in Q4.",
    });
    // The failing requirements are stored so the row still means something
    // after somebody later ticks the boxes.
    expect((transition?.payload as Record<string, unknown>).blocked_reasons).toEqual([
      { code: "invoice_issued", label: "Raise an invoice and issue it" },
    ]);
  });

  it("audits a forced move at warn severity, not info", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Invoicing" }) },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("super_admin", supabase);
    withFacts(facts({ stage: "Invoicing", invoices: [] }));

    await overrideClientStage(CLIENT_ID, "Client pays on their own PO cycle, billing follows.");

    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
    expect(auditMock.mock.calls[0][0].summary).toContain("Forced");
  });

  it("refuses a reason too short to be worth reading, before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("super_admin", supabase);

    const result = await overrideClientStage(CLIENT_ID, "ok");

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.reason).toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("refuses an empty reason", async () => {
    const supabase = createSupabaseMock({});
    signIn("super_admin", supabase);

    expect((await overrideClientStage(CLIENT_ID, "   ")).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  // Recording this as a forced move would put a false entry in the history of
  // who skipped what.
  it("records an unblocked move as an ordinary advance, not an override", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: clientRow({ lifecycle_stage: "Invoicing" }) },
      "company_clients:update": { data: [{ id: CLIENT_ID }] },
      "client_stage_transitions:insert": {},
      "company_sales_activities:insert": {},
    });
    signIn("super_admin", supabase);
    withFacts(facts({ stage: "Invoicing", invoices: [{ status: "issued" }] }));

    await overrideClientStage(CLIENT_ID, "Belt and braces, everything is actually done here.");

    const transition = findCall(supabase, "client_stage_transitions", "insert");
    expect(transition?.payload).toMatchObject({ was_override: false, override_reason: null });
    expect(auditMock.mock.calls[0][0].severity).toBe("info");
  });
});

/* -------------------------------------------------------------------------- */
/* createInvoiceFromProposal                                                  */
/* -------------------------------------------------------------------------- */

const generatorState = {
  v: 1,
  fields: {},
  phases: [],
  services: [{ type: "service", key: "audit", name: "Site Safety Audit", unit: "Session", qty: 2, price: 1500 }],
};

/** The same contract, with a 30% deposit in its payment terms. */
const generatorStateWithDeposit = { ...generatorState, fields: { depositPct: 30 } };

function proposalRow(over: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    title: "SafePredict Rollout",
    proposal_number: "IRO-01",
    client_id: CLIENT_ID,
    status: "accepted",
    form_data: generatorState,
    accepted_revision_id: null,
    ...over,
  };
}

describe("createInvoiceFromProposal", () => {
  it("raises a draft invoice with lines, and audits it as billing", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0001" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(true);
    expect(result.invoiceNumber).toBe("RPS-INV-2026-0001");

    const insert = findCall(supabase, "client_invoices", "insert");
    // Raised as a draft: raising and issuing are two acts, and only the second
    // asks anyone for money.
    expect(insert?.payload).toMatchObject({ client_id: CLIENT_ID, proposal_id: PROPOSAL_ID, status: "draft" });
    expect(auditMock.mock.calls[0][0].event_category).toBe("billing");

    const lines = findCall(supabase, "client_invoice_line_items", "insert");
    expect(Array.isArray(lines?.payload)).toBe(true);
  });

  it("refuses a proposal the client has not accepted", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: proposalRow({ status: "sent" }) } });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result).toEqual({ ok: false, error: "Only an accepted proposal can be invoiced." });
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  // Billing one client against another client's contract would be a serious
  // data leak as well as a wrong invoice.
  it("refuses a proposal belonging to a different client", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ client_id: OTHER_CLIENT_ID }) },
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result).toEqual({ ok: false, error: "That proposal belongs to a different client." });
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("refuses an unknown invoice kind before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "guess")).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("tells the operator to raise a full invoice when there is no deposit", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: proposalRow() } });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "deposit");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no deposit");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("bills only the deposit when the contract carries one", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ form_data: generatorStateWithDeposit }) },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0003" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "deposit");

    expect(result.ok).toBe(true);
    // 30% of a 3000 contract, not the whole contract.
    expect(findCall(supabase, "client_invoices", "insert")?.payload).toMatchObject({ total: 900 });
  });

  // The working copy may have moved on since the client accepted; the invoice
  // has to bill what they actually agreed to.
  it("prices the accepted revision rather than the proposal's working copy", async () => {
    const REVISION_ID = "55555555-5555-4555-8555-555555555555";
    const supabase = createSupabaseMock({
      "client_proposals:select": {
        data: proposalRow({
          accepted_revision_id: REVISION_ID,
          // The working copy has been repriced upward since acceptance.
          form_data: {
            ...generatorState,
            services: [{ type: "service", key: "audit", name: "Site Safety Audit", unit: "Session", qty: 9, price: 1500 }],
          },
        }),
      },
      "client_proposal_revisions:select": { data: { form_data: generatorState } },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0004" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(findCall(supabase, "client_invoices", "insert")?.payload).toMatchObject({ total: 3000 });
  });

  it("refuses a proposal with no saved content", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ form_data: null }) },
    });
    signIn("employee", supabase);

    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full")).ok).toBe(false);
  });

  // An invoice with no lines is worse than no invoice: it carries a spent
  // number and a total nothing explains.
  it("rolls the invoice back when the line write fails", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0002" } },
      "client_invoice_line_items:insert": { error: { message: "boom" } },
      "client_invoices:delete": {},
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(false);
    const rollback = findCall(supabase, "client_invoices", "delete");
    expect(rollback?.filters).toContainEqual(["id", INVOICE_ID]);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* settleInvoice                                                              */
/* -------------------------------------------------------------------------- */

function invoiceRow(over: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    client_id: CLIENT_ID,
    invoice_number: "RPS-INV-2026-0001",
    status: "draft",
    total: 3000,
    issue_date: "2026-08-14",
    ...over,
  };
}

describe("settleInvoice", () => {
  it("issues a draft invoice and stamps who issued it", async () => {
    const supabase = createSupabaseMock({
      "client_invoices:select": { data: invoiceRow() },
      "client_invoices:update": { data: [{ id: INVOICE_ID }] },
    });
    signIn("admin", supabase);

    expect(await settleInvoice(INVOICE_ID, "issued")).toEqual({ ok: true });

    const update = findCall(supabase, "client_invoices", "update");
    expect(update?.payload).toMatchObject({ status: "issued", issued_by: "user-1" });
    expect(update?.filters).toContainEqual(["status", "draft"]);
  });

  // The column CHECK requires an issue_date on an issued invoice; without this
  // the write would fail at the database with a 23514.
  it("supplies an issue date when the draft had none", async () => {
    const supabase = createSupabaseMock({
      "client_invoices:select": { data: invoiceRow({ issue_date: null }) },
      "client_invoices:update": { data: [{ id: INVOICE_ID }] },
    });
    signIn("admin", supabase);

    await settleInvoice(INVOICE_ID, "issued");

    expect((findCall(supabase, "client_invoices", "update")?.payload as Record<string, unknown>).issue_date).toBeTruthy();
  });

  it("marks an issued invoice paid", async () => {
    const supabase = createSupabaseMock({
      "client_invoices:select": { data: invoiceRow({ status: "issued" }) },
      "client_invoices:update": { data: [{ id: INVOICE_ID }] },
    });
    signIn("admin", supabase);

    expect(await settleInvoice(INVOICE_ID, "paid")).toEqual({ ok: true });
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({ status: "paid" });
  });

  it("refuses to walk a paid invoice backwards", async () => {
    const supabase = createSupabaseMock({ "client_invoices:select": { data: invoiceRow({ status: "paid" }) } });
    signIn("admin", supabase);

    const result = await settleInvoice(INVOICE_ID, "issued");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("cannot be marked");
    expect(findCall(supabase, "client_invoices", "update")).toBeUndefined();
  });

  it("refuses to re-void a voided invoice", async () => {
    const supabase = createSupabaseMock({ "client_invoices:select": { data: invoiceRow({ status: "void" }) } });
    signIn("admin", supabase);

    expect((await settleInvoice(INVOICE_ID, "void", "duplicate")).ok).toBe(false);
  });

  it("requires a reason to void, and records it at warn severity", async () => {
    const noReason = createSupabaseMock({ "client_invoices:select": { data: invoiceRow() } });
    signIn("admin", noReason);
    const refused = await settleInvoice(INVOICE_ID, "void", "   ");
    expect(refused.ok).toBe(false);
    expect(refused.fieldErrors?.reason).toBeTruthy();

    const supabase = createSupabaseMock({
      "client_invoices:select": { data: invoiceRow() },
      "client_invoices:update": { data: [{ id: INVOICE_ID }] },
    });
    signIn("admin", supabase);

    expect(await settleInvoice(INVOICE_ID, "void", "Raised against the wrong contract.")).toEqual({ ok: true });
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({
      status: "void",
      void_reason: "Raised against the wrong contract.",
    });
    expect(auditMock.mock.calls[0][0].severity).toBe("warn");
  });

  it("refuses an unrecognised settlement", async () => {
    const supabase = createSupabaseMock({});
    signIn("admin", supabase);

    expect((await settleInvoice(INVOICE_ID, "cancelled")).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("treats a zero-row update as a concurrent change", async () => {
    const supabase = createSupabaseMock({
      "client_invoices:select": { data: invoiceRow() },
      "client_invoices:update": { data: [] },
    });
    signIn("admin", supabase);

    const result = await settleInvoice(INVOICE_ID, "issued");

    expect(result.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
