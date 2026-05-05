"use client";

import { useMemo, useState } from "react";
import { Mail, Phone, Search } from "lucide-react";
import { demoRequestStatuses, type DemoRequest } from "@/lib/company-data";
import { createClient } from "@/lib/supabase/client";

type RequestInboxProps = {
  initialRequests: DemoRequest[];
};

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

export function RequestInbox({ initialRequests }: RequestInboxProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [filters, setFilters] = useState({ status: "", query: "" });
  const [savingId, setSavingId] = useState<string | null>(null);

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

  return (
    <section className="inbox-panel">
      <div className="filters">
        <div className="search-field">
          <Search aria-hidden="true" size={18} />
          <input
            aria-label="Search requests"
            placeholder="Search names, companies, messages"
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
          {demoRequestStatuses.map((status) => (
            <option key={status} value={status}>
              {normalizeStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="inbox-list">
        {filteredRequests.length === 0 ? (
          <div className="empty-state">No information or demo requests match the current filters.</div>
        ) : (
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
        )}
      </div>
    </section>
  );
}
