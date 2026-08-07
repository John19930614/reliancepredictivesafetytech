import { ExternalLink } from "lucide-react";
import { sourcingLeadStaleDays, type SourcingLeadRow } from "@/lib/talent-engine/types";
import { SourcingLeadActions } from "./SourcingLeadActions";
import { formatRate, formatRelativeTime, joinMeta } from "./format";

/**
 * One web-sourced lead awaiting a human decision.
 *
 * Server component — it renders markup and hands the decision to the small
 * client island at the bottom.
 *
 * WHAT THIS CARD IS FOR: to let a reviewer disbelieve the agent. Everything the
 * Sourcing Agent asserted is shown next to the public URL it came from, so the
 * claim and its evidence are one glance apart. The AI summary is labelled as
 * the agent's words rather than presented as fact, and the source opens in a
 * new tab so leaving to check it never costs the reviewer their place in the
 * queue.
 *
 * PRIVACY: the fields below are the whole of what types.ts permits a lead to
 * carry — published professional detail and nothing else. There is deliberately
 * no free-text passthrough here that could smuggle a protected attribute onto
 * the screen.
 */

/** A lead sitting unreviewed longer than this reads as stale (types.ts). */
const staleMs = sourcingLeadStaleDays * 24 * 60 * 60 * 1000;

/**
 * `source_url` arrives from an agent that read the open web, so it is treated
 * as untrusted input: anything that is not plain http(s) is rendered as text,
 * never as an href. A `javascript:` or `data:` URL in that column must not
 * become a clickable script in an operator's browser.
 */
function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const sourceLabelLimit = 52;

/** `https://www.example.com/jobs/12345?ref=x` → `example.com/jobs/12345`. */
function sourceLabel(value: string): string {
  let label = value;
  try {
    const parsed = new URL(value);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    label = `${parsed.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    label = value;
  }
  return label.length > sourceLabelLimit ? `${label.slice(0, sourceLabelLimit - 1)}…` : label;
}

export function SourcingLeadCard({
  lead,
  canPropose,
  canSetRate,
  now,
}: {
  lead: SourcingLeadRow;
  canPropose: boolean;
  canSetRate: boolean;
  /** The page's single clock, in ms — passed in so every card ages identically. */
  now: number;
}) {
  const created = new Date(lead.created_at).getTime();
  const isStale = lead.status === "new" && !Number.isNaN(created) && now - created > staleMs;
  const href = safeHttpUrl(lead.source_url);

  const meta = joinMeta([lead.organization, lead.location, lead.vertical]);
  const certs = lead.certifications.filter((cert) => String(cert).trim().length > 0);
  const hasRateSignal = lead.rate_signal !== null;
  const rateCaption = lead.lead_type === "candidates" ? "pay signal" : "bill signal";

  return (
    <article className={isStale ? "talent-lead talent-lead-stale" : "talent-lead"}>
      <div className="talent-lead-top">
        <div className="talent-lead-id">
          <h3 className="talent-lead-title">{lead.title}</h3>
          <p className="talent-lead-meta">{meta || "No organisation or location published"}</p>
        </div>

        <div className="talent-lead-rate">
          <span className="talent-rate-value">{hasRateSignal ? formatRate(lead.rate_signal) : "—"}</span>
          <span className="talent-rate-unit">{hasRateSignal ? rateCaption : "no rate published"}</span>
        </div>
      </div>

      <p className="talent-lead-badges">
        {/* Status is spelled out, never carried by colour alone — and a
            dismissed lead does not wear the gold "needs a decision" tint. */}
        <span
          className={
            lead.status === "new" ? "talent-lead-badge talent-lead-badge-status" : "talent-lead-badge"
          }
        >
          {lead.status === "new" ? "Awaiting review" : lead.status === "dismissed" ? "Dismissed" : "Accepted"}
        </span>
        <span className="talent-lead-badge">Found {formatRelativeTime(lead.created_at, now)}</span>
        {isStale ? (
          <span className="talent-lead-badge talent-lead-badge-stale">
            Stale · unreviewed for over {sourcingLeadStaleDays} days
          </span>
        ) : null}
        {lead.status === "dismissed" && lead.reviewed_at ? (
          <span className="talent-lead-badge">Dismissed {formatRelativeTime(lead.reviewed_at, now)}</span>
        ) : null}
      </p>

      {certs.length > 0 ? (
        <ul className="talent-lead-certs" aria-label={`Certifications claimed by ${lead.title}`}>
          {certs.map((cert) => (
            <li className="talent-lead-cert" key={cert}>
              {cert}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={lead.summary ? "talent-ai-note" : "talent-ai-note talent-ai-note-empty"}>
        <strong>Sourcing Agent:</strong>{" "}
        {lead.summary?.trim() ? lead.summary : "The agent surfaced this lead without writing a summary."}
      </p>

      <p className="talent-lead-source">
        <span className="talent-lead-source-key">Source</span>
        {href ? (
          <a
            aria-label={`Open the public source for ${lead.title} in a new tab`}
            className="talent-lead-source-link"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
            title={lead.source_url}
          >
            {sourceLabel(lead.source_url)}
            <ExternalLink aria-hidden="true" size={12} />
            <span className="talent-visually-hidden"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="talent-lead-source-plain" title={lead.source_url}>
            {sourceLabel(lead.source_url)} · not a web address this page will link to
          </span>
        )}
      </p>

      <SourcingLeadActions
        canPropose={canPropose}
        canSetRate={canSetRate}
        hasRateSignal={hasRateSignal}
        leadId={lead.id}
        leadTitle={lead.title}
        leadType={lead.lead_type}
        status={lead.status}
      />
    </article>
  );
}
