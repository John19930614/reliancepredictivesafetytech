"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Mail, Phone, Search } from "lucide-react";
import { demoRequestStatuses, supportTicketStatuses, type DemoRequest, type SupportTicket } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type RequestInboxProps = {
  initialRequests: DemoRequest[];
  initialSupportTickets: SupportTicket[];
};

type InboxTab = "requests" | "support";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeStatusLabel(status: string) {
  return status
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isLinkTarget(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/");
}

export function RequestInbox({ initialRequests, initialSupportTickets }: RequestInboxProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [supportTickets, setSupportTickets] = useState(initialSupportTickets);
  const [filters, setFilters] = useState({ status: "", query: "" });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InboxTab>("requests");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "support") {
      setActiveTab("support");
    }
  }, []);

  const filteredRequests = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesStatus = !filters.status || request.status === filters.status;
      const matchesQuery =
        !query ||
        [
          request.name,
          request.company,
          request.email,
          request.phone,
          request.role,
          request.company_type,
          request.message,
          ...(request.interested_products ?? []),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return matchesStatus && matchesQuery;
    });
  }, [filters, requests]);

  const filteredSupportTickets = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return supportTickets.filter((ticket) => {
      const matchesStatus = !filters.status || ticket.status === filters.status;
      const matchesQuery =
        !query ||
        [
          ticket.submitter_name,
          ticket.company,
          ticket.submitter_email,
          ticket.submitter_phone,
          ticket.subject,
          ticket.category,
          ticket.priority,
          ticket.issue_url,
          ticket.message,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return matchesStatus && matchesQuery;
    });
  }, [filters, supportTickets]);

  const currentStatuses = activeTab === "support" ? supportTicketStatuses : demoRequestStatuses;

  async function updateStatus(request: DemoRequest, status: string) {
    setRequests((current) => current.map((item) => (item.id === request.id ? { ...item, status } : item)));

    const supabase = createClient();
    if (!supabase) {
      return;
    }

    setSavingId(request.id);
    await supabase.from("demo_requests").update({ status }).eq("id", request.id);
    setSavingId(null);
  }

  async function updateSupportTicketStatus(ticket: SupportTicket, status: string) {
    setSupportTickets((current) => current.map((item) => (item.id === ticket.id ? { ...item, status } : item)));

    const supabase = createClient();
    if (!supabase) {
      return;
    }

    setSavingId(ticket.id);
    await supabase.from("support_tickets").update({ status }).eq("id", ticket.id);
    setSavingId(null);
  }

  function switchTab(tab: InboxTab) {
    setActiveTab(tab);
    setFilters({ status: "", query: "" });
  }

  return (
    <section className="inbox-panel">
      <div className="inbox-tabs" aria-label="Inbox type">
        <button className={activeTab === "requests" ? "active" : undefined} onClick={() => switchTab("requests")} type="button">
          Demo requests
          <span>{requests.length}</span>
        </button>
        <button className={activeTab === "support" ? "active" : undefined} onClick={() => switchTab("support")} type="button">
          Tech support
          <span>{supportTickets.length}</span>
        </button>
      </div>

      <div className="filters">
        <div className="search-field">
          <Search aria-hidden="true" size={18} />
          <input
            aria-label={activeTab === "support" ? "Search support tickets" : "Search requests"}
            placeholder={activeTab === "support" ? "Search tickets, subjects, messages" : "Search names, companies, messages"}
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </div>
        <select
          aria-label="Filter by request status"
          value={filters.status}
          onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
        >
          <option value="">All statuses</option>
          {currentStatuses.map((status) => (
            <option key={status} value={status}>
              {normalizeStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="inbox-list">
        {activeTab === "requests" && filteredRequests.length === 0 ? (
          <div className="empty-state">No information or demo requests match the current filters.</div>
        ) : null}

        {activeTab === "requests" ? (
          filteredRequests.map((request) => (
            <article className="request-card" key={request.id}>
              <div className="request-card-head">
                <div>
                  <div className="eyebrow">{formatDate(request.created_at)}</div>
                  <h2>{request.name}</h2>
                  <p>
                    {[request.role, request.company].filter(Boolean).join(" at ") || request.company_type || "Website request"}
                  </p>
                </div>
                <span className="badge">{savingId === request.id ? "Saving" : normalizeStatusLabel(request.status)}</span>
              </div>

              <div className="request-meta">
                <a href={`mailto:${request.email}`}>
                  <Mail size={16} />
                  {request.email}
                </a>
                {request.phone ? (
                  <a href={`tel:${request.phone}`}>
                    <Phone size={16} />
                    {request.phone}
                  </a>
                ) : null}
              </div>

              {request.interested_products && request.interested_products.length > 0 ? (
                <div className="request-products">
                  {request.interested_products.map((product) => (
                    <span key={product}>{product}</span>
                  ))}
                </div>
              ) : null}

              {request.message ? <p className="request-message">{request.message}</p> : null}

              <div className="field request-status">
                <label htmlFor={`status-${request.id}`}>Status</label>
                <select
                  id={`status-${request.id}`}
                  value={request.status}
                  onChange={(event) => updateStatus(request, event.target.value)}
                >
                  {demoRequestStatuses.map((status) => (
                    <option key={status} value={status}>
                      {normalizeStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))
        ) : null}

        {activeTab === "support" && filteredSupportTickets.length === 0 ? (
          <div className="empty-state">No tech support tickets match the current filters.</div>
        ) : null}

        {activeTab === "support"
          ? filteredSupportTickets.map((ticket) => (
              <article className="request-card support-ticket-card" id={`support-ticket-${ticket.id}`} key={ticket.id}>
                <div className="request-card-head">
                  <div>
                    <div className="eyebrow">{formatDate(ticket.created_at)}</div>
                    <h2>{ticket.subject}</h2>
                    <p>
                      {[ticket.submitter_name, ticket.company].filter(Boolean).join(" / ") || "Tech support ticket"}
                    </p>
                  </div>
                  <span className="badge">{savingId === ticket.id ? "Saving" : normalizeStatusLabel(ticket.status)}</span>
                </div>

                <div className="request-meta">
                  <a href={`mailto:${ticket.submitter_email}`}>
                    <Mail size={16} />
                    {ticket.submitter_email}
                  </a>
                  {ticket.submitter_phone ? (
                    <a href={`tel:${ticket.submitter_phone}`}>
                      <Phone size={16} />
                      {ticket.submitter_phone}
                    </a>
                  ) : null}
                  {ticket.issue_url && isLinkTarget(ticket.issue_url) ? (
                    <a href={ticket.issue_url} rel="noreferrer" target="_blank">
                      <ExternalLink size={16} />
                      Page / area
                    </a>
                  ) : null}
                </div>

                <div className="request-products">
                  <span>{ticket.category}</span>
                  {ticket.issue_url && !isLinkTarget(ticket.issue_url) ? <span>{ticket.issue_url}</span> : null}
                  <span className={ticket.priority === "urgent" || ticket.priority === "high" ? "ticket-priority-hot" : undefined}>
                    {ticket.priority === "urgent" || ticket.priority === "high" ? <AlertTriangle size={14} /> : null}
                    {normalizeStatusLabel(ticket.priority)} priority
                  </span>
                </div>

                <p className="request-message">{ticket.message}</p>

                <div className="field request-status">
                  <label htmlFor={`support-status-${ticket.id}`}>Status</label>
                  <select
                    id={`support-status-${ticket.id}`}
                    value={ticket.status}
                    onChange={(event) => updateSupportTicketStatus(ticket, event.target.value)}
                  >
                    {supportTicketStatuses.map((status) => (
                      <option key={status} value={status}>
                        {normalizeStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))
          : null}
      </div>
    </section>
  );
}
