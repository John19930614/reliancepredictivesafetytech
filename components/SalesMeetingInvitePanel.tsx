"use client";

import { useState, type FormEvent } from "react";
import { Copy, Mail, Presentation, Send, Video } from "lucide-react";
import {
  createSalesMeetingInvite,
  type SalesMeetingInviteResult,
} from "@/app/employee/sales-meetings/actions";

type SalesMeetingInvitePanelProps = {
  defaultTitle?: string;
  defaultRecipients?: string;
  clientId?: string | null;
  demoRequestId?: string | null;
  compact?: boolean;
};

function parseRecipients(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*<([^>]+)>$/);

      if (match) {
        return {
          name: match[1].trim(),
          email: match[2].trim(),
        };
      }

      return { email: entry };
    });
}

export function SalesMeetingInvitePanel({
  defaultTitle = "SafetyDocs360 sales presentation",
  defaultRecipients = "",
  clientId = null,
  demoRequestId = null,
  compact = false,
}: SalesMeetingInvitePanelProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [recipients, setRecipients] = useState(defaultRecipients);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<SalesMeetingInviteResult | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    setResult(null);

    try {
      const inviteResult = await createSalesMeetingInvite({
        title,
        recipients: parseRecipients(recipients),
        clientId,
        demoRequestId,
      });
      setResult(inviteResult);
      setStatus(inviteResult.emailConfigured ? "Invite emails sent. Links are ready below." : "Email is not configured, so the links are ready to send manually.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create sales meeting invite.");
    } finally {
      setSending(false);
    }
  }

  async function copyLink(value: string) {
    await navigator.clipboard.writeText(value);
    setStatus("Link copied.");
  }

  return (
    <section className={compact ? "sales-meeting-panel sales-meeting-panel-compact" : "sales-meeting-panel"}>
      <div className="sales-meeting-panel-head">
        <span>
          <Video size={17} />
        </span>
        <div>
          <strong>Outside video invite</strong>
          <p>Send guest-safe video links for sales presentations.</p>
        </div>
      </div>
      <form className="sales-meeting-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={compact ? "compact-meeting-title" : "meeting-title"}>Meeting title</label>
          <input
            id={compact ? "compact-meeting-title" : "meeting-title"}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="SafetyDocs360 sales presentation"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={compact ? "compact-meeting-recipients" : "meeting-recipients"}>Outside recipients</label>
          <textarea
            id={compact ? "compact-meeting-recipients" : "meeting-recipients"}
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            placeholder="buyer@company.com, safety.lead@company.com"
            required
          />
        </div>
        <button className="button button-primary" type="submit" disabled={sending}>
          <Send size={17} />
          {sending ? "Sending..." : "Create and send"}
        </button>
      </form>
      {status ? <div className="sales-meeting-status">{status}</div> : null}
      {result ? (
        <div className="sales-meeting-links">
          <a className="button button-light" href={result.hostUrl} target="_blank" rel="noreferrer">
            <Presentation size={17} />
            Open host room
          </a>
          {result.invites.map((item) => (
            <div className="sales-meeting-link-row" key={item.invite.id}>
              <div>
                <strong>{item.invite.recipient_email}</strong>
                <span>{item.emailSent ? "Email sent" : item.error || "Manual send needed"}</span>
              </div>
              <button className="icon-button" type="button" onClick={() => void copyLink(item.joinUrl)} aria-label="Copy guest link">
                <Copy size={16} />
              </button>
              <a className="icon-button" href={`mailto:${item.invite.recipient_email}?subject=${encodeURIComponent(result.meeting.title)}&body=${encodeURIComponent(item.joinUrl)}`} aria-label="Email guest link">
                <Mail size={16} />
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
