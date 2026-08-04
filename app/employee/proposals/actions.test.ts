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
import { phaseOptions } from "@/lib/proposals/catalog";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import {
  createProposal,
  deleteProposal,
  duplicateProposal,
  restoreProposalRevision,
  saveProposalDraft,
  saveProposalRevision,
  setProposalStatus,
  updateProposalMeta,
} from "./actions";

const getAccessMock = vi.mocked(getProposalAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

const validState: GeneratorState = { v: 1, fields: { clientCompany: "Acme" }, phases: [], services: [] };

// ---------------------------------------------------------------------------
// Minimal chainable stand-in for the Supabase PostgREST client. Each `from()`
// records the table, operation, filters, and payload; the test supplies a
// route table keyed by "<table>:<op>".
// ---------------------------------------------------------------------------
interface QueryRecord {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload?: Record<string, unknown>;
  selected?: string;
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

type SupabaseMock = ReturnType<typeof createSupabaseMock>;

/** Signs a user in with the flags the real policy would resolve for `role`. */
function signIn(role: string | null, supabase: unknown, overrides: Record<string, unknown> = {}) {
  const flags = resolveProposalRoleFlags(role, role !== null);
  getAccessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role,
    ...flags,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function proposal(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    title: "Acme Rollout",
    status: "draft",
    current_revision: 3,
    client_id: CLIENT_ID,
    owner: "Jo",
    proposal_value: 1000,
    valid_until: "2026-12-31",
    summary: "Summary",
    body_markdown: null,
    form_data: validState,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------
describe("proposal action RBAC", () => {
  it("denies deleteProposal to a non-admin portal role and never touches the database", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    const result = await deleteProposal(PROPOSAL_ID);

    expect(result).toEqual({ ok: false, error: "Admin role required to delete proposals." });
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("allows deleteProposal for an admin role", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposals:delete": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("company_admin", supabase);

    const result = await deleteProposal(PROPOSAL_ID);

    expect(result.ok).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
    // Both the list and the detail route must be dropped from the cache.
    expect(revalidateMock).toHaveBeenCalledWith("/employee/proposals");
    expect(revalidateMock).toHaveBeenCalledWith(`/employee/proposals/${PROPOSAL_ID}`);
  });

  it("lets an in-whitelist non-admin role save a revision", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ current_revision: 3 }) },
      "client_proposal_revisions:insert": {},
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("internal_reviewer", supabase);

    const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout", formData: validState });

    expect(result).toEqual({ ok: true, revisionNumber: 4 });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0][0].actor_role).toBe("internal_reviewer");
  });

  it("denies every mutating action to a role outside the is_company_portal_employee() whitelist", async () => {
    const supabase = createSupabaseMock({});
    signIn("client_user", supabase);

    expect((await createProposal({ title: "X" })).ok).toBe(false);
    expect((await updateProposalMeta(PROPOSAL_ID, { owner: "Jo" })).ok).toBe(false);
    expect((await saveProposalRevision(PROPOSAL_ID, { title: "X" })).ok).toBe(false);
    expect((await saveProposalDraft(PROPOSAL_ID, validState)).ok).toBe(false);
    expect((await duplicateProposal(PROPOSAL_ID)).ok).toBe(false);
    expect((await setProposalStatus(PROPOSAL_ID, "sent")).ok).toBe(false);
    expect((await deleteProposal(PROPOSAL_ID)).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Silent no-op writes
// ---------------------------------------------------------------------------
describe("no silent no-op writes", () => {
  it("fails updateProposalMeta for an id that does not exist and writes no audit event", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: null },
      "client_proposals:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await updateProposalMeta("99999999-9999-4999-8999-999999999999", { owner: "Jo" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Proposal not found or you do not have permission to change it.");
    expect(auditMock).not.toHaveBeenCalled();
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("fails updateProposalMeta when RLS discards the update (zero rows affected)", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposals:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await updateProposalMeta(PROPOSAL_ID, { owner: "Jo" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Proposal not found or you do not have permission to change it.");
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("fails setProposalStatus when the status update affects zero rows", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [] },
    });
    signIn("employee", supabase);

    const result = await setProposalStatus(PROPOSAL_ID, "sent");

    expect(result.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("fails deleteProposal when the delete affects zero rows", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposals:delete": { data: [] },
    });
    signIn("admin", supabase);

    const result = await deleteProposal(PROPOSAL_ID);

    expect(result.ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Status gates
// ---------------------------------------------------------------------------
describe("status gates", () => {
  for (const status of ["sent", "accepted", "archived"] as const) {
    it(`rejects saveProposalRevision on a ${status} proposal`, async () => {
      const supabase = createSupabaseMock({
        "client_proposals:select": { data: proposal({ status }) },
      });
      signIn("employee", supabase);

      const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout", formData: validState });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("locked");
      expect(supabase.calls.some((c) => c.table === "client_proposal_revisions")).toBe(false);
      expect(auditMock).not.toHaveBeenCalled();
    });
  }

  it("rejects an illegal status transition (accepted → sent)", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "accepted" }) },
    });
    signIn("employee", supabase);

    const result = await setProposalStatus(PROPOSAL_ID, "sent");

    expect(result).toEqual({ ok: false, error: "A accepted proposal cannot move to sent." });
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects re-pricing an in_review proposal even though content edits are still allowed", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    expect((await updateProposalMeta(PROPOSAL_ID, { proposalValue: 999 })).ok).toBe(false);
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects re-pricing a locked proposal but still allows an owner change", async () => {
    const locked = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "accepted" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", locked);

    const repriced = await updateProposalMeta(PROPOSAL_ID, { proposalValue: 999999 });
    expect(repriced.ok).toBe(false);
    expect(repriced.error).toContain("locked");
    expect(locked.calls.some((c) => c.op === "update")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();

    const reassignedCompany = await updateProposalMeta(PROPOSAL_ID, { clientId: CLIENT_ID });
    expect(reassignedCompany.ok).toBe(false);

    const movedExpiry = await updateProposalMeta(PROPOSAL_ID, { validUntil: "2030-01-01" });
    expect(movedExpiry.ok).toBe(false);

    const ownerChange = await updateProposalMeta(PROPOSAL_ID, { owner: "New Owner" });
    expect(ownerChange.ok).toBe(true);
  });

  it("allows commercial edits while the proposal is a draft", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await updateProposalMeta(PROPOSAL_ID, { proposalValue: 42000, validUntil: "2027-01-31" });

    expect(result.ok).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Optimistic locking
// ---------------------------------------------------------------------------
describe("optimistic locking", () => {
  it("rejects a save whose baseRevision is stale", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ current_revision: 5 }) },
    });
    signIn("employee", supabase);

    const result = await saveProposalRevision(PROPOSAL_ID, {
      title: "Acme Rollout",
      formData: validState,
      baseRevision: 3,
    });

    expect(result).toEqual({ ok: false, error: "Someone else saved v5 while you were editing." });
    expect(supabase.calls.some((c) => c.table === "client_proposal_revisions")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("accepts a save whose baseRevision matches, and skips the check when omitted", async () => {
    const routes = {
      "client_proposals:select": { data: proposal({ current_revision: 5 }) },
      "client_proposal_revisions:insert": {},
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    };
    signIn("employee", createSupabaseMock(routes));
    expect(await saveProposalRevision(PROPOSAL_ID, { title: "T", baseRevision: 5 })).toEqual({
      ok: true,
      revisionNumber: 6,
    });

    signIn("employee", createSupabaseMock(routes));
    expect(await saveProposalRevision(PROPOSAL_ID, { title: "T" })).toEqual({ ok: true, revisionNumber: 6 });
  });

  it("translates a unique_violation into the same friendly message", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ current_revision: 3 }) },
      "client_proposal_revisions:insert": {
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "client_proposal_revisions_proposal_id_revision_number_key"',
        },
      },
    });
    signIn("employee", supabase);

    const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout" });

    expect(result).toEqual({ ok: false, error: "Someone else saved v4 while you were editing." });
    expect(result.error).not.toContain("duplicate key");
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe("server-side input validation", () => {
  it("rejects hostile createProposal payloads before reaching the database", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect((await createProposal({ title: "a".repeat(201) })).fieldErrors?.title).toBeTruthy();
    expect((await createProposal({ title: "T", proposalValue: Number.NaN })).fieldErrors?.proposalValue).toBeTruthy();
    expect((await createProposal({ title: "T", proposalValue: 1e12 })).fieldErrors?.proposalValue).toBeTruthy();
    expect((await createProposal({ title: "T", validUntil: "2026-02-30" })).fieldErrors?.validUntil).toBeTruthy();
    expect((await createProposal({ title: "T", clientId: "not-a-uuid" })).fieldErrors?.clientId).toBeTruthy();
    expect(supabase.calls).toHaveLength(0);
  });

  it("rejects hostile updateProposalMeta payloads before reading the proposal", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: proposal() } });
    signIn("employee", supabase);

    expect((await updateProposalMeta(PROPOSAL_ID, { proposalValue: -1 })).ok).toBe(false);
    expect((await updateProposalMeta(PROPOSAL_ID, { validUntil: "yesterday" })).ok).toBe(false);
    expect((await updateProposalMeta(PROPOSAL_ID, { clientId: "'; drop table client_proposals" })).ok).toBe(false);
    expect(supabase.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Revision 1 seeding / restore
// ---------------------------------------------------------------------------
describe("revision 1 form state", () => {
  it("seeds form_data on both the working copy and revision 1, prefilled from the company", async () => {
    const supabase = createSupabaseMock({
      "company_clients:select": { data: { name: "Acme Co", contact_name: "Dana", email: "dana@acme.test" } },
      "client_proposals:insert": { data: { id: PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposal({ title: "Acme Rollout", clientId: CLIENT_ID });

    expect(result).toEqual({ ok: true, proposalId: PROPOSAL_ID });
    const workingCopy = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "insert");
    const revision = supabase.calls.find((c) => c.table === "client_proposal_revisions" && c.op === "insert");

    expect(workingCopy?.payload?.form_data).toEqual(revision?.payload?.form_data);
    const seeded = workingCopy?.payload?.form_data;
    expect(isGeneratorState(seeded)).toBe(true);
    expect((seeded as GeneratorState).fields).toEqual({
      clientCompany: "Acme Co",
      clientContact: "Dana",
      clientEmail: "dana@acme.test",
    });
  });

  // Regression: seeding empty item arrays made a brand-new proposal open with
  // NO line items, because the bridge applies the persisted arrays verbatim
  // instead of leaving the generator's implicit pilot defaults in place.
  it("seeds the generator's default pilot phase rows, not empty arrays", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:insert": { data: { id: PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposal({ title: "Unassigned deal" });

    const revision = supabase.calls.find((c) => c.table === "client_proposal_revisions" && c.op === "insert");
    const seeded = revision?.payload?.form_data as GeneratorState;

    expect(isGeneratorState(seeded)).toBe(true);
    expect(seeded.fields).toEqual({});
    // The asset seeds three phases and no service rows.
    expect(seeded.phases).toHaveLength(3);
    expect(seeded.services).toEqual([]);
    expect(seeded.phases.map((p) => p.key)).toEqual(["discovery", "build", "launch"]);
    expect(seeded.phases.map((p) => p.name)).toEqual([
      phaseOptions.discovery.name,
      phaseOptions.build.name,
      phaseOptions.launch.name,
    ]);
    for (const phase of seeded.phases) {
      expect(phase.type).toBe("phase");
      expect(phase.qty).toBe(1);
      // Bundled into the pilot package fee.
      expect(phase.price).toBe(0);
      expect(phase.unit).toBe("");
      expect(phase.desc).toContain("pilot");
    }
  });

  it("prices the seeded state at the default pilot package fee", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:insert": { data: { id: PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposal({ title: "Unassigned deal" });

    const insert = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "insert");
    const totals = computeProposalTotals(insert?.payload?.form_data as GeneratorState);
    // Zero-priced phases must not move the total off the package fee.
    expect(totals.total).toBe(5000);
    expect(totals.lineItems).toHaveLength(4);
  });

  it("refuses to restore a revision with no usable form data", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_revisions:select": {
        data: { id: "rev-1", proposal_id: PROPOSAL_ID, revision_number: 1, title: "T", summary: null, body_markdown: null, form_data: null },
      },
    });
    signIn("employee", supabase);

    const result = await restoreProposalRevision(PROPOSAL_ID, "rev-1");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("blank");
    expect(supabase.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("restores a revision that has valid form data", async () => {
    const supabase = createSupabaseMock({
      "client_proposal_revisions:select": {
        data: { id: "rev-2", proposal_id: PROPOSAL_ID, revision_number: 2, title: "T", summary: null, body_markdown: null, form_data: validState },
      },
      "client_proposal_revisions:insert": {},
      "client_proposals:select": { data: proposal({ current_revision: 4 }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await restoreProposalRevision(PROPOSAL_ID, "rev-2");

    expect(result).toEqual({ ok: true, revisionNumber: 5 });
  });
});

// ---------------------------------------------------------------------------
// New actions
// ---------------------------------------------------------------------------
describe("saveProposalDraft", () => {
  it("writes only form_data and creates no revision", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await saveProposalDraft(PROPOSAL_ID, validState);

    expect(result).toEqual({ ok: true });
    expect(supabase.calls.some((c) => c.table === "client_proposal_revisions")).toBe(false);
    const update = supabase.calls.find((c) => c.op === "update");
    expect(Object.keys(update?.payload ?? {}).sort()).toEqual(["form_data", "proposal_value", "updated_at"]);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith(`/employee/proposals/${PROPOSAL_ID}`);
  });

  it("honours the same status gate as saveProposalRevision", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: proposal({ status: "sent" }) } });
    signIn("employee", supabase);

    expect((await saveProposalDraft(PROPOSAL_ID, validState)).ok).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects malformed generator state", async () => {
    const supabase = createSupabaseMock({});
    signIn("employee", supabase);

    expect(await saveProposalDraft(PROPOSAL_ID, { nope: true })).toEqual({
      ok: false,
      error: "Malformed proposal form data.",
    });
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("duplicateProposal", () => {
  it("creates a fresh draft at revision 1 with a duplication note", async () => {
    const NEW_ID = "33333333-3333-4333-8333-333333333333";
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "accepted" }) },
      "client_proposals:insert": { data: { id: NEW_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await duplicateProposal(PROPOSAL_ID);

    expect(result).toEqual({ ok: true, proposalId: NEW_ID });
    const copy = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "insert");
    expect(copy?.payload).toMatchObject({
      title: "Acme Rollout (Copy)",
      status: "draft",
      current_revision: 1,
      client_id: CLIENT_ID,
      proposal_value: 1000,
      form_data: validState,
    });
    const revision = supabase.calls.find((c) => c.table === "client_proposal_revisions" && c.op === "insert");
    expect(revision?.payload).toMatchObject({
      proposal_id: NEW_ID,
      revision_number: 1,
      change_note: "Duplicated from Acme Rollout",
    });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(revalidateMock).toHaveBeenCalledWith(`/employee/proposals/${NEW_ID}`);
  });

  it("fails cleanly when the source proposal is not readable", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: null } });
    signIn("employee", supabase);

    const result = await duplicateProposal(PROPOSAL_ID);

    expect(result.ok).toBe(false);
    expect(supabase.calls.some((c) => c.op === "insert")).toBe(false);
    expect(auditMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Server-recomputed proposal_value (pipeline drift)
// ---------------------------------------------------------------------------
describe("server-recomputed proposal_value", () => {
  // starter package 35,000 + 10 × OSHA 10 @ 175 = 36,750; less a 10% discount.
  const pricedState: GeneratorState = {
    v: 1,
    fields: { packageSelect: "starter", discountPct: "10" },
    phases: [],
    services: [
      { type: "service", key: "osha10", name: "OSHA 10 Training", qty: 10, price: 175, desc: "", unit: "Person" },
    ],
  };
  const expectedTotal = 33075;

  it("agrees with computeProposalTotals on the fixture", () => {
    expect(computeProposalTotals(pricedState).total).toBe(expectedTotal);
  });

  it("writes the recomputed total on saveProposalRevision, ignoring the stored value", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ proposal_value: 1 }) },
      "client_proposal_revisions:insert": {},
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout", formData: pricedState });

    expect(result.ok).toBe(true);
    const update = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "update");
    expect(update?.payload?.proposal_value).toBe(expectedTotal);
    expect(auditMock.mock.calls[0][0].after_state).toMatchObject({ proposal_value: expectedTotal });
  });

  it("writes the recomputed total on saveProposalDraft", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    expect((await saveProposalDraft(PROPOSAL_ID, pricedState)).ok).toBe(true);

    const update = supabase.calls.find((c) => c.op === "update");
    expect(update?.payload?.proposal_value).toBe(expectedTotal);
  });

  it("leaves proposal_value untouched when the save carries no form state", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal() },
      "client_proposal_revisions:insert": {},
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout" });

    const update = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "update");
    expect(update?.payload).not.toHaveProperty("proposal_value");
  });
});

// ---------------------------------------------------------------------------
// Audit enrichment
// ---------------------------------------------------------------------------
describe("audit events", () => {
  it("records the actor role on status changes", async () => {
    const supabase: SupabaseMock = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("marketing", supabase);

    await setProposalStatus(PROPOSAL_ID, "in_review");

    expect(auditMock).toHaveBeenCalledTimes(1);
    const event = auditMock.mock.calls[0][0];
    expect(event.actor_role).toBe("marketing");
    expect(event.actor_id).toBe("user-1");
    expect(event.resource_id).toBe(PROPOSAL_ID);
  });
});
