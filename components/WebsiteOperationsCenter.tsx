"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Activity, AlertTriangle, Bot, CheckCircle2, ExternalLink, FileText, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { scanWebsiteOperations } from "@/app/employee/website-operations/actions";
import { Message, MessageResponse } from "@/components/ai-elements/message";
import type { WebsiteContentItem, WebsiteOperationsEvent, WorkflowActionProposal } from "@/lib/company-data";
import type { WebsiteOperationsSnapshot } from "@/lib/website-operations";

type WebsiteOperationsCenterProps = {
  snapshot: WebsiteOperationsSnapshot;
  proposals: WorkflowActionProposal[];
};

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not scanned";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string) {
  return `ai-priority ai-priority-${status === "ok" || status === "approved" ? "low" : status === "error" ? "high" : "medium"}`;
}

function brokenLinkCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

async function websiteAiFetch(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Website AI request failed with status ${response.status}.`;

    try {
      const payload = (await response.clone().json()) as { error?: string };
      message = payload.error || message;
    } catch {
      message = (await response.text()) || message;
    }

    throw new Error(message);
  }

  return response;
}

export function WebsiteOperationsCenter({ snapshot, proposals }: WebsiteOperationsCenterProps) {
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isScanning, startScanTransition] = useTransition();
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/ai-website-command", fetch: websiteAiFetch }), []);
  const { messages, sendMessage, status, error, clearError } = useChat({
    transport,
    onError: (nextError) => setLocalError(nextError.message),
  });
  const working = status === "submitted" || status === "streaming";
  const suggestedPrompt =
    snapshot.counts.unhealthyRoutes > 0
      ? "Summarize the website scan issues and draft the safest approval-gated next actions."
      : "Summarize website operations and suggest the next three low-risk improvements.";

  function runScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanNotice(null);

    startScanTransition(async () => {
      try {
        const result = await scanWebsiteOperations();
        setScanNotice(
          `Scan complete: ${result.checks.length} routes checked, ${result.unhealthyCount} route reviews, ${result.brokenLinkCount} link warnings, ${result.contentGapCount} content gaps.`,
        );
      } catch (nextError) {
        setScanNotice(nextError instanceof Error ? nextError.message : "Website scan failed.");
      }
    });
  }

  async function sendAssistantMessage(text: string) {
    if (!text || working) {
      return;
    }

    setLocalError(null);
    clearError();
    setInput("");

    try {
      await sendMessage({ text });
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : "The Website AI request failed.");
    }
  }

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendAssistantMessage(input.trim());
  }

  return (
    <div className="ai-command-workspace website-ops-workspace">
      <section className="ai-command-hero">
        <div>
          <div className="eyebrow">Website Operations AI</div>
          <h1>Website manager cockpit</h1>
          <MessageResponse>{snapshot.summary}</MessageResponse>
        </div>
        <form onSubmit={runScan}>
          <button className="button button-primary" disabled={isScanning} type="submit">
            <RefreshCw size={18} />
            {isScanning ? "Scanning" : "Scan Website"}
          </button>
        </form>
      </section>

      {scanNotice ? <div className="success-box ai-status-box">{scanNotice}</div> : null}

      <section className="ai-metric-grid" aria-label="Website operations metrics">
        {[
          ["Routes", snapshot.counts.managedRoutes],
          ["Scanned", snapshot.counts.latestScannedRoutes],
          ["Route reviews", snapshot.counts.unhealthyRoutes],
          ["Link warnings", snapshot.counts.brokenLinks],
          ["Content gaps", snapshot.counts.contentGaps],
          ["New requests", snapshot.counts.recentDemoRequests],
          ["Stale leads", snapshot.counts.staleLeads],
          ["Drafts", snapshot.counts.pendingContentDrafts],
          ["Proposals", snapshot.counts.pendingWebsiteProposals],
          ["Events", snapshot.counts.recentEvents],
        ].map(([label, value]) => (
          <article className="ai-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="ai-panel website-ops-deployment">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Deployment guardrail</span>
            <h2>{snapshot.deployment.label}</h2>
          </div>
          <ShieldAlert size={18} />
        </div>
        <p>{snapshot.deployment.detail}</p>
      </section>

      <div className="ai-command-grid">
        <section className="ai-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Managed routes</span>
              <h2>Health and SEO checks</h2>
            </div>
            <Activity size={18} />
          </div>
          <div className="ai-list">
            {snapshot.latestChecks.length === 0 ? (
              <div className="empty-state">Run the first website scan to create route health records.</div>
            ) : (
              snapshot.latestChecks.map((check) => (
                <article className="ai-notification-row website-ops-row" key={check.id}>
                  <div>
                    <span className={statusClass(check.status)}>{check.status}</span>
                    <h3>{check.route_path}</h3>
                    <p>
                      HTTP {check.status_code ?? "n/a"} - {check.response_ms ?? 0} ms - {formatDate(check.checked_at)}
                    </p>
                    <small>{check.h1 ? `H1: ${check.h1}` : "Missing H1"}</small>
                    <small>
                      {brokenLinkCount(check.broken_links)} link warning{brokenLinkCount(check.broken_links) === 1 ? "" : "s"} -{" "}
                      {check.content_gaps.length} content gap{check.content_gaps.length === 1 ? "" : "s"}
                    </small>
                  </div>
                  <a className="icon-button" href={check.target_url} rel="noreferrer" target="_blank" aria-label={`Open ${check.route_path}`}>
                    <ExternalLink size={17} />
                  </a>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="ai-panel ai-chat-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Assistant</span>
              <h2>Ask the website manager</h2>
            </div>
            <Bot size={18} />
          </div>
          <div className="ai-chat-window">
            {messages.length === 0 ? (
              <button className="ai-suggestion" disabled={working} onClick={() => void sendAssistantMessage(suggestedPrompt)} type="button">
                {suggestedPrompt}
              </button>
            ) : (
              messages.map((message) => <Message key={message.id} message={message} />)
            )}
            {working ? <div className="success-box ai-status-box">Thinking...</div> : null}
            {localError || error ? <div className="portal-alert-error success-box ai-status-box">{localError ?? error?.message}</div> : null}
          </div>
          <form className="ai-chat-form" onSubmit={submitMessage}>
            <input
              aria-label="Message the Website Operations AI"
              placeholder="Ask for a scan summary, content draft, or proposal"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className="button button-primary" disabled={working || !input.trim()} type="submit">
              <Send size={17} />
              {working ? "Thinking" : "Send"}
            </button>
          </form>
        </section>
      </div>

      <div className="ai-command-grid">
        <ContentQueue contentItems={snapshot.contentItems as WebsiteContentItem[]} />
        <section className="ai-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Human approval</span>
              <h2>Website proposals</h2>
            </div>
            <CheckCircle2 size={18} />
          </div>
          <div className="ai-list">
            {proposals.length === 0 ? (
              <div className="empty-state">No pending website proposals.</div>
            ) : (
              proposals.map((proposal) => (
                <Link className="ai-list-row" href={`/employee/ai#workflow-proposal-${proposal.id}`} key={proposal.id}>
                  <span className={statusClass(proposal.risk_level)}>{proposal.risk_level}</span>
                  <span>
                    <strong>{proposal.title}</strong>
                    <small>{proposal.action_type} - {proposal.target_table}</small>
                    <small>{proposal.description}</small>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="ai-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Audit</span>
            <h2>Recent website automation events</h2>
          </div>
          <AlertTriangle size={18} />
        </div>
        <div className="ai-list website-event-list">
          {(snapshot.recentEvents as WebsiteOperationsEvent[]).length === 0 ? (
            <div className="empty-state">No website automation events yet.</div>
          ) : (
            (snapshot.recentEvents as WebsiteOperationsEvent[]).map((event) => (
              <article className="ai-notification-row" key={event.id}>
                <div>
                  <span className={statusClass(event.risk_level)}>{event.risk_level}</span>
                  <h3>{event.title}</h3>
                  {event.body ? <p>{event.body}</p> : null}
                  <small>
                    {event.event_type} - {formatDate(event.created_at)}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ContentQueue({ contentItems }: { contentItems: WebsiteContentItem[] }) {
  return (
    <section className="ai-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Content control</span>
          <h2>Draft and approved copy</h2>
        </div>
        <FileText size={18} />
      </div>
      <div className="ai-list">
        {contentItems.length === 0 ? (
          <div className="empty-state">No website content overrides yet. The public site is using static fallback copy.</div>
        ) : (
          contentItems.map((item) => (
            <article className="ai-notification-row website-ops-row" key={item.id}>
              <div>
                <span className={statusClass(item.status)}>{item.status}</span>
                <h3>{item.title}</h3>
                <p>{item.approved_value || item.draft_value || item.fallback_value}</p>
                <small>
                  {item.content_key} - {item.route_path} - updated {formatDate(item.updated_at)}
                </small>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
