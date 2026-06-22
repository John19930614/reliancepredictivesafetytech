"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Archive,
  Forward,
  Inbox,
  MailCheck,
  MailOpen,
  MailPlus,
  RefreshCcw,
  Reply,
  ReplyAll,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  assignEmployeeMailbox,
  markEmployeeMailRead,
  moveEmployeeMailMessage,
  saveEmployeeMailDraft,
  sendEmployeeMail,
  type EmployeeMailSendInput,
} from "@/app/employee/mail/actions";
import type { Database } from "@/lib/supabase/types";

type EmployeeMailbox = Database["public"]["Tables"]["employee_mailboxes"]["Row"];
type EmployeeMailMessage = Database["public"]["Tables"]["employee_mail_messages"]["Row"];
type EmployeeMailRecipient = Database["public"]["Tables"]["employee_mail_recipients"]["Row"];

type MailFolder = "inbox" | "sent" | "drafts" | "archive" | "trash";

type MailAdminEmployee = {
  user_id: string;
  display_name: string | null;
  legal_name: string | null;
  email: string | null;
  mailbox: EmployeeMailbox | null;
};

type EmployeeMailCenterProps = {
  mailbox: EmployeeMailbox | null;
  messages: EmployeeMailMessage[];
  recipients: EmployeeMailRecipient[];
  initialFolder?: string;
  initialMessageId?: string;
  canManageMailboxes: boolean;
  employees: MailAdminEmployee[];
};

const folders: Array<{ key: MailFolder; label: string; icon: typeof Inbox }> = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: Save },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
];

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getSenderLabel(message: EmployeeMailMessage) {
  return message.from_name || message.from_address;
}

function ensureSubjectPrefix(subject: string, prefix: "Re" | "Fwd") {
  return subject.toLowerCase().startsWith(`${prefix.toLowerCase()}:`) ? subject : `${prefix}: ${subject}`;
}

function serializeRecipients(recipients: EmployeeMailRecipient[]) {
  return recipients
    .filter((recipient) => recipient.recipient_type !== "bcc")
    .map((recipient) => recipient.name ? `${recipient.name} <${recipient.address}>` : recipient.address)
    .join(", ");
}

export function EmployeeMailCenter({
  mailbox,
  messages,
  recipients,
  initialFolder,
  initialMessageId,
  canManageMailboxes,
  employees,
}: EmployeeMailCenterProps) {
  const safeInitialFolder = folders.some((folder) => folder.key === initialFolder) ? (initialFolder as MailFolder) : "inbox";
  const [activeFolder, setActiveFolder] = useState<MailFolder>(safeInitialFolder);
  const [selectedMessageId, setSelectedMessageId] = useState(initialMessageId ?? messages.find((message) => message.folder === safeInitialFolder)?.id ?? null);
  const [query, setQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [compose, setCompose] = useState<EmployeeMailSendInput | null>(null);

  const recipientsByMessageId = useMemo(() => {
    const map = new Map<string, EmployeeMailRecipient[]>();

    for (const recipient of recipients) {
      map.set(recipient.message_id, [...(map.get(recipient.message_id) ?? []), recipient]);
    }

    return map;
  }, [recipients]);

  const filteredMessages = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    return messages.filter((message) => {
      const messageRecipients = recipientsByMessageId.get(message.id) ?? [];
      const matchesFolder = message.folder === activeFolder;
      const matchesQuery =
        !cleanQuery ||
        [message.subject, message.plain_body, message.from_address, message.from_name, ...messageRecipients.map((recipient) => recipient.address)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(cleanQuery));

      return matchesFolder && matchesQuery;
    });
  }, [activeFolder, messages, query, recipientsByMessageId]);

  const folderCounts = useMemo(
    () =>
      new Map(
        folders.map((folder) => [
          folder.key,
          messages.filter((message) => message.folder === folder.key).length,
        ]),
      ),
    [messages],
  );

  const unreadInboxCount = messages.filter((message) => message.folder === "inbox" && !message.read_at).length;
  const selectedMessage = messages.find((message) => message.id === selectedMessageId) ?? filteredMessages[0] ?? null;
  const selectedRecipients = selectedMessage ? recipientsByMessageId.get(selectedMessage.id) ?? [] : [];

  function openMessage(message: EmployeeMailMessage) {
    setSelectedMessageId(message.id);

    if (!message.read_at && message.folder === "inbox") {
      startTransition(async () => {
        await markEmployeeMailRead(message.id, true);
      });
    }
  }

  function runAction(action: () => Promise<unknown>, success: string) {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        await action();
        setStatusMessage(success);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Mail action failed.");
      }
    });
  }

  function startReply(message: EmployeeMailMessage, replyAll = false) {
    const ccRecipients = replyAll
      ? selectedRecipients
          .filter((recipient) => recipient.recipient_type !== "bcc" && recipient.address !== mailbox?.address && recipient.address !== message.from_address)
          .map((recipient) => recipient.address)
          .join(", ")
      : "";

    setCompose({
      to: message.from_address,
      cc: ccRecipients,
      bcc: "",
      subject: ensureSubjectPrefix(message.subject, "Re"),
      body: `\n\nOn ${formatDate(message.created_at)}, ${getSenderLabel(message)} wrote:\n${message.plain_body}`,
    });
  }

  function startForward(message: EmployeeMailMessage) {
    setCompose({
      to: "",
      cc: "",
      bcc: "",
      subject: ensureSubjectPrefix(message.subject, "Fwd"),
      body: `\n\nForwarded message\nFrom: ${getSenderLabel(message)}\nSubject: ${message.subject}\nDate: ${formatDate(message.created_at)}\n\n${message.plain_body}`,
    });
  }

  function submitCompose(mode: "draft" | "send") {
    if (!compose) {
      return;
    }

    runAction(
      async () => {
        if (mode === "draft") {
          const result = await saveEmployeeMailDraft(compose);

          if (!result.ok) {
            throw new Error(result.error);
          }

          return;
        }

        const result = await sendEmployeeMail(compose);

        if (!result.ok) {
          throw new Error(result.error);
        }

        setCompose(null);
      },
      mode === "draft" ? "Draft saved." : "Message sent.",
    );
  }

  return (
    <div className="employee-mail-shell">
      {!mailbox ? (
        <section className="portal-card employee-mail-setup">
          <MailPlus color="#c9932b" size={30} />
          <h3>Mailbox alias needed</h3>
          <p>An admin must assign your mail.reliancepredictivesafety.com address before you can send or receive employee mail.</p>
        </section>
      ) : (
        <section className="employee-mail-app">
          <aside className="employee-mail-folders" aria-label="Mail folders">
            <button className="button button-primary" type="button" onClick={() => setCompose({ to: "", cc: "", bcc: "", subject: "", body: "" })}>
              <MailPlus size={17} />
              Compose
            </button>
            <div className="employee-mail-address">{mailbox.address}</div>
            {folders.map((folder) => {
              const Icon = folder.icon;
              const active = activeFolder === folder.key;

              return (
                <button
                  className={active ? "active" : undefined}
                  key={folder.key}
                  onClick={() => {
                    setActiveFolder(folder.key);
                    setSelectedMessageId(messages.find((message) => message.folder === folder.key)?.id ?? null);
                  }}
                  type="button"
                >
                  <Icon size={16} />
                  <span>{folder.label}</span>
                  <strong>{folder.key === "inbox" ? unreadInboxCount || folderCounts.get(folder.key) : folderCounts.get(folder.key)}</strong>
                </button>
              );
            })}
          </aside>

          <section className="employee-mail-list-panel">
            <div className="filters employee-mail-search">
              <div className="search-field">
                <Search aria-hidden="true" size={18} />
                <input aria-label="Search mail" placeholder="Search mail" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            <div className="employee-mail-list">
              {filteredMessages.length === 0 ? (
                <div className="empty-state">No messages in this folder.</div>
              ) : (
                filteredMessages.map((message) => (
                  <button
                    className={`employee-mail-row ${selectedMessage?.id === message.id ? "active" : ""} ${!message.read_at && message.folder === "inbox" ? "unread" : ""}`}
                    key={message.id}
                    onClick={() => openMessage(message)}
                    type="button"
                  >
                    <span>{message.folder === "sent" || message.folder === "drafts" ? serializeRecipients(recipientsByMessageId.get(message.id) ?? []) || "No recipients" : getSenderLabel(message)}</span>
                    <strong>{message.subject || "(no subject)"}</strong>
                    <small>{message.plain_body}</small>
                    <em>{formatDate(message.updated_at)}</em>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="employee-mail-detail">
            {selectedMessage ? (
              <>
                <div className="employee-mail-detail-head">
                  <div>
                    <div className="eyebrow">{selectedMessage.status}</div>
                    <h2>{selectedMessage.subject || "(no subject)"}</h2>
                    <p>
                      From {getSenderLabel(selectedMessage)} to {serializeRecipients(selectedRecipients) || mailbox.address}
                    </p>
                  </div>
                  <span className="badge">{formatDate(selectedMessage.created_at)}</span>
                </div>
                <div className="employee-mail-toolbar" aria-label="Message actions">
                  <button className="icon-button" type="button" onClick={() => startReply(selectedMessage)} aria-label="Reply">
                    <Reply size={16} />
                  </button>
                  <button className="icon-button" type="button" onClick={() => startReply(selectedMessage, true)} aria-label="Reply all">
                    <ReplyAll size={16} />
                  </button>
                  <button className="icon-button" type="button" onClick={() => startForward(selectedMessage)} aria-label="Forward">
                    <Forward size={16} />
                  </button>
                  <button className="icon-button" type="button" onClick={() => runAction(() => markEmployeeMailRead(selectedMessage.id, !selectedMessage.read_at), "Read state updated.")} aria-label="Toggle read">
                    {selectedMessage.read_at ? <MailOpen size={16} /> : <MailCheck size={16} />}
                  </button>
                  {selectedMessage.folder === "trash" ? (
                    <button className="icon-button" type="button" onClick={() => runAction(() => moveEmployeeMailMessage(selectedMessage.id, "inbox"), "Message restored.")} aria-label="Restore">
                      <RefreshCcw size={16} />
                    </button>
                  ) : (
                    <>
                      <button className="icon-button" type="button" onClick={() => runAction(() => moveEmployeeMailMessage(selectedMessage.id, "archive"), "Message archived.")} aria-label="Archive">
                        <Archive size={16} />
                      </button>
                      <button className="icon-button" type="button" onClick={() => runAction(() => moveEmployeeMailMessage(selectedMessage.id, "trash"), "Message moved to trash.")} aria-label="Trash">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
                <div className="employee-mail-body">
                  {selectedMessage.plain_body.split("\n").map((line: string, index: number) => (
                    <p key={`${selectedMessage.id}-${index}`}>{line || "\u00a0"}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">Choose a message to read.</div>
            )}
          </section>
        </section>
      )}

      {compose ? (
        <section className="employee-mail-compose" aria-label="Compose mail">
          <div className="employee-mail-compose-head">
            <h2>New message</h2>
            <button className="icon-button" type="button" onClick={() => setCompose(null)} aria-label="Close compose">
              <X size={16} />
            </button>
          </div>
          <div className="field">
            <label htmlFor="mail-to">To</label>
            <input id="mail-to" value={compose.to} onChange={(event) => setCompose((current) => current ? { ...current, to: event.target.value } : current)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="mail-cc">Cc</label>
              <input id="mail-cc" value={compose.cc ?? ""} onChange={(event) => setCompose((current) => current ? { ...current, cc: event.target.value } : current)} />
            </div>
            <div className="field">
              <label htmlFor="mail-bcc">Bcc</label>
              <input id="mail-bcc" value={compose.bcc ?? ""} onChange={(event) => setCompose((current) => current ? { ...current, bcc: event.target.value } : current)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="mail-subject">Subject</label>
            <input id="mail-subject" value={compose.subject} onChange={(event) => setCompose((current) => current ? { ...current, subject: event.target.value } : current)} />
          </div>
          <div className="field">
            <label htmlFor="mail-body">Message</label>
            <textarea id="mail-body" value={compose.body} onChange={(event) => setCompose((current) => current ? { ...current, body: event.target.value } : current)} />
          </div>
          <div className="employee-mail-compose-actions">
            <button className="button button-light" disabled={isPending} type="button" onClick={() => submitCompose("draft")}>
              <Save size={16} />
              Save Draft
            </button>
            <button className="button button-primary" disabled={isPending} type="button" onClick={() => submitCompose("send")}>
              <Send size={16} />
              Send
            </button>
          </div>
        </section>
      ) : null}

      {statusMessage ? <div className="success-box portal-alert">{statusMessage}</div> : null}

      {canManageMailboxes ? (
        <section className="table-card employee-mail-admin">
          <div className="user-list-header">
            <div>
              <h2>Mailbox aliases</h2>
              <p>Assign employee addresses on mail.reliancepredictivesafety.com.</p>
            </div>
          </div>
          <div className="user-list">
            {employees.map((employee) => {
              const name = employee.display_name || employee.legal_name || employee.email || employee.user_id.slice(0, 8);
              const alias = employee.mailbox?.address.split("@")[0] ?? (employee.email?.split("@")[0] ?? "");

              return (
                <form action={assignEmployeeMailbox} className="user-row user-row-form employee-mail-admin-row" key={employee.user_id}>
                  <input name="user_id" type="hidden" value={employee.user_id} />
                  <div>
                    <h3>{name}</h3>
                    <p>{employee.mailbox?.address ?? employee.email ?? "No email"}</p>
                  </div>
                  <div className="field">
                    <label htmlFor={`mail-alias-${employee.user_id}`}>Alias</label>
                    <input id={`mail-alias-${employee.user_id}`} name="alias" defaultValue={alias} />
                  </div>
                  <div className="field">
                    <label htmlFor={`mail-display-${employee.user_id}`}>Display name</label>
                    <input id={`mail-display-${employee.user_id}`} name="display_name" defaultValue={employee.mailbox?.display_name ?? name} />
                  </div>
                  <button className="button button-light" type="submit">
                    <Save size={16} />
                    Assign
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
