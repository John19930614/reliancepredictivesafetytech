// RBAC / gating tests for the Proposal Builder's interactive surfaces.
//
// CLAUDE.md's testing matrix requires an RBAC test for a new module/page. The
// gates themselves are pure and already unit-tested in lib/proposals/policy.ts;
// what was untested is whether the UI HONOURS them — a control panel that
// renders an enabled <select> for a `sent` proposal fails the gate in the only
// place a user can see, no matter how correct the policy module is.
//
// Every expectation below is derived from lib/proposals/policy.ts, which is the
// authority:
//   canEditProposalMeta    — clientId / proposalValue / validUntil, draft only
//   canEditProposalContent — draft + in_review (restore, editor saves)
//   canTransitionProposal  — which status buttons may exist at all
// `owner` is deliberately outside the meta gate (internal routing, not part of
// the offer) and must stay editable on every status.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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

// Server Actions cannot run under vitest; the panel only needs them to resolve.
vi.mock("@/app/employee/proposals/actions", () => ({
  createProposal: vi.fn(async () => ({ ok: true })),
  deleteProposal: vi.fn(async () => ({ ok: true })),
  duplicateProposal: vi.fn(async () => ({ ok: true, proposalId: "dup-1" })),
  loadProposalDocumentExtras: vi.fn(async () => ({ team: [], signature: null })),
  restoreProposalRevision: vi.fn(async () => ({ ok: true })),
  saveProposalDraft: vi.fn(async () => ({ ok: true })),
  saveProposalRevision: vi.fn(async () => ({ ok: true, revisionNumber: 6 })),
  setProposalStatus: vi.fn(async () => ({ ok: true })),
  updateProposalMeta: vi.fn(async () => ({ ok: true })),
}));

import {
  deleteProposal,
  loadProposalDocumentExtras,
  restoreProposalRevision,
  setProposalStatus,
  updateProposalMeta,
} from "@/app/employee/proposals/actions";
import { canEditProposalContent, canEditProposalMeta } from "@/lib/proposals/policy";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import type { ProposalRevisionRow, ProposalStatus } from "@/lib/proposals/types";
import {
  ProposalControlPanel,
  ProposalRevisionHistory,
  ProposalWorkspace,
  type WorkspaceProposal,
} from "./ProposalWorkspace";

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CLIENT_ID = "33333333-3333-4333-8333-333333333333";

const clients = [
  { id: CLIENT_ID, name: "Northwind Construction" },
  { id: OTHER_CLIENT_ID, name: "Cascade Industrial" },
];

function proposalFixture(status: ProposalStatus): WorkspaceProposal {
  return {
    id: PROPOSAL_ID,
    client_id: CLIENT_ID,
    title: "Northwind Construction — Platform Proposal",
    status,
    owner: "Dana Reyes",
    proposal_value: 14883.75,
    valid_until: "2026-05-01",
    summary: null,
    body_markdown: null,
    current_revision: 5,
    form_data: null,
  };
}

function renderPanel(status: ProposalStatus, isAdmin = false) {
  return render(<ProposalControlPanel proposal={proposalFixture(status)} clients={clients} isAdmin={isAdmin} />);
}

/** The three commercial/assignment controls the meta gate covers, plus owner. */
function assignmentFields() {
  return {
    client: document.getElementById("proposal-client") as HTMLSelectElement,
    owner: document.getElementById("proposal-owner") as HTMLInputElement,
    value: document.getElementById("proposal-value") as HTMLInputElement,
    validUntil: document.getElementById("proposal-valid-until") as HTMLInputElement,
  };
}

/** Button labels inside the panel section headed `heading`. */
function buttonsUnder(heading: string): string[] {
  const title = screen.getByRole("heading", { name: heading });
  const panel = title.parentElement as HTMLElement;
  return within(panel)
    .queryAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProposalControlPanel — commercial field gate", () => {
  it("leaves the company, value, and expiry editable on a draft", () => {
    renderPanel("draft");
    const fields = assignmentFields();

    expect(canEditProposalMeta("draft").ok).toBe(true);
    expect(fields.client).toBeEnabled();
    expect(fields.value).toBeEnabled();
    expect(fields.validUntil).toBeEnabled();
    expect(fields.owner).toBeEnabled();
  });

  // `in_review` is in this list on purpose: content edits are still allowed
  // there (they mint a reviewable revision) but re-pricing under a reviewer is
  // exactly what canEditProposalMeta() exists to stop.
  const lockedStatuses: ProposalStatus[] = ["in_review", "sent", "accepted", "declined", "archived"];

  it.each(lockedStatuses)("freezes the company, value, and expiry on a %s proposal", (status) => {
    renderPanel(status);
    const fields = assignmentFields();
    const gate = canEditProposalMeta(status);

    expect(gate.ok).toBe(false);
    expect(fields.client).toBeDisabled();
    expect(fields.value).toBeDisabled();
    expect(fields.validUntil).toBeDisabled();

    // Owner is internal routing, not part of the offer — reassigning a closed
    // deal's owner stays legitimate.
    expect(fields.owner).toBeEnabled();

    // The user is told WHY, rather than left with three dead controls.
    expect(screen.getByText(gate.reason as string)).toBeInTheDocument();
  });

  it("does not explain a lock that is not in force", () => {
    renderPanel("draft");
    expect(screen.queryByText(/is locked|are locked/)).toBeNull();
  });

  it("writes the company assignment through updateProposalMeta while the proposal is a draft", async () => {
    renderPanel("draft");
    await userEvent.selectOptions(assignmentFields().client, OTHER_CLIENT_ID);
    expect(updateProposalMeta).toHaveBeenCalledWith(PROPOSAL_ID, { clientId: OTHER_CLIENT_ID });
  });
});

describe("ProposalControlPanel — status transitions", () => {
  // Exactly the transitions lib/proposals/policy.ts permits, in the panel's
  // display order (forward-moving first, reopen/archive last).
  const expected: Record<ProposalStatus, string[]> = {
    draft: ["Send for review", "Mark as sent", "Archive"],
    in_review: ["Mark as sent", "Back to draft", "Archive"],
    sent: ["Mark accepted", "Mark declined", "Reopen for revision", "Archive"],
    accepted: ["Archive"],
    declined: ["Reopen for revision", "Archive"],
    archived: ["Restore to draft"],
  };

  it.each(Object.keys(expected) as ProposalStatus[])("offers only the legal moves from %s", (status) => {
    renderPanel(status);
    expect(buttonsUnder("Workflow")).toEqual(expected[status]);
  });

  it("never offers a forward move on an accepted proposal", () => {
    renderPanel("accepted");
    const labels = buttonsUnder("Workflow");
    expect(labels).not.toContain("Mark as sent");
    expect(labels).not.toContain("Mark declined");
    expect(labels).not.toContain("Send for review");
  });

  it("dispatches the target status the button advertises", async () => {
    renderPanel("sent");
    await userEvent.click(screen.getByRole("button", { name: /Mark accepted/ }));
    expect(setProposalStatus).toHaveBeenCalledWith(PROPOSAL_ID, "accepted");
  });
});

describe("ProposalControlPanel — admin-only destructive action", () => {
  it("shows the delete control to an admin", () => {
    renderPanel("draft", true);
    expect(screen.getByRole("button", { name: /Delete proposal/ })).toBeInTheDocument();
  });

  it("hides the delete control from a non-admin", () => {
    renderPanel("draft", false);
    expect(screen.queryByRole("button", { name: /Delete proposal/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Danger zone" })).toBeNull();
  });

  it("requires an explicit confirmation before deleting", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel("draft", true);

    await userEvent.click(screen.getByRole("button", { name: /Delete proposal/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteProposal).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /Delete proposal/ }));
    expect(deleteProposal).toHaveBeenCalledWith(PROPOSAL_ID);
    confirmSpy.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */

const revisionState: GeneratorState = {
  v: 1,
  fields: { clientCompany: "Northwind Construction", discountPct: 10 },
  phases: [],
  services: [],
};

function revision(overrides: Partial<ProposalRevisionRow> & Pick<ProposalRevisionRow, "id">): ProposalRevisionRow {
  return {
    proposal_id: PROPOSAL_ID,
    revision_number: 1,
    title: "Northwind Construction — Platform Proposal",
    summary: null,
    body_markdown: null,
    change_note: null,
    status_at_save: "draft",
    form_data: revisionState,
    created_at: "2026-03-09T12:00:00.000Z",
    ...overrides,
  };
}

const revisions: ProposalRevisionRow[] = [
  revision({ id: "rev-5", revision_number: 5, change_note: "Repriced after site walk" }),
  revision({ id: "rev-4", revision_number: 4, form_data: { v: 1, fields: {}, phases: [], services: [] } }),
  revision({ id: "rev-3", revision_number: 3, form_data: null }),
];

function renderHistory(status: ProposalStatus, overrides: { currentState?: GeneratorState | null } = {}) {
  return render(
    <ProposalRevisionHistory
      proposalId={PROPOSAL_ID}
      status={status}
      currentRevision={5}
      currentState={overrides.currentState === undefined ? revisionState : overrides.currentState}
      revisions={revisions}
    />,
  );
}

/** The table row for revision `n`. */
function revisionRow(n: number): HTMLTableRowElement {
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("tbody tr"));
  const row = rows.find((candidate) => candidate.cells[0]?.textContent?.trim() === `v${n}`);
  if (!row) throw new Error(`No history row for v${n}.`);
  return row;
}

describe("ProposalRevisionHistory — restore gate", () => {
  it("offers restore on a draft, where a new revision may be minted", () => {
    renderHistory("draft");
    expect(canEditProposalContent("draft").ok).toBe(true);
    expect(within(revisionRow(4)).getByRole("button", { name: /Restore/ })).toBeEnabled();
  });

  it("disables restore on a sent proposal and says why", () => {
    renderHistory("sent");
    const gate = canEditProposalContent("sent");
    const button = within(revisionRow(4)).getByRole("button", { name: /Restore/ });

    expect(gate.ok).toBe(false);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", gate.reason as string);
  });

  it("offers no restore for the revision that is already current", () => {
    renderHistory("draft");
    expect(within(revisionRow(5)).queryByRole("button", { name: /Restore/ })).toBeNull();
  });

  it("warns that restoring replaces the working copy before calling the action", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHistory("draft");

    await userEvent.click(within(revisionRow(4)).getByRole("button", { name: /Restore/ }));
    expect(confirmSpy.mock.calls[0][0]).toContain("Restore v4?");
    expect(restoreProposalRevision).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(within(revisionRow(4)).getByRole("button", { name: /Restore/ }));
    expect(restoreProposalRevision).toHaveBeenCalledWith(PROPOSAL_ID, "rev-4");
    confirmSpy.mockRestore();
  });
});

describe("ProposalRevisionHistory — comparison", () => {
  it("offers a comparison only for older revisions that actually stored generator data", () => {
    renderHistory("draft");
    expect(within(revisionRow(4)).getByRole("button", { name: /Compare with current/ })).toBeInTheDocument();
    // v5 is the current revision, v3 stored no form_data.
    expect(within(revisionRow(5)).queryByRole("button", { name: /Compare with current/ })).toBeNull();
    expect(within(revisionRow(3)).queryByRole("button", { name: /Compare with current/ })).toBeNull();
  });

  it("offers no comparison at all when the proposal itself has no saved state", () => {
    renderHistory("draft", { currentState: null });
    expect(screen.queryByRole("button", { name: /Compare with current/ })).toBeNull();
  });

  it("toggles the diff open and closed", async () => {
    renderHistory("draft");
    const toggle = () => within(revisionRow(4)).getByRole("button", { name: /Compare with current|Hide diff/ });

    await userEvent.click(toggle());
    expect(screen.getByRole("heading", { name: /v4 compared with the current document/ })).toBeInTheDocument();
    // The rendered diff is the real one: v4 saved an empty state, so every field
    // of the current state reads as an addition.
    expect(screen.getByText("Client Company")).toBeInTheDocument();

    await userEvent.click(toggle());
    expect(screen.queryByRole("heading", { name: /compared with the current document/ })).toBeNull();
  });

  it("renders an honest empty state when there are no revisions", () => {
    render(
      <ProposalRevisionHistory
        proposalId={PROPOSAL_ID}
        status="draft"
        currentRevision={1}
        currentState={null}
        revisions={[]}
      />,
    );
    expect(screen.getByText("No revisions recorded yet.")).toHaveClass("empty-state");
    expect(document.querySelector("table")).toBeNull();
  });

  it("dashes a revision that was saved without a change note", () => {
    renderHistory("draft");
    expect(revisionRow(5).cells[2].textContent).toBe("Repriced after site walk");
    expect(revisionRow(4).cells[2].textContent).toBe("—");
  });
});

describe("ProposalWorkspace — editor save gate", () => {
  it("enables both saves on a draft", () => {
    render(<ProposalWorkspace proposal={proposalFixture("draft")} assignedClient={null} />);
    expect(screen.getByRole("button", { name: /Save revision/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Save draft now/ })).toBeEnabled();
  });

  it("disables both saves and explains the lock when the proposal is not editable", () => {
    const gate = canEditProposalContent("accepted");
    render(<ProposalWorkspace proposal={proposalFixture("accepted")} assignedClient={null} />);

    expect(screen.getByRole("button", { name: /Save revision/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save draft now/ })).toBeDisabled();
    expect(screen.getByText(gate.reason as string)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Preview fidelity                                                            */
/*                                                                             */
/* The badge over the right-hand pane claims "exactly what the client sees".   */
/* Everything else in the document is derived from the generator state the     */
/* iframe posts up, but bios and the signature image are database-backed, so   */
/* the preview has to fetch them — and when it did not, ticking a teammate on  */
/* the left changed nothing on the right and every section number after 09     */
/* differed between the editor and the document view.                          */
/* -------------------------------------------------------------------------- */

const TEAM_MEMBER_ID = "44444444-4444-4444-8444-444444444444";

function stateWithTeam(members: string, signer: string): GeneratorState {
  return {
    v: 1,
    fields: {
      clientCompany: "Northwind Construction",
      packageSelect: "professional",
      proposalTeamMembers: members,
      proposalSigner: signer,
    },
    phases: [],
    services: [],
  };
}

function editorProposal(formData: GeneratorState | null): WorkspaceProposal {
  return { ...proposalFixture("draft"), form_data: formData };
}

const roster = [{ userId: TEAM_MEMBER_ID, name: "Dana Reyes", title: "Head of Safety", hasSignature: true }];

describe("ProposalWorkspace — live preview matches the team picker", () => {
  it("renders the selected teammate's bio and signature in the preview document", async () => {
    vi.mocked(loadProposalDocumentExtras).mockResolvedValueOnce({
      team: [
        {
          id: TEAM_MEMBER_ID,
          name: "Dana Reyes",
          title: "Head of Safety",
          paragraphs: ["Twenty years leading field safety programs."],
        },
      ],
      signature: { dataUrl: "data:image/png;base64,AAAA", name: "Dana Reyes", title: "Head of Safety", signedOn: null },
    });

    render(
      <ProposalWorkspace
        proposal={editorProposal(stateWithTeam(TEAM_MEMBER_ID, TEAM_MEMBER_ID))}
        assignedClient={null}
        roster={roster}
      />,
    );

    expect(loadProposalDocumentExtras).toHaveBeenCalledWith([TEAM_MEMBER_ID], TEAM_MEMBER_ID);

    // Section 09 exists in the preview, with the bio prose and the signature
    // image — the two things the document view resolves server-side.
    expect(await screen.findByRole("heading", { name: /Your Team/ })).toBeInTheDocument();
    expect(screen.getByText("Twenty years leading field safety programs.")).toBeInTheDocument();
    expect(screen.getByAltText("Signature of Dana Reyes")).toBeInTheDocument();
  });

  it("skips the lookup and the team section when nobody is selected", async () => {
    render(<ProposalWorkspace proposal={editorProposal(stateWithTeam("", ""))} assignedClient={null} roster={roster} />);

    // Waiting on something the preview always renders proves the document has
    // painted, so the absence below is a real absence rather than a race.
    expect(await screen.findByRole("heading", { name: /Executive Summary/ })).toBeInTheDocument();
    expect(loadProposalDocumentExtras).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /Your Team/ })).not.toBeInTheDocument();
  });

  it("tells the seller where the picker lands in the document", () => {
    render(<ProposalWorkspace proposal={editorProposal(stateWithTeam("", ""))} assignedClient={null} roster={roster} />);
    expect(screen.getByText(/section 09, Your Team/)).toBeInTheDocument();
  });
});
