import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/proposals/access", () => ({ getProposalAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});

import { revalidatePath } from "next/cache";
import { getProposalAccess } from "@/lib/proposals/access";
import { recordAuditEvent } from "@/lib/audit/events";
import { resolveProposalRoleFlags } from "@/lib/proposals/policy";
import { isGeneratorState, type GeneratorState } from "@/lib/proposals/generator-state";
import {
  createProposalFromTemplate,
  createProposalFromTransactionType,
  createTemplateFromProposal,
  deleteProposalTemplate,
  listProposalTemplates,
  setProposalTemplateArchived,
  updateProposalTemplate,
} from "./actions";

const getAccessMock = vi.mocked(getProposalAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const TEMPLATE_ID = "33333333-3333-4333-8333-333333333333";
const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const NEW_PROPOSAL_ID = "44444444-4444-4444-8444-444444444444";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

/** A body still carrying the captured client's identity, as a legacy row would. */
const leakyBody: GeneratorState = {
  v: 1,
  fields: {
    clientCompany: "Acme Construction",
    clientContact: "Dana Reyes",
    clientEmail: "dana@acme.example",
    clientAddress: "500 Acme Way",
    proposalNo: "RPST-2026-001",
    packageSelect: "growth",
    annualPrice: 24000,
  },
  phases: [{ type: "phase", key: "discovery", name: "Discovery", qty: 1, price: 3500, desc: "", unit: "" }],
  services: [],
};

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase PostgREST client, keyed by
// "<table>:<op>". Mirrors the harness in ../actions.test.ts.
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  selected?: string;
  filters: Array<[string, unknown]>;
}

type Route = { data?: unknown; error?: unknown } | ((query: QueryRecord) => { data?: unknown; error?: unknown });

function createSupabaseMock(routes: Record<string, Route>) {
  const calls: QueryRecord[] = [];

  function resolve(record: QueryRecord) {
    const route = routes[`${record.table}:${record.op}`];
    const result = typeof route === "function" ? route(record) : route;
    return { data: result?.data ?? null, error: result?.error ?? null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select(columns?: string) {
        record.selected = columns;
        return api;
      },
      insert(payload: Record<string, unknown>) {
        record.op = "insert";
        record.payload = payload;
        return api;
      },
      update(payload: Record<string, unknown>) {
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
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(resolve(record)).then(onFulfilled, onRejected),
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

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown) {
  const flags = resolveProposalRoleFlags(role, role !== null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAccessMock.mockResolvedValue({ supabase, userId: "user-1", role, ...flags } as any);
}

function findCall(supabase: ReturnType<typeof createSupabaseMock>, table: string, op: QueryRecord["op"]) {
  return supabase.calls.find((call) => call.table === table && call.op === op);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// RBAC — the permission matrix CLAUDE.md requires for a new module
// ---------------------------------------------------------------------------
describe("template action RBAC", () => {
  it("denies every write to a signed-out caller and never touches the database", async () => {
    const supabase = createSupabaseMock({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAccessMock.mockResolvedValue({
      supabase,
      userId: null,
      role: null,
      canRead: false,
      canManage: false,
      isAdmin: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect((await createTemplateFromProposal({ proposalId: PROPOSAL_ID, name: "x" })).ok).toBe(false);
    expect((await updateProposalTemplate(TEMPLATE_ID, { name: "x" })).ok).toBe(false);
    expect((await setProposalTemplateArchived(TEMPLATE_ID, true)).ok).toBe(false);
    expect((await deleteProposalTemplate(TEMPLATE_ID)).ok).toBe(false);
    expect((await createProposalFromTemplate({ templateId: TEMPLATE_ID, title: "x" })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("denies deleteProposalTemplate to a non-admin portal role", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await deleteProposalTemplate(TEMPLATE_ID);

    expect(result).toEqual({ ok: false, error: "Admin role required to delete templates." });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("allows deleteProposalTemplate for an admin role and audits it", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": { data: { name: "Pilot", description: null, is_archived: false } },
      "client_proposal_templates:delete": { data: [{ id: TEMPLATE_ID }] },
    });
    signIn("company_admin", supabase);

    const result = await deleteProposalTemplate(TEMPLATE_ID);

    expect(result).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].resource_type).toBe("client_proposal_template");
    expect(auditMock.mock.calls[0][0].actor_role).toBe("company_admin");
    expect(revalidateMock).toHaveBeenCalledWith("/employee/proposals/templates");
  });

  it("lets an in-whitelist non-admin role archive a template", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": { data: { name: "Pilot", is_archived: false } },
      "client_proposal_templates:update": { data: [{ id: TEMPLATE_ID }] },
    });
    signIn("internal_reviewer", supabase);

    expect(await setProposalTemplateArchived(TEMPLATE_ID, true)).toEqual({ ok: true });
    expect(findCall(supabase, "client_proposal_templates", "update")?.payload).toEqual({ is_archived: true });
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  it("denies reads to a role outside the portal whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn(null, supabase);

    const result = await listProposalTemplates();

    expect(result.ok).toBe(false);
    expect(result.templates).toEqual([]);
    expect(supabase.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Zero-row writes
// ---------------------------------------------------------------------------
describe("zero-row writes are failures, not silent successes", () => {
  it("reports an update that RLS filtered out", async () => {
    const supabase = createSupabaseMock({ "client_proposal_templates:update": { data: [] } });
    signIn("employee", supabase);

    const result = await updateProposalTemplate(TEMPLATE_ID, { name: "Renamed" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
    // The UPDATE asked for the affected ids back.
    expect(findCall(supabase, "client_proposal_templates", "update")?.selected).toBe("id");
  });

  it("reports a delete that matched nothing and writes no audit event", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": { data: null },
      "client_proposal_templates:delete": { data: [] },
    });
    signIn("admin", supabase);

    expect((await deleteProposalTemplate(TEMPLATE_ID)).ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input validation — a Server Action is a public POST endpoint
// ---------------------------------------------------------------------------
describe("input validation", () => {
  it("rejects a blank name before any query", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await createTemplateFromProposal({ proposalId: PROPOSAL_ID, name: "   " });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.name).toBe("Give the template a name.");
    expect(supabase.calls).toHaveLength(0);
  });

  it("rejects an over-length name", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await updateProposalTemplate(TEMPLATE_ID, { name: "x".repeat(121) })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });

  it("rejects a malformed template id before it reaches PostgREST", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await updateProposalTemplate("not-a-uuid", { name: "x" })).ok).toBe(false);
    expect((await setProposalTemplateArchived("not-a-uuid", true)).ok).toBe(false);
    expect((await createProposalFromTemplate({ templateId: "not-a-uuid", title: "x" })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-client leakage — the risk this module exists to contain
// ---------------------------------------------------------------------------
describe("client identity never crosses between proposals", () => {
  it("scrubs the captured client out of the stored template body", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: { id: PROPOSAL_ID, title: "Acme Rollout", form_data: leakyBody } },
      "client_proposal_templates:insert": { data: { id: TEMPLATE_ID } },
    });
    signIn("employee", supabase);

    const result = await createTemplateFromProposal({ proposalId: PROPOSAL_ID, name: "Pilot" });

    expect(result).toEqual({ ok: true, templateId: TEMPLATE_ID });
    const stored = findCall(supabase, "client_proposal_templates", "insert")?.payload as {
      form_data: GeneratorState;
    };
    expect(JSON.stringify(stored.form_data)).not.toMatch(/Acme|Dana|dana@acme|RPST-2026-001/i);
    expect(stored.form_data.fields.packageSelect).toBe("growth");
    expect(isGeneratorState(stored.form_data)).toBe(true);
  });

  it("refuses to capture a proposal with no usable form state", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: { id: PROPOSAL_ID, title: "Empty", form_data: null } },
    });
    signIn("employee", supabase);

    const result = await createTemplateFromProposal({ proposalId: PROPOSAL_ID, name: "Pilot" });

    expect(result.ok).toBe(false);
    expect(findCall(supabase, "client_proposal_templates", "insert")).toBeUndefined();
  });

  it("prefills the NEW company and drops a legacy template's stored client block", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
      "company_clients:select": {
        data: {
          id: CLIENT_ID,
          name: "Beta Builders",
          contact_name: "Sam Ortiz",
          email: "sam@beta.example",
          address_line1: "9 Foundry Way",
          city: "Madison",
          state: "WI",
          postal_code: "53703",
        },
      },
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID, proposal_number: "RPS-2026-0042" } },
      "client_proposals:update": {},
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({
      templateId: TEMPLATE_ID,
      title: "Beta Rollout",
      clientId: CLIENT_ID,
      // leakyBody predates proposal types, so the caller supplies one.
      typeKey: "platform",
    });

    expect(result).toEqual({ ok: true, proposalId: NEW_PROPOSAL_ID });

    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as { form_data: GeneratorState };
    expect(inserted.form_data.fields.clientCompany).toBe("Beta Builders");
    // One addressee, folded from the company record's single legacy contact.
    expect(inserted.form_data.fields.clientContacts).toBe("Sam Ortiz |  | sam@beta.example");
    // The address comes across now — company_clients has address columns.
    expect(inserted.form_data.fields.clientAddress).toBe("9 Foundry Way\nMadison, WI 53703");
    // The captured template's own reference must not carry over. The NEW
    // proposal's number is stamped on by the follow-up update, once the
    // database has allocated it.
    expect(inserted.form_data.fields).not.toHaveProperty("proposalNo");
    expect(JSON.stringify(inserted.form_data)).not.toMatch(/Acme|Dana|dana@acme/i);

    const numbered = findCall(supabase, "client_proposals", "update")?.payload as { form_data: GeneratorState };
    expect(numbered.form_data.fields.proposalNo).toBe("RPS-2026-0042");

    // Revision 1 must be the same scrubbed state the working copy ends up
    // holding — including the allocated number — or restoring it either
    // re-leaks the captured client or wipes the proposal's own reference.
    const revision = findCall(supabase, "client_proposal_revisions", "insert")?.payload as {
      form_data: GeneratorState;
      revision_number: number;
    };
    expect(revision.revision_number).toBe(1);
    expect(revision.form_data).toEqual(numbered.form_data);
    expect(JSON.stringify(revision.form_data)).not.toMatch(/Acme|Dana|dana@acme/i);
  });

  it("leaves the client block empty for an unassigned proposal", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({
      templateId: TEMPLATE_ID,
      title: "Unassigned deal",
      typeKey: "platform",
    });

    expect(result.ok).toBe(true);
    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as { form_data: GeneratorState };
    expect(inserted.form_data.fields).not.toHaveProperty("clientCompany");
    expect(JSON.stringify(inserted.form_data)).not.toMatch(/Acme/i);
    // No company assigned means no company_clients lookup at all.
    expect(findCall(supabase, "company_clients", "select")).toBeUndefined();
  });

  it("refuses an archived template rather than quietly using it", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Retired", form_data: leakyBody, is_archived: true },
      },
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({ templateId: TEMPLATE_ID, title: "Beta Rollout" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("archived");
    expect(findCall(supabase, "client_proposals", "insert")).toBeUndefined();
  });

  it("refuses a legacy typeless template when the caller names no type", async () => {
    // The last path that could still mint an untyped proposal. An untyped state
    // renders the platform-era fallback copy, which is how a CPR class came to
    // promise "Configured platform subscription".
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({ templateId: TEMPLATE_ID, title: "Beta Rollout" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("proposal type");
    expect(findCall(supabase, "client_proposals", "insert")).toBeUndefined();
  });

  it("refuses a caller-supplied type that is not a real proposal type", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({
      templateId: TEMPLATE_ID,
      title: "Beta Rollout",
      typeKey: "not_a_type",
    });

    expect(result.ok).toBe(false);
    expect(findCall(supabase, "client_proposals", "insert")).toBeUndefined();
  });

  it("lets the template's own type win over a caller-supplied one", async () => {
    const typedBody: GeneratorState = {
      ...leakyBody,
      fields: { ...leakyBody.fields, proposalType: "training" },
    };
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Training", form_data: typedBody, is_archived: false },
      },
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposalFromTemplate({
      templateId: TEMPLATE_ID,
      title: "Beta Rollout",
      typeKey: "platform",
    });

    expect(result.ok).toBe(true);
    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as { form_data: GeneratorState };
    // typeKey is a fallback for legacy templates, never a way to relabel one.
    expect(inserted.form_data.fields.proposalType).toBe("training");
  });

  it("refuses a template whose stored body is not a generator state", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Broken", form_data: { v: 1, fields: {} }, is_archived: false },
      },
    });
    signIn("employee", supabase);

    expect((await createProposalFromTemplate({ templateId: TEMPLATE_ID, title: "x" })).ok).toBe(false);
    expect(findCall(supabase, "client_proposals", "insert")).toBeUndefined();
  });

  it("prices the new proposal from the template's own line items", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposalFromTemplate({ templateId: TEMPLATE_ID, title: "Beta Rollout", typeKey: "platform" });

    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as { proposal_value: number };
    // annualPrice 24000 (package row) + discovery phase 3500.
    expect(inserted.proposal_value).toBe(27500);
  });

  it("keeps a seller-supplied value instead of the computed one", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_templates:select": {
        data: { id: TEMPLATE_ID, name: "Pilot", form_data: leakyBody, is_archived: false },
      },
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposalFromTemplate({
      templateId: TEMPLATE_ID,
      title: "Beta Rollout",
      proposalValue: 19000,
      typeKey: "platform",
    });

    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as { proposal_value: number };
    expect(inserted.proposal_value).toBe(19000);
  });
});

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
describe("listProposalTemplates", () => {
  it("hides archived templates by default", async () => {
    const supabase = createSupabaseMock({ "client_proposal_templates:select": { data: [] } });
    signIn("employee", supabase);

    await listProposalTemplates();

    expect(findCall(supabase, "client_proposal_templates", "select")?.filters).toEqual([["is_archived", false]]);
  });

  it("includes archived templates when asked", async () => {
    const supabase = createSupabaseMock({ "client_proposal_templates:select": { data: [] } });
    signIn("employee", supabase);

    await listProposalTemplates({ includeArchived: true });

    expect(findCall(supabase, "client_proposal_templates", "select")?.filters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Built-in transaction types
// ---------------------------------------------------------------------------
describe("createProposalFromTransactionType", () => {
  it("denies a role outside the portal whitelist without touching the database", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    const result = await createProposalFromTransactionType({ typeKey: "pilot", title: "Pilot for Acme" });

    expect(result.ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses a key the registry does not offer", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await createProposalFromTransactionType({ typeKey: "growth_hack", title: "x" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("proposal type");
    expect(supabase.calls).toHaveLength(0);
  });

  it("creates a draft seeded from the type's template, priced from its own line items", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:insert": { data: { id: NEW_PROPOSAL_ID, proposal_number: "RPS-2026-0042" } },
      "client_proposals:update": {},
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposalFromTransactionType({ typeKey: "pilot", title: "Pilot for Hunzinger" });

    expect(result.ok).toBe(true);
    expect(result.proposalId).toBe(NEW_PROPOSAL_ID);

    const inserted = findCall(supabase, "client_proposals", "insert")?.payload as {
      status: string;
      proposal_value: number;
      form_data: GeneratorState;
    };
    expect(inserted.status).toBe("draft");
    // The pilot package's manual price fallback (5000) plus four zero-price phases.
    expect(inserted.proposal_value).toBe(5000);
    expect(isGeneratorState(inserted.form_data)).toBe(true);
    expect(inserted.form_data.fields.packageSelect).toBe("custom");
    expect(inserted.form_data.fields.clientCompany).toBeUndefined();

    // The allocated reference is stamped onto the saved state...
    const stamped = findCall(supabase, "client_proposals", "update")?.payload as { form_data: GeneratorState };
    expect(stamped.form_data.fields.proposalNo).toBe("RPS-2026-0042");

    // ...and revision 1 carries the numbered state and names the type.
    const revision = findCall(supabase, "client_proposal_revisions", "insert")?.payload as {
      change_note: string;
      form_data: GeneratorState;
    };
    expect(revision.change_note).toContain("Pilot");
    expect(revision.form_data.fields.proposalNo).toBe("RPS-2026-0042");

    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});
