"use client";

// Step 7 — say which proposal prices this deal.
//
// Linking only, never authoring. Drafting, review, sending and acceptance all
// belong to the Proposals module, including its maker-checker gate; duplicating
// any of that here would create a second door into a document that is
// deliberately hard to send.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Unlink } from "lucide-react";
import { linkOpportunityToClient, linkProposalToOpportunity } from "@/app/employee/lifecycle/actions";

export interface LinkableProposal {
  id: string;
  label: string;
}

interface ProposalLinkProps {
  opportunityId: string;
  /** Null until the deal is attached to a company. */
  clientId: string | null;
  clients: Array<{ id: string; name: string }>;
  linkable: LinkableProposal[];
  linked: LinkableProposal[];
  canManage: boolean;
}

export function ProposalLink({
  opportunityId,
  clientId,
  clients,
  linkable,
  linked,
  canManage,
}: ProposalLinkProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosenClient, setChosenClient] = useState("");
  const [chosenProposal, setChosenProposal] = useState(linkable[0]?.id ?? "");

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          router.refresh();
        } else {
          setError(result.error ?? "Could not complete that.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  // A proposal cannot exist without a company, so this is the real gate into
  // step 7 for a deal that came in as an anonymous lead.
  if (!clientId) {
    return (
      <div>
        {error ? (
          <p className="lc-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="lc-body">
          This opportunity is not attached to a company yet. A proposal is written for a company, so that has to come
          first.
        </p>
        <label className="lc-field">
          <span>Company</span>
          <select
            disabled={pending || !canManage}
            onChange={(event) => setChosenClient(event.target.value)}
            value={chosenClient}
          >
            <option value="">Choose a company…</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>
        <div className="lc-form-actions">
          <button
            className="lc-btn lc-btn-primary"
            disabled={pending || !canManage || !chosenClient}
            onClick={() => run(() => linkOpportunityToClient(opportunityId, chosenClient))}
            type="button"
          >
            <Link2 size={15} /> Attach company
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}

      {linked.length > 0 ? (
        <ul className="lc-capacity">
          {linked.map((proposal) => (
            <li className="lc-capacity-row" key={proposal.id}>
              <a className="lc-capacity-name" href={`/employee/proposals/${proposal.id}`}>
                {proposal.label}
              </a>
              <button
                className="lc-btn"
                disabled={pending || !canManage}
                onClick={() => run(() => linkProposalToOpportunity(opportunityId, proposal.id, false))}
                type="button"
              >
                <Unlink size={13} /> Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lc-body">No proposal prices this deal yet.</p>
      )}

      {linkable.length > 0 ? (
        <>
          <label className="lc-field">
            <span>Link an existing proposal</span>
            <select
              disabled={pending || !canManage}
              onChange={(event) => setChosenProposal(event.target.value)}
              value={chosenProposal}
            >
              {linkable.map((proposal) => (
                <option key={proposal.id} value={proposal.id}>
                  {proposal.label}
                </option>
              ))}
            </select>
          </label>
          <div className="lc-form-actions">
            <button
              className="lc-btn lc-btn-primary"
              disabled={pending || !canManage || !chosenProposal}
              onClick={() => run(() => linkProposalToOpportunity(opportunityId, chosenProposal, true))}
              type="button"
            >
              <Link2 size={15} /> Link proposal
            </button>
            <a className="lc-btn" href="/employee/proposals">
              New proposal
            </a>
          </div>
        </>
      ) : (
        <div className="lc-form-actions">
          <a className="lc-btn lc-btn-primary" href="/employee/proposals">
            Build a proposal
          </a>
        </div>
      )}
    </div>
  );
}
