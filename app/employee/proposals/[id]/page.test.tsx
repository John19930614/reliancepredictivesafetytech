// Route tests for the read-only proposal document view.
//
// CLAUDE.md requires an RBAC test for a new module/page. Two gates live in this
// route and nowhere else, so no pure test can cover them:
//
//   1. the 404 wall — unauthenticated, unauthorised, malformed-uuid, missing-row
//   2. the Edit affordance — `canManage && canEditProposalContent(status).ok`
//
// A regression in (2) is not a crash; it is a button that appears on a `sent`
// proposal and takes a seller into an editor that will refuse to save.
//
// The Supabase stand-in follows the chainable-builder style already used by
// app/employee/proposals/actions.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/employee/proposals/x",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/proposals/access", () => ({ getProposalAccess: vi.fn() }));

vi.mock("@/app/employee/proposals/actions", () => ({
  createProposal: vi.fn(async () => ({ ok: true })),
  deleteProposal: vi.fn(async () => ({ ok: true })),
  duplicateProposal: vi.fn(async () => ({ ok: true, proposalId: "dup-1" })),
  restoreProposalRevision: vi.fn(async () => ({ ok: true })),
  saveProposalDraft: vi.fn(async () => ({ ok: true })),
  saveProposalRevision: vi.fn(async () => ({ ok: true, revisionNumber: 6 })),
  setProposalStatus: vi.fn(async () => ({ ok: true })),
  updateProposalMeta: vi.fn(async () => ({ ok: true })),
}));

import { getProposalAccess } from "@/lib/proposals/access";
import { canEditProposalContent } from "@/lib/proposals/policy";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import type { ProposalStatus } from "@/lib/proposals/types";
import ProposalDetailPage from "./page";

const getAccessMock = vi.mocked(getProposalAccess);

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CLIENT_ID = "33333333-3333-4333-8333-333333333333";

const savedState: GeneratorState = {
  v: 1,
  fields: { clientCompany: "Northwind Construction", packageSelect: "professional", annualPrice: 12000 },
  phases: [],
  services: [],
};

interface QueryRecord {
  table: string;
  filters: Array<[string, unknown]>;
}

type Route = (query: QueryRecord) => { data: unknown };

/** Chainable PostgREST stand-in: every call is a select, routed by table name. */
function createSupabaseMock(routes: Record<string, Route>) {
  const calls: QueryRecord[] = [];

  function result(record: QueryRecord) {
    const route = routes[record.table];
    return { data: route ? route(record).data : null, error: null };
  }

  function builder(record: QueryRecord) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const api: any = {
      select: () => api,
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return api;
      },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve(result(record)),
      single: () => Promise.resolve(result(record)),
      then: (onFulfilled?: any, onRejected?: any) => Promise.resolve(result(record)).then(onFulfilled, onRejected),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return api;
  }

  return {
    calls,
    from(table: string) {
      const record: QueryRecord = { table, filters: [] };
      calls.push(record);
      return builder(record);
    },
  };
}

function proposalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PROPOSAL_ID,
    client_id: CLIENT_ID,
    title: "Northwind Construction — Platform Proposal",
    status: "draft" as ProposalStatus,
    owner: "Dana Reyes",
    proposal_value: 14883.75,
    valid_until: "2026-05-01",
    summary: null,
    body_markdown: null,
    current_revision: 5,
    form_data: savedState,
    ...overrides,
  };
}

interface Scenario {
  proposal?: Record<string, unknown> | null;
  revisions?: unknown[];
  clients?: { id: string; name: string }[];
  canRead?: boolean;
  canManage?: boolean;
  isAdmin?: boolean;
  supabaseNull?: boolean;
}

function signIn(scenario: Scenario = {}) {
  const clients = scenario.clients ?? [{ id: CLIENT_ID, name: "Northwind Construction" }];
  const supabase = createSupabaseMock({
    client_proposals: () => ({ data: scenario.proposal === undefined ? proposalRow() : scenario.proposal }),
    client_proposal_revisions: () => ({ data: scenario.revisions ?? [] }),
    // Two shapes hit this table: the capped list, and the single lookup that
    // re-attaches an assigned company the cap left out. The assigned company
    // exists in the table either way — being missing from `clients` models the
    // 500-row cap, not a deleted record.
    company_clients: (query) =>
      query.filters.length > 0
        ? { data: query.filters[0][1] === CLIENT_ID ? { id: CLIENT_ID, name: "Northwind Construction" } : null }
        : { data: clients },
  });

  getAccessMock.mockResolvedValue({
    supabase: scenario.supabaseNull ? null : supabase,
    userId: "user-1",
    role: "operations_manager",
    canRead: scenario.canRead ?? true,
    canManage: scenario.canManage ?? true,
    isAdmin: scenario.isAdmin ?? false,
  });

  return supabase;
}

function openPage(id = PROPOSAL_ID, locked?: string) {
  return ProposalDetailPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(locked === undefined ? {} : { locked }),
  });
}

async function renderPage(id = PROPOSAL_ID, locked?: string) {
  return render(await openPage(id, locked));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalDetailPage — the 404 wall", () => {
  it("404s a signed-out visitor rather than querying anything", async () => {
    signIn({ supabaseNull: true });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("404s a user whose role cannot read proposals", async () => {
    signIn({ canRead: false });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s a malformed id before it can reach PostgREST as a 22P02", async () => {
    const supabase = signIn();
    await expect(openPage("not-a-uuid")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(supabase.calls).toHaveLength(0);
  });

  it("404s when the id is well formed but no readable row comes back", async () => {
    signIn({ proposal: null });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("scopes the proposal query to the id in the URL", async () => {
    const supabase = signIn();
    await renderPage();
    const proposalQuery = supabase.calls.find((call) => call.table === "client_proposals");
    expect(proposalQuery?.filters).toEqual([["id", PROPOSAL_ID]]);
  });
});

describe("ProposalDetailPage — the Edit affordance", () => {
  it("offers the editor on a draft to a user who can manage proposals", async () => {
    signIn({ proposal: proposalRow({ status: "draft" }) });
    await renderPage();
    expect(screen.getByRole("link", { name: /Edit in generator/ })).toHaveAttribute(
      "href",
      `/employee/proposals/${PROPOSAL_ID}/edit`,
    );
  });

  it("offers the editor on an in_review proposal, which still mints revisions", async () => {
    signIn({ proposal: proposalRow({ status: "in_review" }) });
    await renderPage();
    expect(screen.getByRole("link", { name: /Edit in generator/ })).toBeInTheDocument();
  });

  const lockedStatuses: ProposalStatus[] = ["sent", "accepted", "declined", "archived"];

  it.each(lockedStatuses)("hides the editor on a %s proposal and explains the lock", async (status) => {
    signIn({ proposal: proposalRow({ status }) });
    await renderPage();

    expect(screen.queryByRole("link", { name: /Edit in generator/ })).toBeNull();
    expect(screen.getByText(canEditProposalContent(status).reason as string)).toBeInTheDocument();
  });

  it("hides the editor from a read-only user even on a draft", async () => {
    signIn({ proposal: proposalRow({ status: "draft" }), canManage: false });
    await renderPage();

    expect(screen.queryByRole("link", { name: /Edit in generator/ })).toBeNull();
    // No lock explanation either — nothing is locked, they simply cannot manage.
    expect(screen.queryByText(/Reopen it as a draft/)).toBeNull();
  });

  it("explains a bounced /edit visit that was refused on permission", async () => {
    signIn();
    await renderPage(PROPOSAL_ID, "permission");
    expect(
      screen.getByText("You do not have permission to edit proposals, so the editor was not opened."),
    ).toBeInTheDocument();
  });

  it("explains a bounced /edit visit that was refused on status", async () => {
    signIn({ proposal: proposalRow({ status: "accepted" }) });
    await renderPage(PROPOSAL_ID, "1");
    expect(screen.getByText(canEditProposalContent("accepted").reason as string)).toBeInTheDocument();
  });

  it("passes the admin flag through to the destructive control", async () => {
    signIn({ isAdmin: true });
    await renderPage();
    expect(screen.getByRole("button", { name: /Delete proposal/ })).toBeInTheDocument();
  });
});

describe("ProposalDetailPage — document rendering", () => {
  it("renders the document from validated saved state", async () => {
    signIn();
    await renderPage();
    expect(document.querySelector(".rp-doc")).not.toBeNull();
    expect(screen.getByText("Professional Safety Intelligence")).toBeInTheDocument();
  });

  it("shows an empty state instead of the document when nothing has been saved", async () => {
    signIn({ proposal: proposalRow({ form_data: null }) });
    await renderPage();
    expect(document.querySelector(".rp-doc")).toBeNull();
    expect(screen.getByText(/This proposal has no saved generator content yet/)).toBeInTheDocument();
  });

  it("refuses to render a hand-edited form_data blob that fails the shape guard", async () => {
    // The guard is what stops malformed JSON reaching the renderer; a proposal
    // with junk state must read as "nothing saved", not crash the route.
    signIn({ proposal: proposalRow({ form_data: { v: "one", fields: "nope" } }) });
    await renderPage();
    expect(document.querySelector(".rp-doc")).toBeNull();
    expect(screen.getByText(/This proposal has no saved generator content yet/)).toBeInTheDocument();
  });

  it("re-attaches the assigned company when the capped dropdown left it out", async () => {
    const supabase = signIn({ clients: [{ id: OTHER_CLIENT_ID, name: "Cascade Industrial" }] });
    await renderPage();

    // The cap query plus the targeted re-lookup.
    expect(supabase.calls.filter((call) => call.table === "company_clients")).toHaveLength(2);
    const select = document.getElementById("proposal-client") as HTMLSelectElement;
    // Without the re-lookup the select would read "Unassigned" and a stray edit
    // would silently detach the proposal from its company.
    expect(select.value).toBe(CLIENT_ID);
  });
});
