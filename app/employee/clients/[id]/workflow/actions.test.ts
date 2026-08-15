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
  loadInvoiceLines,
  overrideClientStage,
  settleInvoice,
  updateDraftInvoiceLines,
  updateInvoiceDetails,
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
      neq(column: string, value: unknown) {
        record.filters.push([`neq:${column}`, value]);
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
    userEmail: "dana@example.com",
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
    requiredDocumentsKnown: true,
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

    const activity = findCall(supabase, "company_sales_activities", "insert");
    expect(activity?.payload).toMatchObject({ owner: "dana@example.com" });

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
      "client_invoices:select": { data: [] },
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
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:select": { data: [] },
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "deposit");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("no deposit");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("bills only the deposit when the contract carries one", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ form_data: generatorStateWithDeposit }) },
      "client_invoices:select": { data: [] },
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
      "client_invoices:select": { data: [] },
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
      "client_invoices:select": { data: [] },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0002" } },
      "client_invoice_line_items:insert": { error: { message: "boom" } },
      "client_invoices:delete": { data: [{ id: INVOICE_ID }] },
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(false);
    const rollback = findCall(supabase, "client_invoices", "delete");
    expect(rollback?.filters).toContainEqual(["id", INVOICE_ID]);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("records what was billed, so the duplicate guard has something to check", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:select": { data: [] },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0009" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(findCall(supabase, "client_invoices", "insert")?.payload).toMatchObject({ kind: "full" });
  });

  // The ceiling moved from the COUNT of invoices to the MONEY. A task-based
  // proposal bills 6-9+ times, so "one live invoice per kind" no longer
  // describes the work — but billing the same contract twice must still be
  // refused. These three pin the replacement.
  it("lets one proposal carry many invoices while they stay inside the contract", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ proposal_value: 3000, form_data: generatorStateWithDeposit }) },
      "client_invoices:select": {
        data: [
          { invoice_number: "WONDFOUSA-2026-001-01", total: 900 },
          { invoice_number: "WONDFOUSA-2026-001-02", total: 900 },
        ],
      },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "WONDFOUSA-2026-001-03" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    // 900 + 900 already billed, this one is 900: 2,700 of a 3,000 contract.
    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "deposit");

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "client_invoices", "insert")).toBeDefined();
  });

  it("refuses an invoice that would bill above the contract value", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ proposal_value: 3000 }) },
      "client_invoices:select": { data: [{ invoice_number: "WONDFOUSA-2026-001-01", total: 3000 }] },
    });
    signIn("employee", supabase);

    // The contract is fully billed; another 3,000 would be 200% of the deal.
    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("WONDFOUSA-2026-001-01");
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("refuses a deposit that would tip an almost-fully-billed proposal over", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ proposal_value: 3000, form_data: generatorStateWithDeposit }) },
      "client_invoices:select": { data: [{ invoice_number: "WONDFOUSA-2026-001-01", total: 2500 }] },
    });
    signIn("employee", supabase);

    // 2,500 billed + a 900 deposit is 3,400 against a 3,000 contract.
    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "deposit")).ok).toBe(false);
  });

  it("falls back to the accepted revision's own total when no value is recorded", async () => {
    // proposal_value is nullable, is written straight from the browser, and
    // recomputeProposalValue() leaves it alone when the total falls outside the
    // validator's range — so this is a normal state. Treating it as unbounded
    // would leave exactly the un-priced proposals with no cap while `full`
    // still bills the whole contract including the deposit.
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ proposal_value: null }) },
      "client_invoices:select": { data: [{ invoice_number: "WONDFOUSA-2026-001-01", total: 3000 }] },
    });
    signIn("employee", supabase);

    // The state prices at 3,000 and 3,000 is already billed, so this is refused
    // on the revision's own total even though the column says nothing.
    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(false);
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
  });

  it("still raises normally when nothing has been billed and no value is recorded", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow({ proposal_value: null }) },
      "client_invoices:select": { data: [] },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "WONDFOUSA-2026-001-01" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full")).ok).toBe(true);
  });

  // The guard reads only non-void invoices, so a mistake can be re-raised.
  it("scopes the duplicate check to this proposal and skips voided invoices", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:select": { data: [] },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0010" } },
      "client_invoice_line_items:insert": {},
    });
    signIn("employee", supabase);

    expect((await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full")).ok).toBe(true);

    const read = supabase.calls.find((c) => c.table === "client_invoices" && c.op === "select");
    expect(read?.filters).toContainEqual(["proposal_id", PROPOSAL_ID]);
    expect(read?.filters).toContainEqual(["neq:status", "void"]);
  });

  // DELETE on an invoice is admin-only, and PostgREST reports no error for a
  // delete RLS filtered to zero rows. Unchecked, the rollback silently left an
  // orphan holding a spent number while telling the operator it had failed.
  it("says so when the rollback could not remove the draft", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposalRow() },
      "client_invoices:select": { data: [] },
      "client_invoices:insert": { data: { id: INVOICE_ID, invoice_number: "RPS-INV-2026-0011" } },
      "client_invoice_line_items:insert": { error: { message: "boom" } },
      "client_invoices:delete": { data: [] },
    });
    signIn("employee", supabase);

    const result = await createInvoiceFromProposal(CLIENT_ID, PROPOSAL_ID, "full");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("RPS-INV-2026-0011");
    expect(result.error).toContain("void");
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

/* -------------------------------------------------------------------------- */
/* Editing a draft invoice                                                    */
/* -------------------------------------------------------------------------- */

const LINE_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_LINE_ID = "66666666-6666-4666-8666-666666666666";

interface StoredLine {
  id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  unit: string;
  qty_basis: string;
  service_date: string | null;
  line_total: number;
  sort_order: number;
}

/** The twelve-seat class the punch list is about. */
function seatLine(over: Partial<StoredLine> = {}): StoredLine {
  return {
    id: LINE_ID,
    description: "Confined Space Entry — classroom",
    quantity: 12,
    unit_amount: 105,
    unit: "Seat",
    qty_basis: "attendee",
    service_date: "2026-08-20",
    line_total: 1260,
    sort_order: 10,
    ...over,
  };
}

/**
 * A Supabase stand-in that behaves like the tables do: the line update writes
 * through to the rows the next select reads back, so the "recompute the total
 * from the STORED lines" step is exercised rather than assumed.
 */
function createInvoiceEditMock(options: {
  invoice?: Record<string, unknown>;
  lines?: StoredLine[];
  lineUpdateError?: unknown;
  lineUpdateMatchesNothing?: boolean;
  lineSelectError?: unknown;
  invoiceSelectError?: unknown;
}) {
  const invoice: Record<string, unknown> = {
    id: INVOICE_ID,
    client_id: CLIENT_ID,
    invoice_number: "RPS-INV-2026-0001",
    status: "draft",
    currency: "USD",
    subtotal: 1260,
    total: 1260,
    tax_amount: 0,
    ...options.invoice,
  };
  const lines = (options.lines ?? [seatLine()]).map((line) => ({ ...line }));

  return createSupabaseMock({
    "client_invoices:select": () =>
      options.invoiceSelectError ? { error: options.invoiceSelectError } : { data: { ...invoice } },
    "client_invoices:update": (query) => {
      // Compare-and-set: the header write names status='draft', and a document
      // that has since been issued must match nothing rather than be rewritten.
      const wants = query.filters.find(([column]) => column === "status")?.[1];
      if (wants !== undefined && wants !== invoice.status) return { data: [] };
      Object.assign(invoice, query.payload as Record<string, unknown>);
      return { data: [{ id: INVOICE_ID }] };
    },
    "client_invoice_line_items:select": () =>
      options.lineSelectError ? { error: options.lineSelectError } : { data: lines.map((line) => ({ ...line })) },
    "client_invoice_line_items:update": (query) => {
      if (options.lineUpdateError) return { error: options.lineUpdateError };
      if (options.lineUpdateMatchesNothing) return { data: [] };
      const id = query.filters.find(([column]) => column === "id")?.[1];
      const row = lines.find((line) => line.id === id);
      if (!row) return { data: [] };
      Object.assign(row, query.payload as Record<string, unknown>);
      return { data: [{ id }] };
    },
  });
}

describe("updateDraftInvoiceLines — RBAC", () => {
  it("refuses when signed out, and never queries", async () => {
    const supabase = createSupabaseMock({});
    signOut();

    expect(await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }])).toEqual({
      ok: false,
      error: "You must be signed in.",
    });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  /*
   * ADMIN ONLY, and the reason is the database rather than ceremony:
   * client_invoices carries a single UPDATE policy ("Admins can settle
   * invoices"). A non-admin let in here would edit the LINES — RLS allows that
   * while the parent is a draft — and then be refused the header write, leaving
   * an invoice whose total contradicts its own body. Refusing up front is the
   * only outcome that cannot half-happen.
   */
  it("refuses an in-whitelist non-admin, and never queries", async () => {
    for (const role of ["employee", "marketing", "internal_reviewer"]) {
      const supabase = createSupabaseMock({});
      signIn(role, supabase);

      const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

      expect(result.ok, role).toBe(false);
      expect(result.error).toContain("Admin role required");
      expect(supabase.calls, role).toHaveLength(0);
      expect(auditMock).not.toHaveBeenCalled();
    }
  });

  it("refuses a role outside the is_company_portal_employee() whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    expect((await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }])).ok).toBe(false);
    expect((await updateInvoiceDetails(INVOICE_ID, { jobName: "Tower 3" })).ok).toBe(false);
    expect((await loadInvoiceLines(INVOICE_ID)).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("rejects malformed references before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("admin", supabase);

    expect((await updateDraftInvoiceLines("not-a-uuid", [{ id: LINE_ID, quantity: 1 }])).ok).toBe(false);
    expect((await updateDraftInvoiceLines(INVOICE_ID, [{ id: "not-a-uuid", quantity: 1 }])).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("updateDraftInvoiceLines", () => {
  /*
   * THE CASE FROM THE MEETING. A class was quoted at 12 seats x $105 = $1,260.
   * Ten people attended, so the invoice has to say $1,050 — reached by editing
   * a quantity on the draft, NOT by voiding a numbered document and rebuilding
   * it from a proposal that still says twelve.
   */
  it("drops a 12-seat class to the 10 who attended, without rebuilding the document", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(result.ok).toBe(true);
    expect(result.subtotal).toBe(1050);
    expect(result.total).toBe(1050);

    // The line total is COMPUTED here — 10 x 105 — not taken from anything the
    // browser sent.
    const lineUpdate = findCall(supabase, "client_invoice_line_items", "update");
    expect(lineUpdate?.payload).toMatchObject({ quantity: 10, unit_amount: 105, line_total: 1050 });
    expect(lineUpdate?.filters).toContainEqual(["invoice_id", INVOICE_ID]);

    // The header is re-derived from the stored lines, so it cannot disagree
    // with the body.
    const header = findCall(supabase, "client_invoices", "update");
    expect(header?.payload).toMatchObject({ subtotal: 1050, total: 1050 });

    // No new invoice, no void, no new number: the document is the same document.
    expect(findCall(supabase, "client_invoices", "insert")).toBeUndefined();
    expect(findCall(supabase, "client_invoices", "delete")).toBeUndefined();
    expect(header?.payload).not.toHaveProperty("status");
    expect(header?.payload).not.toHaveProperty("invoice_number");
  });

  // A retainer must not double because somebody typed 2 into a box that does
  // not price anything.
  it("leaves a flat fee at its unit amount whatever the quantity says", async () => {
    const supabase = createInvoiceEditMock({
      invoice: { subtotal: 2500, total: 2500 },
      lines: [seatLine({ description: "Monthly retainer", quantity: 1, unit_amount: 2500, qty_basis: "flat", line_total: 2500 })],
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 4 }]);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "client_invoice_line_items", "update")?.payload).toMatchObject({
      quantity: 4,
      line_total: 2500,
    });
    expect(result.total).toBe(2500);
  });

  // Switching the basis is the honest way to make a fixed line scale.
  it("recomputes when the basis changes rather than the quantity", async () => {
    const supabase = createInvoiceEditMock({
      invoice: { subtotal: 105, total: 105 },
      lines: [seatLine({ quantity: 10, qty_basis: "flat", line_total: 105 })],
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, qtyBasis: "attendee" }]);

    expect(result.total).toBe(1050);
  });

  // THIS IS MONEY. The browser proposes quantities; the server decides amounts.
  it("ignores a total posted by the caller and recomputes it", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: LINE_ID, quantity: 10, lineTotal: 1, line_total: 1, total: 1 } as any,
    ]);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "client_invoice_line_items", "update")?.payload).toMatchObject({ line_total: 1050 });
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({ total: 1050 });
  });

  it("keeps total = subtotal + tax_amount across several lines", async () => {
    const supabase = createInvoiceEditMock({
      invoice: { subtotal: 1510, total: 1634.8, tax_amount: 124.8 },
      lines: [seatLine(), seatLine({ id: OTHER_LINE_ID, description: "Materials", quantity: 1, unit_amount: 250, qty_basis: "flat", line_total: 250, sort_order: 20 })],
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(result.subtotal).toBe(1300);
    expect(result.total).toBe(1424.8);
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({
      subtotal: 1300,
      total: 1424.8,
      tax_amount: 124.8,
    });
  });

  it("edits the unit, the service date and the description alongside the quantity", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    await updateDraftInvoiceLines(INVOICE_ID, [
      { id: LINE_ID, quantity: 10, unit: " Attendee ", serviceDate: "2026-09-02", description: " Confined Space " },
    ]);

    expect(findCall(supabase, "client_invoice_line_items", "update")?.payload).toMatchObject({
      unit: "Attendee",
      service_date: "2026-09-02",
      description: "Confined Space",
    });
  });

  /* --- the draft-only guard ---------------------------------------------- */

  // An issued invoice has been seen by the client. Changing what it says after
  // that is a credit note, not an edit — and the RLS policy on the line table
  // refuses the write anyway, so an action that tried would fail halfway.
  it("refuses to touch an invoice that is not a draft, and writes nothing", async () => {
    for (const status of ["issued", "paid", "void"]) {
      vi.clearAllMocks();
      const supabase = createInvoiceEditMock({ invoice: { status } });
      signIn("admin", supabase);

      const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

      expect(result.ok, status).toBe(false);
      expect(result.error, status).toContain("Only a draft invoice can be edited");
      expect(result.error, status).toContain(status);
      expect(findCall(supabase, "client_invoice_line_items", "update"), status).toBeUndefined();
      expect(findCall(supabase, "client_invoices", "update"), status).toBeUndefined();
      expect(auditMock).not.toHaveBeenCalled();
    }
  });

  // RLS refuses a line write once the parent leaves draft, and PostgREST reports
  // no error for an update that matched nothing.
  it("treats a zero-row line update as a concurrent issue, not a success", async () => {
    const supabase = createInvoiceEditMock({ lineUpdateMatchesNothing: true });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("changed while you were looking at it");
  });

  /* --- refusals ----------------------------------------------------------- */

  it("refuses a line that belongs to a different invoice", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: OTHER_LINE_ID, quantity: 10 }]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not on this invoice");
    expect(findCall(supabase, "client_invoice_line_items", "update")).toBeUndefined();
    expect(findCall(supabase, "client_invoices", "update")).toBeUndefined();
  });

  it("refuses an empty batch and one that names the same line twice", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    expect((await updateDraftInvoiceLines(INVOICE_ID, [])).ok).toBe(false);
    const duplicated = await updateDraftInvoiceLines(INVOICE_ID, [
      { id: LINE_ID, quantity: 10 },
      { id: LINE_ID, quantity: 2 },
    ]);
    expect(duplicated.ok).toBe(false);
    expect(duplicated.error).toContain("sent twice");
    expect(supabase.calls).toHaveLength(0);
  });

  // Validate the whole batch before writing any of it: a half-applied batch
  // leaves an invoice nobody meant to raise.
  it("refuses the whole batch when one line is invalid, and writes nothing", async () => {
    const supabase = createInvoiceEditMock({
      lines: [seatLine(), seatLine({ id: OTHER_LINE_ID, sort_order: 20 })],
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [
      { id: LINE_ID, quantity: 10 },
      { id: OTHER_LINE_ID, quantity: 0 },
    ]);

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.[OTHER_LINE_ID]).toContain("more than zero");
    expect(findCall(supabase, "client_invoice_line_items", "update")).toBeUndefined();
    expect(findCall(supabase, "client_invoices", "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("reports a database that is behind the code as something an operator can fix", async () => {
    const supabase = createInvoiceEditMock({
      invoiceSelectError: { code: "42703", message: 'column client_invoices.tax_amount does not exist' },
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain("migrations");
  });

  /* --- audit and revalidation --------------------------------------------- */

  it("audits the reprice as billing, with the before and after totals", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0];
    expect(event.event_category).toBe("billing");
    expect(event.resource_type).toBe("client_invoice");
    expect(event.actor_role).toBe("admin");
    expect(event.summary).toContain("RPS-INV-2026-0001");
    expect(event.before_state).toMatchObject({ total: 1260 });
    expect(event.after_state).toMatchObject({ total: 1050 });
  });

  // A financial record that reports having been touched when nobody changed
  // anything is a false trail for whoever reads it later — and the updated_at
  // trigger fires on any UPDATE, no-op or not.
  it("writes nothing at all for a save that changed nothing", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 12 }]);

    expect(result.ok).toBe(true);
    expect(result.total).toBe(1260);
    expect(findCall(supabase, "client_invoice_line_items", "update")).toBeUndefined();
    expect(findCall(supabase, "client_invoices", "update")).toBeUndefined();
    expect(auditMock).not.toHaveBeenCalled();
  });

  // …but a header that has drifted from its own lines is still repaired, which
  // is the case that guard must not swallow.
  it("repairs a header whose total no longer matches its lines", async () => {
    const supabase = createInvoiceEditMock({ invoice: { subtotal: 999, total: 999 } });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 12 }]);

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({ subtotal: 1260, total: 1260 });
  });

  it("revalidates every surface that renders an invoice total", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    for (const path of [
      `/employee/clients/${CLIENT_ID}/workflow`,
      `/employee/clients/${CLIENT_ID}`,
      "/employee/finance",
    ]) {
      expect(revalidateMock).toHaveBeenCalledWith(path);
    }
  });

  // buildDraftInvoice folds a proposal-level discount into the total and
  // explains it only in the notes, because there is no discount column. Once
  // the lines are the source of truth that adjustment is gone — say so rather
  // than let an operator find out on the client's copy.
  it("warns when re-totalling drops an adjustment that was not a line", async () => {
    const supabase = createInvoiceEditMock({
      invoice: { subtotal: 1260, total: 1134, tax_amount: 0 },
    });
    signIn("admin", supabase);

    const result = await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }]);

    expect(result.ok).toBe(true);
    expect(result.notice).toContain("126.00");
    expect(result.notice).toContain("no longer applied");
  });

  it("says nothing extra when the total was simply the line sum", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    expect((await updateDraftInvoiceLines(INVOICE_ID, [{ id: LINE_ID, quantity: 10 }])).notice).toBeUndefined();
  });
});

describe("updateInvoiceDetails", () => {
  it("writes the document fields and re-derives the total from the lines plus tax", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateInvoiceDetails(INVOICE_ID, {
      consultantName: "  Dana Reyes  ",
      jobName: "Tower 3 Fit-Out",
      paymentTerms: "Net 30 from invoice date",
      clientAgreementRef: "PO-88421",
      preparedBy: "Dana Reyes",
      taxAmount: 103.95,
    });

    expect(result.ok).toBe(true);
    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({
      consultant_name: "Dana Reyes",
      job_name: "Tower 3 Fit-Out",
      payment_terms: "Net 30 from invoice date",
      // The CLIENT's number, never ours.
      client_agreement_ref: "PO-88421",
      prepared_by: "Dana Reyes",
      tax_amount: 103.95,
      subtotal: 1260,
      total: 1363.95,
    });
    expect(auditMock.mock.calls[0][0].event_category).toBe("billing");
  });

  // Nullable columns so a renderer can tell "not recorded" from "recorded blank".
  it("clears an emptied field to null rather than storing an empty string", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    await updateInvoiceDetails(INVOICE_ID, { jobName: "   ", consultantName: null });

    expect(findCall(supabase, "client_invoices", "update")?.payload).toMatchObject({
      job_name: null,
      consultant_name: null,
    });
  });

  it("leaves a field alone when the edit does not mention it", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    await updateInvoiceDetails(INVOICE_ID, { jobName: "Tower 3" });

    const payload = findCall(supabase, "client_invoices", "update")?.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("consultant_name");
    expect(payload).not.toHaveProperty("client_agreement_ref");
  });

  it("refuses a non-admin, a non-draft invoice, and a negative tax", async () => {
    const denied = createSupabaseMock({});
    signIn("employee", denied);
    expect((await updateInvoiceDetails(INVOICE_ID, { jobName: "Tower 3" })).ok).toBe(false);
    expect(denied.calls).toHaveLength(0);

    const issued = createInvoiceEditMock({ invoice: { status: "issued" } });
    signIn("admin", issued);
    const afterIssue = await updateInvoiceDetails(INVOICE_ID, { jobName: "Tower 3" });
    expect(afterIssue.ok).toBe(false);
    expect(afterIssue.error).toContain("Only a draft invoice can be edited");
    expect(findCall(issued, "client_invoices", "update")).toBeUndefined();

    const negative = createInvoiceEditMock({});
    signIn("admin", negative);
    const refused = await updateInvoiceDetails(INVOICE_ID, { taxAmount: -1 });
    expect(refused.ok).toBe(false);
    expect(refused.fieldErrors?.taxAmount).toBeTruthy();
    expect(findCall(negative, "client_invoices", "update")).toBeUndefined();
  });

  it("refuses a value past the column CHECK rather than letting it fail as a 23514", async () => {
    const supabase = createInvoiceEditMock({});
    signIn("admin", supabase);

    const result = await updateInvoiceDetails(INVOICE_ID, { clientAgreementRef: "P".repeat(121) });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("120 characters");
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("loadInvoiceLines", () => {
  it("returns the lines and the header figures for an employee who may read them", async () => {
    const supabase = createInvoiceEditMock({ invoice: { tax_amount: 60 } });
    signIn("marketing", supabase);

    const result = await loadInvoiceLines(INVOICE_ID);

    expect(result.ok).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines?.[0]).toMatchObject({ quantity: 12, unitAmount: 105, unit: "Seat", qtyBasis: "attendee" });
    expect(result.taxAmount).toBe(60);
    // Reading is not editing: this role cannot write client_invoices.
    expect(result.editable).toBe(false);
  });

  it("reports a draft as editable only for an admin", async () => {
    const draft = createInvoiceEditMock({});
    signIn("admin", draft);
    expect((await loadInvoiceLines(INVOICE_ID)).editable).toBe(true);

    const issued = createInvoiceEditMock({ invoice: { status: "issued" } });
    signIn("admin", issued);
    expect((await loadInvoiceLines(INVOICE_ID)).editable).toBe(false);
  });

  // A row written before the migration reads as flat, which is the basis that
  // cannot re-price anything on its own.
  it("reads a pre-migration line as a flat fee rather than guessing", async () => {
    const supabase = createInvoiceEditMock({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: [{ id: LINE_ID, description: "Legacy line", quantity: 3, unit_amount: 100, line_total: 300, sort_order: 10 } as any],
    });
    signIn("admin", supabase);

    const result = await loadInvoiceLines(INVOICE_ID);

    expect(result.lines?.[0]).toMatchObject({ qtyBasis: "flat", unit: "", serviceDate: null });
  });

  // PostgREST hands numeric columns back as strings often enough that reading
  // them as numbers without coercion is a silent NaN in a money total.
  it("coerces numeric columns that arrive as strings", async () => {
    const supabase = createInvoiceEditMock({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: [seatLine({ quantity: "12.00", unit_amount: "105.00", line_total: "1260.00" } as any)],
    });
    signIn("admin", supabase);

    const result = await loadInvoiceLines(INVOICE_ID);

    expect(result.lines?.[0].quantity).toBe(12);
    expect(result.lines?.[0].unitAmount).toBe(105);
  });
});
