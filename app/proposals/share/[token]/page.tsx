import type { Metadata } from "next";
import { ProposalDocument } from "@/components/proposals/ProposalDocument";
import { formatDocumentDate } from "@/components/proposals/proposal-document-model";
import { isGeneratorState } from "@/lib/proposals/generator-state";
import { computeProposalTotals } from "@/lib/proposals/pricing";
import { resolveDocumentExtras } from "@/lib/proposals/team-server";
import { recordShareLinkView, resolveShareLink } from "@/app/employee/proposals/share-link-server";
import { ProposalAcceptanceForm } from "./ProposalAcceptanceForm";

/**
 * PUBLIC, UNAUTHENTICATED proposal view. The only route in this module that a
 * signed-out visitor can reach.
 *
 * MIDDLEWARE
 *   `proxy.ts` runs `updateSession()` on every non-asset path, but that function
 *   only gates `/employee/*` and `/m/*` (`isPortalRoute`). `/proposals/share/*`
 *   matches neither, so the request falls straight through to
 *   `NextResponse.next()` with the portal security headers attached. No
 *   middleware change is required to reach this page, and none was made — auth
 *   middleware is a CLAUDE.md stop condition.
 *
 * SECURITY MODEL — what a holder of a token can reach
 *   ALLOWED:  the single revision their link is bound to, rendered exactly as
 *             <ProposalDocument> renders it internally, plus an acceptance form.
 *   DENIED:   every other proposal, every other revision of this proposal, the
 *             live working copy, the internal pricing catalog (the generator
 *             iframe is never mounted here), the meta/assignment sidebar,
 *             revision history, owner/value/client_id, any employee identity,
 *             and any authenticated route. The page reads through
 *             `resolveShareLink()`, which returns a hand-built allow-list
 *             projection and nothing else.
 *   REJECTED: unknown, malformed, expired and revoked tokens all render the
 *             SAME panel, so the response cannot be used to probe whether a
 *             proposal exists behind a given token.
 *
 * The page is force-dynamic: a cached render would serve one client's document
 * to whoever asked next, and would silently stop honouring revocation.
 */
export const dynamic = "force-dynamic";

/** No title, no description, no indexing — a share URL is a bearer credential. */
export const metadata: Metadata = {
  title: "Proposal",
  description: "Confidential proposal.",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * ONE message for unknown / malformed / expired / revoked. Being more helpful
 * here (e.g. "this link expired on…") would confirm to an unauthenticated
 * caller that a proposal exists behind the token they guessed.
 */
function UnavailablePanel() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 20px" }}>
      <div className="form-panel">
        <h1 style={{ marginTop: 0 }}>This proposal link is not available</h1>
        <p style={{ color: "var(--portal-muted)" }}>
          The link you followed is not valid. Links are issued for a limited time and can be withdrawn by the sender.
        </p>
        <p style={{ color: "var(--portal-muted)" }}>
          If you believe you should have access, please contact the representative who sent it to you and ask for a
          new link.
        </p>
      </div>
    </main>
  );
}

export default async function ProposalSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const resolved = await resolveShareLink(token);
  if (resolved.state !== "valid" || !resolved.view || !resolved.link) return <UnavailablePanel />;

  const view = resolved.view;

  // A revision whose stored state is not a valid generator state cannot be
  // rendered, and must not fall back to the live working copy — that would show
  // the client something other than what the link was bound to.
  const state = isGeneratorState(view.formData) ? view.formData : null;
  if (!state) return <UnavailablePanel />;

  // Best-effort; a failed counter never blocks the client's read.
  await recordShareLinkView(resolved.link);

  const totals = computeProposalTotals(state);

  // Resolved server-side and inlined as a data: URI — this reader is
  // unauthenticated and cannot fetch the private signature object itself.
  const { team, signature } = await resolveDocumentExtras(state, view.acceptedAt ?? null);

  const openForAcceptance = view.status === "sent" && !view.acceptedAt && !view.declinedAt;

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 64px" }}>
      <div className="rp-doc-noprint" style={{ marginBottom: 16 }}>
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem", margin: 0 }}>
          Confidential — prepared for the named recipient. Revision {view.revisionNumber}
          {view.revisionSavedAt ? ` · issued ${formatDocumentDate(view.revisionSavedAt)}` : ""}. Use your
          browser&apos;s Print / Save as PDF (Ctrl or Cmd + P) to keep a copy.
        </p>
      </div>

      {/*
        `currentRevision` is set to the SHARED revision on purpose. Passing the
        live revision number would print an "archived snapshot — the proposal is
        now at revision N" banner on a client-facing page, leaking internal
        revision churn. For this reader, the revision their link is bound to IS
        the document, and it is labelled as such.
      */}
      <ProposalDocument
        state={state}
        totals={totals}
        team={team}
        signature={signature}
        proposal={{
          id: view.proposalId,
          title: view.title,
          status: view.status,
          currentRevision: view.revisionNumber,
          validUntil: view.validUntil,
        }}
      />

      {openForAcceptance ? (
        <ProposalAcceptanceForm token={token} revisionNumber={view.revisionNumber} />
      ) : view.acceptedAt ? (
        <div className="form-panel rp-doc-noprint" style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Acceptance recorded</h2>
          <p style={{ color: "var(--portal-muted)" }}>
            This proposal was accepted on {formatDocumentDate(view.acceptedAt)}
            {view.acceptedByName ? ` by ${view.acceptedByName}` : ""}. Contact your representative if anything needs
            to change.
          </p>
        </div>
      ) : (
        <div className="form-panel rp-doc-noprint" style={{ marginTop: 24 }}>
          <h2 style={{ marginTop: 0 }}>Not open for acceptance</h2>
          <p style={{ color: "var(--portal-muted)" }}>
            This proposal is no longer open for online acceptance. Please contact your representative.
          </p>
        </div>
      )}
    </main>
  );
}
