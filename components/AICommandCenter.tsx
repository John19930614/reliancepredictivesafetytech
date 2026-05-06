"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Archive,
  Bell,
  Bot,
  CheckCircle2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  approveWorkflowProposal,
  archiveNotification,
  generateMyWorkflowNotifications,
  markNotificationRead,
  rejectWorkflowProposal,
} from "@/app/employee/ai/actions";
import { Message, MessageResponse } from "@/components/ai-elements/message";
import type { CommandSnapshot } from "@/lib/ai/command-context";
import type { PortalNotification, WorkflowActionProposal } from "@/lib/company-data";

type AICommandCenterProps = {
  snapshot: CommandSnapshot;
  notifications: PortalNotification[];
  proposals: WorkflowActionProposal[];
  canManageProposals: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function priorityClass(priority: string) {
  return `ai-priority ai-priority-${priority}`;
}

export function AICommandCenter({ snapshot, notifications, proposals, canManageProposals }: AICommandCenterProps) {
  const [input, setInput] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ai-command" }),
  });

  const working = status === "submitted" || status === "streaming";
  const sourceOptions = useMemo(
    () => ["all", ...Array.from(new Set(snapshot.priorityItems.map((item) => item.sourceLabel)))],
    [snapshot.priorityItems],
  );
  const filteredPriorityItems = useMemo(
    () =>
      sourceFilter === "all"
        ? snapshot.priorityItems
        : snapshot.priorityItems.filter((item) => item.sourceLabel === sourceFilter),
    [snapshot.priorityItems, sourceFilter],
  );
  const suggestedPrompt = useMemo(() => {
    const topItem = snapshot.priorityItems[0];
    return topItem
      ? `Summarize my top priority, explain the risk, and draft the safest next action for ${topItem.title}.`
      : "Summarize today's workflow status and recommend the next three actions.";
  }, [snapshot.priorityItems]);

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (!text || working) {
      return;
    }

    void sendMessage({ text });
    setInput("");
  }

  return (
    <div className="ai-command-workspace">
      <section className="ai-command-hero">
        <div>
          <div className="eyebrow">AI Command Center</div>
          <h1>Workflow assistant and notifications</h1>
          <MessageResponse>{snapshot.summary}</MessageResponse>
        </div>
        <form action={generateMyWorkflowNotifications}>
          <button className="button button-primary" type="submit">
            <RefreshCw size={18} />
            Scan Workflows
          </button>
        </form>
      </section>

      <section className="ai-metric-grid" aria-label="AI workflow metrics">
        {[
          ["Unread", snapshot.counts.unreadNotifications],
          ["New requests", snapshot.counts.newDemoRequests],
          ["High ops", snapshot.counts.highPriorityOperations],
          ["Legal due", snapshot.counts.openLegalIssues],
          ["HR review", snapshot.counts.hrReviewItems],
          ["Proposals", snapshot.counts.pendingWorkflowProposals],
        ].map(([label, value]) => (
          <article className="ai-metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className="ai-command-grid">
        <section className="ai-panel ai-priority-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">AI-ranked</span>
              <h2>Priority queue</h2>
            </div>
            <div className="ai-filter-control">
              <Sparkles size={18} />
              <select
                aria-label="Filter priority queue source"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source === "all" ? "All sources" : source}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="ai-list">
            {filteredPriorityItems.length === 0 ? (
              <div className="empty-state">No urgent workflow items are currently visible.</div>
            ) : (
              filteredPriorityItems.map((item) => (
                <Link className="ai-list-row" href={item.actionHref} key={`${item.sourceType}-${item.sourceId}`}>
                  <span className={priorityClass(item.priority)}>{item.priority}</span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.sourceLabel} - {item.label} - {item.status}
                    </small>
                    <small>{item.detail}</small>
                    <span className="ai-meta-row">
                      {item.owner ? <span>Owner {item.owner}</span> : <span>No owner</span>}
                      {item.dueDate ? <span>Due {formatDate(item.dueDate)}</span> : <span>No due date</span>}
                      {item.reviewRequired ? <span>Review required</span> : <span>Action item</span>}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="ai-panel ai-chat-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Assistant</span>
              <h2>Ask about workflows</h2>
            </div>
            <Bot size={18} />
          </div>
          <div className="ai-chat-window">
            {messages.length === 0 ? (
              <button className="ai-suggestion" onClick={() => setInput(suggestedPrompt)} type="button">
                {suggestedPrompt}
              </button>
            ) : (
              messages.map((message) => <Message key={message.id} message={message} />)
            )}
            {error ? <div className="portal-alert-error success-box">{error.message}</div> : null}
          </div>
          <form className="ai-chat-form" onSubmit={submitMessage}>
            <input
              aria-label="Message the AI workflow assistant"
              placeholder="Ask for a digest, next action, proposal, or follow-up draft"
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
        <section className="ai-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Notifications</span>
              <h2>Unread alerts</h2>
            </div>
            <Bell size={18} />
          </div>
          <div className="ai-list">
            {notifications.length === 0 ? (
              <div className="empty-state">No unread AI workflow notifications.</div>
            ) : (
              notifications.map((notification) => (
                <article className="ai-notification-row" key={notification.id}>
                  <div>
                    <span className={priorityClass(notification.priority)}>{notification.priority}</span>
                    <h3>{notification.title}</h3>
                    <p>{notification.body}</p>
                    {notification.ai_summary ? <small>{notification.ai_summary}</small> : null}
                    <small>{formatDate(notification.created_at)}</small>
                  </div>
                  <div className="ai-row-actions">
                    {notification.action_href ? (
                      <Link className="button button-light" href={notification.action_href}>
                        Open
                      </Link>
                    ) : null}
                    <form action={markNotificationRead.bind(null, notification.id)}>
                      <button className="icon-button" aria-label="Mark notification read" type="submit">
                        <CheckCircle2 size={17} />
                      </button>
                    </form>
                    <form action={archiveNotification.bind(null, notification.id)}>
                      <button className="icon-button" aria-label="Archive notification" type="submit">
                        <Archive size={17} />
                      </button>
                    </form>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="ai-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Human approval</span>
              <h2>Workflow proposals</h2>
            </div>
            <Mail size={18} />
          </div>
          <div className="ai-list">
            {proposals.length === 0 ? (
              <div className="empty-state">No pending AI workflow proposals.</div>
            ) : (
              proposals.map((proposal) => (
                <article className="ai-proposal-row" key={proposal.id}>
                  <div>
                    <span className={priorityClass(proposal.risk_level)}>{proposal.risk_level}</span>
                    <h3>{proposal.title}</h3>
                    <p>{proposal.description}</p>
                    <small>
                      {proposal.status} - {proposal.action_type} - {proposal.target_table}
                    </small>
                    <pre>{JSON.stringify(proposal.proposed_patch, null, 2)}</pre>
                  </div>
                  {canManageProposals ? (
                    <div className="ai-proposal-actions">
                      <form action={approveWorkflowProposal}>
                        <input name="proposal_id" type="hidden" value={proposal.id} />
                        <input aria-label="Approval notes" name="approval_notes" placeholder="Approval notes" />
                        <button className="button button-primary" type="submit">
                          <CheckCircle2 size={17} />
                          Approve
                        </button>
                      </form>
                      <form action={rejectWorkflowProposal}>
                        <input name="proposal_id" type="hidden" value={proposal.id} />
                        <input aria-label="Rejection notes" name="approval_notes" placeholder="Rejection notes" />
                        <button className="button button-secondary" type="submit">
                          <XCircle size={17} />
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : (
                    <small>Admin approval required.</small>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
