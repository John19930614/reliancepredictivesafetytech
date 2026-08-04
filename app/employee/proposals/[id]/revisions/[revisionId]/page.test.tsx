// Route tests for the single-revision read-only view.
//
// Two properties this route owns and no pure test can reach:
//
//   1. the revision is looked up by BOTH proposal_id AND id, so a valid-but-
//      unrelated revision uuid cannot be rendered under this proposal's heading;
//   2. the "archived snapshot" banner appears exactly when the revision being
//      rendered is not the proposal's current one — the difference between a
//      reader thinking they hold the live offer and knowing they do not.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/proposals/access", () => ({ getProposalAccess: vi.fn() }));

import { getProposalAccess } from "@/lib/proposals/access";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import ProposalRevisionPage from "./page";

const getAccessMock = vi.mocked(getProposalAccess);

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "44444444-4444-4444-8444-444444444444";

const savedState: GeneratorState = {
  v: 1,
  fields: { clientCompany: "Northwind Construction", packageSelect: "starter" },
  phases: [],
  services: [],
};

interface QueryRecord {
  table: string;
  filters: Array<[string, unknown]>;
}

function createSupabaseMock(routes: Record<string, () => { data: unknown }>) {
  const calls: QueryRecord[] = [];

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
      maybeSingle: () => Promise.resolve({ data: routes[record.table]?.().data ?? null, error: null }),
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

interface Scenario {
  proposal?: Record<string, unknown> | null;
  revision?: Record<string, unknown> | null;
  canRead?: boolean;
  currentRevision?: number;
  revisionNumber?: number;
  formData?: unknown;
}

function signIn(scenario: Scenario = {}) {
  const supabase = createSupabaseMock({
    client_proposals: () => ({
      data:
        scenario.proposal === undefined
          ? {
              id: PROPOSAL_ID,
              title: "Northwind Construction — Platform Proposal",
              status: "sent",
              valid_until: "2026-05-01",
              current_revision: scenario.currentRevision ?? 5,
            }
          : scenario.proposal,
    }),
    client_proposal_revisions: () => ({
      data:
        scenario.revision === undefined
          ? {
              id: REVISION_ID,
              proposal_id: PROPOSAL_ID,
              revision_number: scenario.revisionNumber ?? 2,
              title: "Northwind Construction — Platform Proposal",
              change_note: "Repriced after site walk",
              status_at_save: "draft",
              form_data: scenario.formData === undefined ? savedState : scenario.formData,
              created_at: "2026-03-09T12:00:00.000Z",
            }
          : scenario.revision,
    }),
  });

  getAccessMock.mockResolvedValue({
    supabase,
    userId: "user-1",
    role: "operations_manager",
    canRead: scenario.canRead ?? true,
    canManage: true,
    isAdmin: false,
  });

  return supabase;
}

function openPage(id = PROPOSAL_ID, revisionId = REVISION_ID) {
  return ProposalRevisionPage({ params: Promise.resolve({ id, revisionId }) });
}

async function renderPage(id?: string, revisionId?: string) {
  return render(await openPage(id, revisionId));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalRevisionPage — access and scoping", () => {
  it("404s a user whose role cannot read proposals", async () => {
    signIn({ canRead: false });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it.each([
    ["proposal id", "not-a-uuid", REVISION_ID],
    ["revision id", PROPOSAL_ID, "nope"],
  ])("404s a malformed %s before querying", async (_label, id, revisionId) => {
    const supabase = signIn();
    await expect(openPage(id, revisionId)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(supabase.calls).toHaveLength(0);
  });

  it("looks the revision up by BOTH proposal and revision id", async () => {
    // A revision id alone would let anyone who learns one uuid render it under
    // an arbitrary proposal's heading.
    const supabase = signIn();
    await renderPage();
    const revisionQuery = supabase.calls.find((call) => call.table === "client_proposal_revisions");
    expect(revisionQuery?.filters).toEqual([
      ["proposal_id", PROPOSAL_ID],
      ["id", REVISION_ID],
    ]);
  });

  it("404s when the revision does not belong to this proposal", async () => {
    signIn({ revision: null });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the parent proposal is unreadable", async () => {
    signIn({ proposal: null });
    await expect(openPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("ProposalRevisionPage — historical snapshot marking", () => {
  it("banners an older revision as an archived snapshot", async () => {
    signIn({ revisionNumber: 2, currentRevision: 5 });
    await renderPage();

    const banner = document.querySelector(".rp-doc-banner");
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Revision 2 — not the current version.");
    expect(banner?.textContent).toContain("revision 5");
  });

  it("shows no banner when the revision being viewed IS the current one", async () => {
    signIn({ revisionNumber: 5, currentRevision: 5 });
    await renderPage();
    expect(document.querySelector(".rp-doc-banner")).toBeNull();
  });

  it("prints the saved date deterministically rather than in the server's locale", async () => {
    signIn();
    await renderPage();
    expect(screen.getByText(/Saved March 9, 2026 · Repriced after site walk/)).toBeInTheDocument();
  });

  it("explains a revision that predates form_data persistence instead of rendering a blank document", async () => {
    signIn({ formData: null });
    await renderPage();
    expect(document.querySelector(".rp-doc")).toBeNull();
    expect(screen.getByText(/This revision has no saved document state/)).toBeInTheDocument();
  });

  it("renders the document itself from the revision's own state, not the proposal's", async () => {
    signIn();
    await renderPage();
    // starter package came from the REVISION's form_data.
    expect(screen.getByText("Starter Compliance Platform")).toBeInTheDocument();
  });
});
