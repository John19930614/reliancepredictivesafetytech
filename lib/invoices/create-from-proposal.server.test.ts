import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposalBillingLineKey } from "@/lib/invoices/proposal-billing";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/audit/events", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  buildDataAuditEvent: vi.fn((action, entityType, entityId, actorUserId, summary, before, after) => ({
    action,
    entity_type: entityType,
    entity_id: entityId,
    actor_user_id: actorUserId,
    summary,
    before,
    after,
  })),
}));

import { createInvoiceFromProposal } from "@/lib/invoices/create-from-proposal";

interface Scenario {
  proposal: Record<string, unknown> | null;
  revision?: Record<string, unknown> | null;
  existingInvoice?: Record<string, unknown> | null;
  invoices?: Record<string, unknown>[];
  lines?: Record<string, unknown>[];
  rpcResult?: unknown;
}

function testDb(scenario: Scenario) {
  const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const rpc = vi.fn().mockResolvedValue({
    data: scenario.rpcResult ?? [{ invoice_id: "invoice-1", invoice_number: "ACME-INV-0001" }],
    error: null,
  });

  class Query implements PromiseLike<{ data: unknown; error: null }> {
    filters: Array<[string, string, unknown]> = [];

    constructor(readonly table: string) {
      queries.push(this);
    }

    select() { return this; }
    eq(column: string, value: unknown) { this.filters.push(["eq", column, value]); return this; }
    neq(column: string, value: unknown) { this.filters.push(["neq", column, value]); return this; }
    in(column: string, value: unknown) { this.filters.push(["in", column, value]); return this; }

    async maybeSingle() {
      if (this.table === "client_proposals") return { data: scenario.proposal, error: null };
      if (this.table === "client_proposal_revisions") return { data: scenario.revision ?? null, error: null };
      if (this.table === "client_invoices") return { data: scenario.existingInvoice ?? null, error: null };
      return { data: null, error: null };
    }

    then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const data = this.table === "client_invoices"
        ? scenario.invoices ?? []
        : this.table === "client_invoice_line_items"
          ? scenario.lines ?? []
          : [];
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
    }
  }

  const db = { from: (table: string) => new Query(table), rpc };
  return { db, queries, rpc };
}

const revisionId = "11111111-2222-4333-8444-555555555555";
const generationKey = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const acceptedState = {
  v: 1,
  fields: { packageSelect: "none", discountPct: 10, taxPct: 8 },
  phases: [],
  services: [
    { type: "service", key: "custom", name: "Accepted consulting", desc: "Signed scope", unit: "Hour", qty: 10, price: 100 },
  ],
};

beforeEach(() => {
  mocks.createAdminClient.mockReset();
  mocks.recordAuditEvent.mockClear();
});

describe("createInvoiceFromProposal", () => {
  it("refuses billing when accepted_revision_id has been cleared", async () => {
    const { db, rpc, queries } = testDb({
      proposal: { id: "proposal-1", client_id: "client-1", accepted_revision_id: null },
    });
    mocks.createAdminClient.mockReturnValue(db);

    await expect(createInvoiceFromProposal({
      proposalId: "proposal-1",
      generationKey,
      selections: [{ lineKey: proposalBillingLineKey(revisionId, 0), quantity: 1 }],
      actorUserId: "user-1",
      actorRole: "admin",
    })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/accepted revision/i) });

    expect(queries.some((query) => query.table === "client_proposal_revisions")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("loads only the exact accepted revision and sends server-derived line snapshots to the atomic RPC", async () => {
    const lineKey = proposalBillingLineKey(revisionId, 0);
    const { db, rpc, queries } = testDb({
      proposal: {
        id: "proposal-1",
        client_id: "client-1",
        title: "Accepted proposal",
        proposal_number: "RPS-1",
        accepted_revision_id: revisionId,
      },
      revision: { id: revisionId, proposal_id: "proposal-1", form_data: acceptedState },
    });
    mocks.createAdminClient.mockReturnValue(db);

    await expect(createInvoiceFromProposal({
      proposalId: "proposal-1",
      generationKey,
      selections: [{ lineKey, quantity: 1 }],
      actorUserId: "user-1",
      actorRole: "admin",
    })).resolves.toMatchObject({ ok: true, invoiceId: "invoice-1", invoiceNumber: "ACME-INV-0001" });

    const revisionQuery = queries.find((query) => query.table === "client_proposal_revisions");
    expect(revisionQuery?.filters).toEqual(expect.arrayContaining([
      ["eq", "id", revisionId],
      ["eq", "proposal_id", "proposal-1"],
    ]));
    expect(rpc).toHaveBeenCalledWith("generate_client_invoice_from_proposal", {
      p_proposal_id: "proposal-1",
      p_revision_id: revisionId,
      p_created_by: "user-1",
      p_generation_key: generationKey,
      p_lines: [{
        line_key: lineKey,
        description: "Service\nAccepted consulting",
        quantity: 1,
        unit_amount: 90,
        line_total: 90,
        unit: "Hour",
        qty_basis: "hour",
        sort_order: 10,
      }],
      p_tax_amount: 7.2,
    });
  });

  it("returns an existing request before its committed quantities can invalidate an idempotent retry", async () => {
    const { db, rpc } = testDb({
      proposal: { id: "proposal-1", client_id: "client-1", accepted_revision_id: revisionId },
      revision: { id: revisionId, proposal_id: "proposal-1", form_data: acceptedState },
      existingInvoice: { id: "invoice-existing", invoice_number: "ACME-INV-0001" },
    });
    mocks.createAdminClient.mockReturnValue(db);

    await expect(createInvoiceFromProposal({
      proposalId: "proposal-1",
      generationKey,
      selections: [{ lineKey: proposalBillingLineKey(revisionId, 0), quantity: 2 }],
      actorUserId: "user-1",
      actorRole: "admin",
    })).resolves.toEqual({ ok: true, invoiceId: "invoice-existing", invoiceNumber: "ACME-INV-0001" });

    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});
