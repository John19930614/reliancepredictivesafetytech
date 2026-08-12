// Server-rendered, read-only proposal document.
//
// Until now the formatted proposal existed ONLY inside the generator iframe: it
// was built client-side from DOM values, never persisted, and never rendered by
// the platform. This component is the platform's own render of
// `client_proposals.form_data` — the same document layout, produced on the
// server from the saved state, so a proposal can be read, linked, printed, and
// shown per-revision without booting the editor.
//
// Two rules this file must keep:
//
//   1. NO `dangerouslySetInnerHTML`. The asset builds its document by
//      concatenating strings into `innerHTML`; that is exactly the sink this
//      module just had a stored-XSS fix for. Everything here goes through JSX so
//      React escapes it.
//   2. Every number comes from `computeProposalTotals()`. A persisted state's
//      numbers are untrusted input and are never rendered directly.

import { Fragment } from "react";
import Image from "next/image";
import type { GeneratorState } from "@/lib/proposals/generator-state";
import type { ProposalTotals } from "@/lib/proposals/pricing";
import { proposalFooterText, type ProposalStatus } from "@/lib/proposals/types";
import {
  buildProposalDocumentModel,
  documentCopy,
  formatDocumentDate,
  type DocumentSignature,
  type DocumentTeamMember,
} from "./proposal-document-model";
import "./proposal-document.css";

export interface ProposalDocumentProps {
  state: GeneratorState;
  /** Computed internally via `computeProposalTotals` when omitted. */
  totals?: ProposalTotals;
  proposal: {
    id: string;
    title: string;
    status: ProposalStatus;
    currentRevision: number;
    validUntil: string | null;
  };
  /** Set when rendering a historical revision rather than the live proposal. */
  revisionNumber?: number;
  /** Bios the page resolved for the people the seller checked on this proposal. */
  team?: DocumentTeamMember[];
  /** Stored seller signature, resolved by the page; null prints a blank line. */
  signature?: DocumentSignature | null;
  className?: string;
}

function SectionHeading({ number, children }: { number: string; children: React.ReactNode }) {
  return (
    <h2 className="rp-doc-h2">
      <span className="rp-doc-secno">{number}</span>
      {children}
    </h2>
  );
}

function PartyCell({ name, lines }: { name: string; lines: string[] }) {
  return (
    <>
      <span className="rp-doc-party-name">{name}</span>
      {lines.map((line, index) => (
        <span className="rp-doc-party-line" key={`${index}-${line}`}>
          {line}
        </span>
      ))}
    </>
  );
}

export function ProposalDocument({
  state,
  totals,
  proposal,
  revisionNumber,
  team,
  signature,
  className,
}: ProposalDocumentProps): React.ReactElement {
  const model = buildProposalDocumentModel({ state, totals, proposal, revisionNumber, team, signature });
  const rootClassName = className ? `rp-doc ${className}` : "rp-doc";

  return (
    <article className={rootClassName} data-proposal-id={proposal.id} lang="en">
      {model.isHistoricalRevision ? (
        <div className="rp-doc-banner" role="note">
          <strong>{model.revisionLabel} — not the current version.</strong>
          <span>
            This is an archived snapshot of the proposal as it stood at {model.revisionLabel?.toLowerCase()}. The
            proposal is now at {model.currentRevisionLabel.toLowerCase()}.
          </span>
        </div>
      ) : null}

      <header className="rp-doc-head">
        <div className="rp-doc-mast-left">
          <Image
            className="rp-doc-seal"
            src="/reliance-seal-transparent.png"
            alt={`${model.wordmark} seal`}
            width={72}
            height={72}
            priority
          />
          <div>
            <div className="rp-doc-wordmark">{model.wordmark}</div>
            <div className="rp-doc-docline">{model.docline}</div>
          </div>
        </div>
        <div className="rp-doc-mast-right">
          <span className="rp-doc-stamp">Proposal</span>
          <span className="rp-doc-conf">Confidential</span>
          <span className="rp-doc-revtag">
            {model.revisionLabel ?? model.currentRevisionLabel} · {model.statusLabel}
          </span>
        </div>
      </header>

      <div className="rp-doc-title-block">
        <h1 className="rp-doc-title">{model.headline}</h1>
        <p className="rp-doc-subtitle">{model.subtitle}</p>
      </div>

      <table className="rp-doc-meta">
        <tbody>
          <tr>
            <td>Prepared For</td>
            <td>
              <PartyCell name={model.preparedFor.name} lines={model.preparedFor.lines} />
            </td>
          </tr>
          <tr>
            <td>Prepared By</td>
            <td>
              <PartyCell name={model.preparedByBlock.name} lines={model.preparedByBlock.lines} />
            </td>
          </tr>
          <tr>
            <td>Proposal Date</td>
            <td>{model.proposalDate}</td>
          </tr>
          <tr>
            <td>Proposal Number</td>
            <td>{model.proposalNumber}</td>
          </tr>
          {model.termLabel ? (
            <tr>
              <td>Engagement Term</td>
              <td>{model.termLabel}</td>
            </tr>
          ) : null}
          <tr>
            <td>Validity</td>
            <td>{model.validity}</td>
          </tr>
        </tbody>
      </table>

      <SectionHeading number="01">Executive Summary</SectionHeading>
      <p className="rp-doc-lead">{model.summary}</p>
      <div className="rp-doc-callout">
        <strong>Proposal Purpose:</strong> {model.purposeCallout}
      </div>

      <SectionHeading number="02">{model.packageHeading}</SectionHeading>
      <p>{model.packageIntro}</p>
      <ul className="rp-doc-pills">
        {model.packagePills.map((pill) => (
          <li className="rp-doc-pill" key={pill.label}>
            {pill.label}: {pill.value}
          </li>
        ))}
      </ul>

      <SectionHeading number="03">{model.scopeHeading}</SectionHeading>
      <p>{model.scopeIntro}</p>
      {model.phaseScope.length > 0 ? (
        model.phaseScope.map((entry) => (
          <div key={entry.heading}>
            <h3 className="rp-doc-h3">{entry.heading}</h3>
            {entry.body ? <p>{entry.body}</p> : null}
          </div>
        ))
      ) : (
        <p className="rp-doc-empty">{documentCopy.noPhases}</p>
      )}
      {model.serviceScope.length > 0 ? (
        model.serviceScope.map((entry) => (
          <div key={entry.heading}>
            <h3 className="rp-doc-h3">{entry.heading}</h3>
            {entry.body ? <p>{entry.body}</p> : null}
          </div>
        ))
      ) : (
        <p className="rp-doc-empty">{documentCopy.noServices}</p>
      )}

      <SectionHeading number="04">Deliverables</SectionHeading>
      <ul className="rp-doc-list">
        {model.deliverables.map((deliverable, index) => (
          <li key={`${index}-${deliverable}`}>{deliverable}</li>
        ))}
      </ul>
      {model.deliverablesCoverage ? <p>{model.deliverablesCoverage}</p> : null}

      <SectionHeading number="05">{model.feesHeading}</SectionHeading>
      <div className="rp-doc-scroll">
        <table className="rp-doc-fee">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Description</th>
              <th scope="col" className="rp-doc-right">
                Qty
              </th>
              <th scope="col" className="rp-doc-right">
                Unit Price
              </th>
              <th scope="col" className="rp-doc-right">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {model.feeGroups.map((group) => (
              <Fragment key={group.label}>
                <tr className="rp-doc-fee-group">
                  <td colSpan={5}>{group.label}</td>
                </tr>
                {group.rows.map((row, index) => (
                  <tr key={`${index}-${row.key}`}>
                    <td>
                      <strong>{row.name || "—"}</strong>
                    </td>
                    <td>{row.desc}</td>
                    <td className="rp-doc-right">{row.qtyLabel}</td>
                    <td className="rp-doc-right">{row.priceLabel}</td>
                    <td className="rp-doc-right">{row.amountLabel}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {model.totalRows.map((row) => (
              <tr
                key={row.label}
                className={
                  row.emphasis === "total"
                    ? "rp-doc-fee-total"
                    : row.emphasis === "deposit"
                      ? "rp-doc-fee-deposit"
                      : undefined
                }
              >
                <td colSpan={4} className="rp-doc-right">
                  {row.label}
                </td>
                <td className="rp-doc-right">{row.value}</td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      <SectionHeading number="06">{model.termHeading}</SectionHeading>
      <p>{model.schedule}</p>
      <ul className="rp-doc-list">
        {model.scheduleSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      <SectionHeading number="07">Client Responsibilities</SectionHeading>
      <ul className="rp-doc-list">
        {model.clientResponsibilities.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <SectionHeading number="08">Assumptions and Exclusions</SectionHeading>
      <p className="rp-doc-prewrap">{model.exclusions}</p>

      {model.team.length > 0 ? (
        <>
          <SectionHeading number="09">Your Team</SectionHeading>
          <div className="rp-doc-team">
            {model.team.map((member) => (
              <section className="rp-doc-bio" key={member.id}>
                <h4>{member.name}</h4>
                {member.title ? <p className="rp-doc-bio-title">{member.title}</p> : null}
                {member.paragraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </>
      ) : null}

      <SectionHeading number={model.team.length > 0 ? "10" : "09"}>Commercial and Legal Terms</SectionHeading>
      <div className="rp-doc-terms">
        {model.terms.map((term) => (
          <section className="rp-doc-term" key={term.heading}>
            <h4>{term.heading}</h4>
            <p>{term.body}</p>
          </section>
        ))}
      </div>

      <SectionHeading number={model.team.length > 0 ? "11" : "10"}>Acceptance Statement</SectionHeading>
      <p>{model.acceptance}</p>
      <div className="rp-doc-sign">
        <div className="rp-doc-sigbox">
          <strong>Client Acceptance</strong>
          <div className="rp-doc-sigline">Authorized Signature / Date</div>
          <div className="rp-doc-sigline">Printed Name / Title</div>
          <div className="rp-doc-sigline">Purchase Order Number, if applicable</div>
        </div>
        <div className="rp-doc-sigbox">
          <strong>Seller Acceptance</strong>
          {model.signature ? (
            <>
              {/* Deliberately a plain <img>: the source is a data: URI resolved
                  from private storage, which next/image cannot optimize, and the
                  same markup has to survive the unauthenticated share route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="rp-doc-sigimage"
                src={model.signature.dataUrl}
                alt={`Signature of ${model.signature.name}`}
              />
              <div className="rp-doc-sigline rp-doc-sigline-signed">
                {model.signature.name}
                {model.signature.title ? ` / ${model.signature.title}` : ""}
                {model.signature.signedOn ? ` · ${formatDocumentDate(model.signature.signedOn)}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="rp-doc-sigline">Authorized Signature / Date</div>
              <div className="rp-doc-sigline">{model.sellerSignature}</div>
            </>
          )}
        </div>
      </div>

      <p className="rp-doc-legal">{model.legalNotice}</p>

      {/* Print-only, repeated on every sheet. See the @media print block in
          proposal-document.css for why this replaces the browser's own footer. */}
      <footer className="rp-doc-printfoot" aria-hidden="true">
        {proposalFooterText()}
      </footer>
    </article>
  );
}
