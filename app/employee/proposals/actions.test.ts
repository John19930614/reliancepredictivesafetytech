import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/proposals/access", () => ({ getProposalAccess: vi.fn() }));
vi.mock("@/lib/audit/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audit/events")>();
  return { ...actual, recordAuditEvent: vi.fn(async () => {}) };
});
vi.mock("@/lib/proposals/acceptance-filing", () => ({
  fileAcceptedProposalPdf: vi.fn(async () => ({ ok: true, fileId: "filed-file-1" })),
}));

import { revalidatePath } from "next/cache";
import { getProposalAccess } from "@/lib/proposals/access";
import { recordAuditEvent } from "@/lib/audit/events";
import { fileAcceptedProposalPdf } from "@/lib/proposals/acceptance-filing";
import { resolveProposalRoleFlags } from "@/lib/proposals/policy";
import { isGeneratorState, type GeneratorState } from "@/lib/proposals/generator-state";
import { phaseOptions } from "@/lib/proposals/catalog";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import {
  createProposal,
  decideProposal,
  deleteProposal,
  duplicateProposal,
  restoreProposalRevision,
  saveProposalDraft,
  saveProposalRevision,
  sendProposalToDocusign,
  setProposalStatus,
  submitProposalForReview,
  updateProposalMeta,
} from "./actions";

const getAccessMock = vi.mocked(getProposalAccess);
const auditMock = vi.mocked(recordAuditEvent);
const revalidateMock = vi.mocked(revalidatePath);
const filingMock = vi.mocked(fileAcceptedProposalPdf);

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
      "company_clients:select": {
        data: { id: CLIENT_ID, name: "Acme Co", contact_name: "Dana", email: "dana@acme.test" },
      },
      // The reference number is allocated by the column default, so the insert
      // returns it and the action stamps it onto the form state afterwards.
      "client_proposals:insert": { data: { id: PROPOSAL_ID, proposal_number: "RPS-2026-0007" } },
      "client_proposals:update": {},
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    const result = await createProposal({ title: "Acme Rollout", clientId: CLIENT_ID });

    expect(result).toEqual({ ok: true, proposalId: PROPOSAL_ID });
    // form_data lands on the UPDATE, not the insert: the proposal row has to
    // exist before its number does.
    const workingCopy = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "update");
    const revision = supabase.calls.find((c) => c.table === "client_proposal_revisions" && c.op === "insert");

    expect(workingCopy?.payload?.form_data).toEqual(revision?.payload?.form_data);
    const seeded = workingCopy?.payload?.form_data;
    expect(isGeneratorState(seeded)).toBe(true);

    const fields = (seeded as GeneratorState).fields;
    expect(fields.clientCompany).toBe("Acme Co");
    // No contact rows on this company yet, so the single legacy contact is
    // folded into the addressee list rather than dropped.
    expect(fields.clientContacts).toBe("Dana |  | dana@acme.test");
    expect(fields.proposalNo).toBe("RPS-2026-0007");
    // The legacy single-contact fields are not written any more: the addressee
    // list is the only place a person is stored.
    expect(fields).not.toHaveProperty("clientContact");
    expect(fields).not.toHaveProperty("clientTitle");
    expect(fields).not.toHaveProperty("clientEmail");
    // No address on this company record, so nothing is invented for it.
    expect(fields).not.toHaveProperty("clientAddress");
  });

  // Regression: seeding empty item arrays made a brand-new proposal open with
  // NO line items, because the bridge applies the persisted arrays verbatim
  // instead of leaving the generator's implicit pilot defaults in place.
  it("seeds the generator's default phase rows, not empty arrays", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:insert": { data: { id: PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposal({ title: "Unassigned deal" });

    const revision = supabase.calls.find((c) => c.table === "client_proposal_revisions" && c.op === "insert");
    const seeded = revision?.payload?.form_data as GeneratorState;

    expect(isGeneratorState(seeded)).toBe(true);
    // Unassigned: no company to pull a client block from, so none is invented.
    expect(seeded.fields).not.toHaveProperty("clientCompany");
    expect(seeded.fields).not.toHaveProperty("clientContacts");
    expect(seeded.fields).not.toHaveProperty("clientAddress");
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
      // Priced at zero so the seller sets the fee deliberately.
      expect(phase.price).toBe(0);
      expect(phase.unit).toBe("");
      // Neutral copy: a new proposal must not announce a pilot it may not be,
      // and must not hardcode a count or a duration no field controls.
      expect(phase.desc).not.toMatch(/pilot/i);
      expect(phase.desc).not.toMatch(/\d+[- ](month|user|jobsite|site)/i);
    }
  });

  it("prices the seeded state at the default package fee", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:insert": { data: { id: PROPOSAL_ID } },
      "client_proposal_revisions:insert": {},
    });
    signIn("employee", supabase);

    await createProposal({ title: "Unassigned deal" });

    const workingCopy = supabase.calls.find((c) => c.table === "client_proposals" && c.op === "update");
    const seeded = workingCopy?.payload?.form_data as GeneratorState;
    const totals = computeProposalTotals(seeded);
    expect(totals.total).toBe(0);
    // Three zero-priced phases and NO package row. A new proposal is not a
    // platform sale yet, and the fallback package printed one anyway — a
    // "Platform Services" subscription line at $0 with subscription pills
    // beside it, on a proposal that might turn out to be training.
    expect(seeded.fields.packageSelect).toBe("none");
    expect(totals.lineItems).toHaveLength(3);
    expect(totals.lineItems.some((row) => row.source === "package")).toBe(false);
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

// ---------------------------------------------------------------------------
// Acceptance filing
// ---------------------------------------------------------------------------
describe("acceptance filing", () => {
  it("files the accepted PDF when a proposal moves to accepted", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "sent" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await setProposalStatus(PROPOSAL_ID, "accepted");

    expect(result).toEqual({ ok: true });
    expect(filingMock).toHaveBeenCalledTimes(1);
    expect(filingMock).toHaveBeenCalledWith({ proposalId: PROPOSAL_ID, actorUserId: "user-1", actorRole: "employee" });
  });

  it("does not file on a non-accept transition", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    await setProposalStatus(PROPOSAL_ID, "in_review");

    expect(filingMock).not.toHaveBeenCalled();
  });

  it("keeps the acceptance and audits a warning when filing fails", async () => {
    filingMock.mockResolvedValueOnce({ ok: false, error: "bucket offline" });
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "sent" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("employee", supabase);

    const result = await setProposalStatus(PROPOSAL_ID, "accepted");

    // The business event stands; the filing failure is a warning, not an error.
    expect(result).toEqual({ ok: true });
    expect(auditMock).toHaveBeenCalledTimes(2);
    const warning = auditMock.mock.calls[1][0];
    expect(warning.severity).toBe("warn");
    expect(warning.summary).toContain("could not be auto-filed");
    expect(warning.summary).toContain("bucket offline");
  });
});

// ---------------------------------------------------------------------------
// Maker–checker
//
// Steve authors, John reviews and sends. Both hold super_admin, so `role` alone
// cannot tell them apart — the split rides entirely on the canApprove flag, and
// every test here signs in as super_admin to prove that.
// ---------------------------------------------------------------------------
const MAKER = { canApprove: false };
const APPROVER = { canApprove: true };

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    revision_id: "rev-3",
    revision_number: 3,
    decision: "approved",
    note: null,
    decided_by: "user-1",
    decided_at: "2026-08-11T10:00:00.000Z",
    ...overrides,
  };
}

describe("submitProposalForReview", () => {
  it("lets the maker hand a draft to the reviewer without the approver capability", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("super_admin", supabase, MAKER);

    expect(await submitProposalForReview(PROPOSAL_ID)).toEqual({ ok: true });
    const update = supabase.calls.find((call) => call.op === "update");
    expect(update?.payload).toEqual({ status: "in_review" });
    // Guarded read-then-write: only moves a row that is still a draft.
    expect(update?.filters).toContainEqual(["status", "draft"]);
  });

  it("refuses a proposal that is not a draft", async () => {
    const supabase = createSupabaseMock({ "client_proposals:select": { data: proposal({ status: "sent" }) } });
    signIn("super_admin", supabase, MAKER);

    const result = await submitProposalForReview(PROPOSAL_ID);
    expect(result.ok).toBe(false);
    expect(supabase.calls.some((call) => call.op === "update")).toBe(false);
  });
});

describe("decideProposal", () => {
  it("refuses the maker, and writes no decision", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review" }) },
    });
    signIn("super_admin", supabase, MAKER);

    const result = await decideProposal(PROPOSAL_ID, { decision: "approved" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approver/i);
    expect(supabase.calls.some((call) => call.table === "client_proposal_approvals")).toBe(false);
  });

  it("records an approval pinned to the current revision", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review", current_revision: 3 }) },
      "client_proposal_revisions:select": { data: { id: "rev-3", revision_number: 3 } },
      "client_proposal_approvals:insert": { data: [{ id: "decision-1" }] },
    });
    signIn("super_admin", supabase, APPROVER);

    expect(await decideProposal(PROPOSAL_ID, { decision: "approved" })).toEqual({ ok: true });
    const insert = supabase.calls.find((call) => call.table === "client_proposal_approvals");
    expect(insert?.payload).toMatchObject({
      proposal_id: PROPOSAL_ID,
      revision_id: "rev-3",
      revision_number: 3,
      decision: "approved",
      decided_by: "user-1",
    });
    // An approval leaves it in_review; Send is a separate, deliberate act.
    expect(supabase.calls.some((call) => call.table === "client_proposals" && call.op === "update")).toBe(false);
  });

  it("will not request changes without saying what to change", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review" }) },
    });
    signIn("super_admin", supabase, APPROVER);

    const result = await decideProposal(PROPOSAL_ID, { decision: "changes_requested", note: "   " });
    expect(result.ok).toBe(false);
    expect(supabase.calls.some((call) => call.table === "client_proposal_approvals")).toBe(false);
  });

  it("reopens the draft when changes are requested", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review" }) },
      "client_proposal_revisions:select": { data: { id: "rev-3", revision_number: 3 } },
      "client_proposal_approvals:insert": { data: [{ id: "decision-1" }] },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("super_admin", supabase, APPROVER);

    expect(await decideProposal(PROPOSAL_ID, { decision: "changes_requested", note: "Drop the price." })).toEqual({
      ok: true,
    });
    const update = supabase.calls.find((call) => call.table === "client_proposals" && call.op === "update");
    expect(update?.payload).toEqual({ status: "draft" });
  });
});

describe("the send gate", () => {
  function sendScenario(options: { approvals: unknown[]; currentRevision?: number }) {
    return createSupabaseMock({
      "client_proposals:select": {
        data: proposal({ status: "in_review", current_revision: options.currentRevision ?? 3 }),
      },
      "client_proposal_approvals:select": { data: options.approvals },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
  }

  it("refuses the maker even on a fully approved proposal", async () => {
    const supabase = sendScenario({ approvals: [approvalRow()] });
    signIn("super_admin", supabase, MAKER);

    const result = await setProposalStatus(PROPOSAL_ID, "sent");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approver/i);
    expect(supabase.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("refuses an approver when nothing has been approved", async () => {
    const supabase = sendScenario({ approvals: [] });
    signIn("super_admin", supabase, APPROVER);

    const result = await setProposalStatus(PROPOSAL_ID, "sent");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Approve this proposal/i);
    expect(supabase.calls.some((call) => call.op === "update")).toBe(false);
  });

  // Approve v3, rewrite it into v4, then try to send the rewrite.
  it("refuses to spend an approval on a revision it was not given for", async () => {
    const supabase = sendScenario({ approvals: [approvalRow({ revision_number: 3 })], currentRevision: 4 });
    signIn("super_admin", supabase, APPROVER);

    const result = await setProposalStatus(PROPOSAL_ID, "sent");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("v3 was approved");
    expect(supabase.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("opens for an approver holding an approval of the current revision", async () => {
    const supabase = sendScenario({ approvals: [approvalRow({ revision_number: 3 })], currentRevision: 3 });
    signIn("super_admin", supabase, APPROVER);

    expect(await setProposalStatus(PROPOSAL_ID, "sent")).toEqual({ ok: true });
    const update = supabase.calls.find((call) => call.op === "update");
    expect(update?.payload).toEqual({ status: "sent" });
  });

  it("leaves every other transition alone", async () => {
    // Archiving must not require an approval.
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "draft" }) },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
    signIn("super_admin", supabase, MAKER);

    expect(await setProposalStatus(PROPOSAL_ID, "archived")).toEqual({ ok: true });
  });
});

describe("an edit after approval", () => {
  function editScenario() {
    return createSupabaseMock({
      "client_proposals:select": { data: proposal({ status: "in_review", current_revision: 3 }) },
      "client_proposal_revisions:insert": { data: [{ id: "rev-4" }] },
      "client_proposals:update": { data: [{ id: PROPOSAL_ID }] },
    });
  }

  it("returns the proposal to draft when the MAKER saves a new revision", async () => {
    const supabase = editScenario();
    signIn("super_admin", supabase, MAKER);

    const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout", formData: validState });
    expect(result.ok).toBe(true);

    const statusUpdate = supabase.calls.find(
      (call) => call.table === "client_proposals" && call.op === "update" && call.payload?.status === "draft",
    );
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate?.filters).toContainEqual(["status", "in_review"]);
  });

  it("carries the approval forward when the APPROVER saves a new revision", async () => {
    const supabase = editScenario();
    signIn("super_admin", supabase, APPROVER);

    const result = await saveProposalRevision(PROPOSAL_ID, { title: "Acme Rollout", formData: validState });
    expect(result.ok).toBe(true);
    expect(
      supabase.calls.some(
        (call) => call.table === "client_proposals" && call.op === "update" && call.payload?.status === "draft",
      ),
    ).toBe(false);
  });
});

describe("sendProposalToDocusign", () => {
  it("refuses the maker", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: { id: PROPOSAL_ID, status: "sent" } },
    });
    signIn("super_admin", supabase, MAKER);

    const result = await sendProposalToDocusign(PROPOSAL_ID, null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/approver/i);
  });

  // Before the gate existed this action checked only that the proposal existed,
  // so a raw draft could be put in front of a client for signature.
  it("refuses to send a draft for signature", async () => {
    const supabase = createSupabaseMock({
      "client_proposals:select": { data: { id: PROPOSAL_ID, status: "draft" } },
    });
    signIn("super_admin", supabase, APPROVER);

    const result = await sendProposalToDocusign(PROPOSAL_ID, null);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot be issued to a client/i);
  });
});
