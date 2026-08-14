import { describe, expect, it } from "vitest";
import {
  acceptedProposal,
  billedInvoices,
  hasDeliveredProposal,
  leadProposal,
  loadDealContext,
  openLegalIssues,
  signatureState,
  type DealEnvelope,
  type DealInvoice,
  type DealLegalIssue,
  type DealProposal,
} from "./deal-context";

const OPP_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";

function proposal(over: Partial<DealProposal> = {}): DealProposal {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    title: "Predictive Maintenance — Year One",
    proposal_number: "P-0042",
    status: "draft",
    proposal_value: 120_000,
    valid_until: "2026-09-30",
    current_revision: 1,
    accepted_at: null,
    declined_at: null,
    decline_reason: null,
    opportunity_id: OPP_ID,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
    ...over,
  };
}

function envelope(over: Partial<DealEnvelope> = {}): DealEnvelope {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    proposal_id: "33333333-3333-4333-8333-333333333333",
    envelope_id: "docusign-1",
    status: "sent",
    recipient_name: "Dana Reyes",
    recipient_email: "dana@example.com",
    sent_at: "2026-08-05T09:00:00Z",
    completed_at: null,
    declined_at: null,
    voided_at: null,
    completed_file_id: null,
    ...over,
  };
}

function invoice(over: Partial<DealInvoice> = {}): DealInvoice {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    invoice_number: "INV-0007",
    status: "draft",
    kind: "deposit",
    total: 24_000,
    currency: "USD",
    issue_date: null,
    due_date: null,
    ...over,
  };
}

function legalIssue(over: Partial<DealLegalIssue> = {}): DealLegalIssue {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    title: "Vendor security questionnaire",
    severity: "Medium",
    status: "Open",
    owner: "Legal",
    due_date: null,
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

describe("leadProposal", () => {
  // A company can carry several proposals against one deal — a superseded draft
  // and the one they actually signed. The signed one is the deal.
  it("prefers the accepted proposal over the newest one", () => {
    const newest = proposal({ id: "a", status: "draft" });
    const signed = proposal({ id: "b", status: "accepted", accepted_at: "2026-08-10T09:00:00Z" });

    expect(leadProposal([newest, signed])?.id).toBe("b");
  });

  it("falls back to the first row when nothing is accepted", () => {
    expect(leadProposal([proposal({ id: "a" }), proposal({ id: "b" })])?.id).toBe("a");
  });

  it("returns null with no proposals at all", () => {
    expect(leadProposal([])).toBeNull();
  });
});

describe("hasDeliveredProposal", () => {
  it("counts anything the client has seen, including a declined one", () => {
    expect(hasDeliveredProposal([proposal({ status: "sent" })])).toBe(true);
    expect(hasDeliveredProposal([proposal({ status: "accepted" })])).toBe(true);
    expect(hasDeliveredProposal([proposal({ status: "declined" })])).toBe(true);
  });

  // A document in internal review has not left the building, whatever the
  // pipeline board says about the step.
  it("does not count a draft, an in-review or an archived proposal", () => {
    expect(hasDeliveredProposal([proposal({ status: "draft" })])).toBe(false);
    expect(hasDeliveredProposal([proposal({ status: "in_review" })])).toBe(false);
    expect(hasDeliveredProposal([proposal({ status: "archived" })])).toBe(false);
    expect(hasDeliveredProposal([])).toBe(false);
  });
});

describe("acceptedProposal", () => {
  it("finds the accepted proposal, or nothing", () => {
    expect(acceptedProposal([proposal({ status: "sent" })])).toBeNull();
    expect(acceptedProposal([proposal({ status: "accepted", id: "x" })])?.id).toBe("x");
  });
});

describe("openLegalIssues", () => {
  it("keeps everything that is not settled", () => {
    const issues = [
      legalIssue({ id: "a", status: "Open" }),
      legalIssue({ id: "b", status: "In Review" }),
      legalIssue({ id: "c", status: "Waiting" }),
    ];

    expect(openLegalIssues(issues).map((issue) => issue.id)).toEqual(["a", "b", "c"]);
  });

  it("drops the two terminal statuses the legal register uses", () => {
    const issues = [legalIssue({ id: "a", status: "Resolved" }), legalIssue({ id: "b", status: "Closed" })];

    expect(openLegalIssues(issues)).toEqual([]);
  });

  // The column is free text with no CHECK, so a value from outside the list is
  // possible. Treating it as open is the safe read: step 9 shows it rather than
  // hiding a blocker nobody chose to hide.
  it("treats an unrecognised status as still open", () => {
    expect(openLegalIssues([legalIssue({ status: "Escalated" })])).toHaveLength(1);
  });
});

describe("signatureState", () => {
  it("reads nothing sent when there are no envelopes", () => {
    expect(signatureState([])).toEqual({ latest: null, sent: false, completed: false, stalled: false });
  });

  it("reads out-for-signature once an envelope has been sent", () => {
    const state = signatureState([envelope()]);

    expect(state.sent).toBe(true);
    expect(state.completed).toBe(false);
    expect(state.stalled).toBe(false);
  });

  it("reads completed only on a completed envelope", () => {
    const state = signatureState([envelope({ status: "completed", completed_at: "2026-08-09T09:00:00Z" })]);

    expect(state.completed).toBe(true);
    expect(state.stalled).toBe(false);
  });

  // Declined and voided both mean the paperwork stopped, and both need somebody
  // to act — so they must not read as "out for signature, waiting".
  it("reads stalled on a declined or voided envelope", () => {
    expect(signatureState([envelope({ status: "declined", declined_at: "2026-08-09T09:00:00Z" })]).stalled).toBe(true);
    expect(signatureState([envelope({ status: "voided", voided_at: "2026-08-09T09:00:00Z" })]).stalled).toBe(true);
  });

  it("reads the newest envelope, which is the one the query returns first", () => {
    const state = signatureState([envelope({ id: "new", status: "sent" }), envelope({ id: "old", status: "voided" })]);

    expect(state.latest?.id).toBe("new");
    expect(state.stalled).toBe(false);
  });
});

describe("billedInvoices", () => {
  it("counts issued and paid, not a draft or a voided invoice", () => {
    const invoices = [
      invoice({ id: "a", status: "draft" }),
      invoice({ id: "b", status: "issued" }),
      invoice({ id: "c", status: "paid" }),
      invoice({ id: "d", status: "void" }),
    ];

    expect(billedInvoices(invoices).map((row) => row.id)).toEqual(["b", "c"]);
  });
});

/* -------------------------------------------------------------------------- */
/* loadDealContext                                                            */
/* -------------------------------------------------------------------------- */

interface StubResult {
  data?: unknown;
  error?: unknown;
}

/** Chainable Supabase stand-in that resolves per table. */
function stubClient(routes: Record<string, StubResult>) {
  const tables: string[] = [];

  function builder(table: string) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      eq: () => api,
      in: () => api,
      is: () => api,
      order: () => api,
      limit: () => api,
      then: (onFulfilled?: any, onRejected?: any) => {
        const route = routes[table] ?? {};
        return Promise.resolve({ data: route.data ?? [], error: route.error ?? null }).then(onFulfilled, onRejected);
      },
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    tables,
    from(table: string) {
      tables.push(table);
      return builder(table);
    },
  };
}

describe("loadDealContext", () => {
  it("gathers the linked proposal and everything hanging off it", async () => {
    const supabase = stubClient({
      client_proposals: { data: [proposal()] },
      client_proposal_approvals: { data: [{ id: "ap", proposal_id: "p", revision_number: 1, decision: "approved", note: null, decided_at: "2026-08-02T09:00:00Z" }] },
      client_proposal_share_links: { data: [{ id: "sl", proposal_id: "p", expires_at: "2026-09-01T09:00:00Z", revoked_at: null, first_viewed_at: null, last_viewed_at: null, view_count: 3 }] },
      client_proposal_docusign_envelopes: { data: [envelope()] },
      client_invoices: { data: [invoice()] },
      company_legal_issues: { data: [legalIssue()] },
    });

    const context = await loadDealContext(supabase, OPP_ID, CLIENT_ID);

    expect(context.proposals).toHaveLength(1);
    expect(context.approvals).toHaveLength(1);
    expect(context.shareLinks).toHaveLength(1);
    expect(context.envelopes).toHaveLength(1);
    expect(context.invoices).toHaveLength(1);
    expect(context.legalIssues).toHaveLength(1);
    expect(context.linkUnavailable).toBe(false);
  });

  // The lifecycle migration has to be rehearsed on staging first, so a deploy
  // can legitimately land ahead of it. A missing column must degrade the panel,
  // not take the page down.
  it("degrades to linkUnavailable when opportunity_id does not exist yet", async () => {
    const supabase = stubClient({
      client_proposals: { error: { code: "42703", message: 'column "opportunity_id" does not exist' } },
    });

    const context = await loadDealContext(supabase, OPP_ID, CLIENT_ID);

    expect(context.linkUnavailable).toBe(true);
    expect(context.proposals).toEqual([]);
    // Nothing further is worth reading once the link column is absent.
    expect(supabase.tables).toEqual(["client_proposals"]);
  });

  // Tolerating a missing column everywhere would render "No approval decision
  // recorded" for a query that never ran — a false statement about a
  // maker-checker gate, made in the one place someone checks it.
  it("does not swallow a missing column on the reads hanging off the proposal", async () => {
    const supabase = stubClient({
      client_proposals: { data: [proposal()] },
      client_proposal_approvals: { error: { code: "42703", message: 'column "decision" does not exist' } },
    });

    await expect(loadDealContext(supabase, OPP_ID, CLIENT_ID)).rejects.toThrow("does not exist");
  });

  it("raises anything that is not a missing relation", async () => {
    const supabase = stubClient({
      client_proposals: { error: { code: "42501", message: "permission denied" } },
    });

    await expect(loadDealContext(supabase, OPP_ID, CLIENT_ID)).rejects.toThrow("permission denied");
  });

  it("skips the company reads when the deal has no company", async () => {
    const supabase = stubClient({ client_proposals: { data: [] } });

    const context = await loadDealContext(supabase, OPP_ID, null);

    expect(context.linkable).toEqual([]);
    expect(context.legalIssues).toEqual([]);
    expect(supabase.tables).not.toContain("company_legal_issues");
  });

  // With no proposal linked there are no ids to filter on, and `.in()` with an
  // empty list would read the whole table.
  it("skips the per-proposal reads when nothing is linked", async () => {
    const supabase = stubClient({ client_proposals: { data: [] } });

    await loadDealContext(supabase, OPP_ID, CLIENT_ID);

    expect(supabase.tables).not.toContain("client_proposal_approvals");
    expect(supabase.tables).not.toContain("client_invoices");
    expect(supabase.tables).not.toContain("client_proposal_docusign_envelopes");
  });
});
