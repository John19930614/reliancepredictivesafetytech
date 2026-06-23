"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import {
  categoryLabels,
  jurisdictionLabels,
  statusColors,
  statusLabels,
  type LegalComplianceStatus,
  type LegalRegisterItem,
  type ResearchedLegalItem,
} from "@/lib/legal/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the register as a clean, standalone document and opens the browser
 * print dialog (which offers "Save as PDF"). Uses a hidden iframe so it never
 * disturbs the app shell and isn't blocked by popup blockers.
 */
function printRegister(items: LegalRegisterItem[], generatedOn: string): void {
  const rowsHtml = items
    .map((item, idx) => {
      const sources = (item.source_urls || [])
        .map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(u)}</a>`)
        .join("<br/>");
      return `
        <tr>
          <td class="num">${idx + 1}</td>
          <td>
            <div class="title">${escapeHtml(item.title)}</div>
            ${item.citation ? `<div class="cite">${escapeHtml(item.citation)}</div>` : ""}
            ${item.issuing_body ? `<div class="muted">${escapeHtml(item.issuing_body)}</div>` : ""}
          </td>
          <td>${escapeHtml(categoryLabels[item.category])}</td>
          <td>${escapeHtml(jurisdictionLabels[item.jurisdiction])}${item.jurisdiction_state ? ` &middot; ${escapeHtml(item.jurisdiction_state)}` : ""}</td>
          <td>${escapeHtml(statusLabels[item.compliance_status])}</td>
        </tr>
        <tr class="detail">
          <td></td>
          <td colspan="4">
            ${item.description ? `<div class="block"><span class="lbl">Description:</span> ${escapeHtml(item.description)}</div>` : ""}
            ${item.compliance_requirements ? `<div class="block"><span class="lbl">Compliance Requirements:</span> ${escapeHtml(item.compliance_requirements)}</div>` : ""}
            ${item.penalties ? `<div class="block"><span class="lbl">Penalties:</span> ${escapeHtml(item.penalties)}</div>` : ""}
            ${sources ? `<div class="block"><span class="lbl">Sources:</span><br/>${sources}</div>` : ""}
          </td>
        </tr>`;
    })
    .join("");

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Legal Register</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; margin: 32px; font-size: 11px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 11px; margin-bottom: 18px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #444; border-bottom: 1px solid #999; padding: 6px 8px; }
  tbody td { padding: 8px; vertical-align: top; border-bottom: 1px solid #ddd; }
  td.num { color: #999; width: 24px; }
  .title { font-weight: bold; font-size: 12px; }
  .cite { font-family: 'Courier New', monospace; color: #a07b00; font-size: 10px; }
  .muted { color: #666; font-size: 10px; }
  tr.detail td { border-bottom: 1px solid #ddd; padding-top: 0; font-size: 10px; color: #333; }
  .block { margin: 3px 0; }
  .lbl { font-weight: bold; color: #000; }
  a { color: #0645ad; word-break: break-all; }
  @media print { body { margin: 12mm; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>Legal Register</h1>
  <div class="meta">Reliance Predictive Safety Technologies &middot; ${escapeHtml(items.length.toString())} item${items.length === 1 ? "" : "s"} &middot; Generated ${escapeHtml(generatedOn)}</div>
  <table>
    <thead>
      <tr><th>#</th><th>Title / Citation / Issuing Body</th><th>Type</th><th>Jurisdiction</th><th>Status</th></tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    document.body.removeChild(iframe);
    return;
  }
  idoc.open();
  idoc.write(doc);
  idoc.close();

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const triggerPrint = () => {
    win.focus();
    win.print();
    // Remove the iframe after the print dialog has had time to open.
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  // Give the iframe a tick to render before printing.
  if (idoc.readyState === "complete") {
    setTimeout(triggerPrint, 250);
  } else {
    win.onload = () => setTimeout(triggerPrint, 250);
  }
}

interface ResearchResult {
  sessionId: string;
  query: string;
  summary: string;
  items: ResearchedLegalItem[];
  gatewayStatus: string;
}

interface LegalRegisterProps {
  initialItems: LegalRegisterItem[];
  isAdmin: boolean;
}

function StatusBadge({ status }: { status: LegalComplianceStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "2px 8px",
        borderRadius: 4,
        background: `${statusColors[status]}22`,
        color: statusColors[status],
        border: `1px solid ${statusColors[status]}44`,
      }}
    >
      {statusLabels[status]}
    </span>
  );
}

function ResearchPanel({
  onResultsReady,
}: {
  onResultsReady: (result: ResearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultQuery =
    "List all federal and state laws, regulations, standards, and guidelines that apply to our business. Include the issuing agency, citation, requirements, and penalties for each.";

  async function handleResearch() {
    const q = query.trim() || defaultQuery;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/legal-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Research failed");

      onResultsReady(data as ResearchResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--portal-surface)",
        border: "1px solid var(--portal-border)",
        borderRadius: 10,
        padding: "20px 24px",
        marginBottom: 28,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Search size={18} style={{ color: "var(--portal-gold)" }} />
        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>AI Deep Research</span>
        <span
          style={{
            fontSize: "0.7rem",
            background: "var(--portal-gold)22",
            color: "var(--portal-gold)",
            border: "1px solid var(--portal-gold)44",
            borderRadius: 4,
            padding: "1px 7px",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          OpenAI + Web Search
        </span>
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--portal-muted)", marginBottom: 14 }}>
        Describe your business, industry, and jurisdiction — for any domain (DOT, OSHA, EPA, privacy, financial,
        healthcare, etc.). The AI will search the web for all applicable laws, regulations, standards, and guidelines,
        then generate a complete legal register document. Example: &ldquo;DOT compliance for interstate and intrastate
        trucking in WI and CA.&rdquo;
      </p>

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={defaultQuery}
        rows={3}
        style={{
          width: "100%",
          background: "var(--portal-bg)",
          border: "1px solid var(--portal-border)",
          borderRadius: 6,
          padding: "10px 12px",
          fontSize: "0.875rem",
          color: "inherit",
          resize: "vertical",
          marginBottom: 12,
          boxSizing: "border-box",
        }}
      />

      {error && (
        <div
          style={{
            background: "#ef444422",
            border: "1px solid #ef444444",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 12,
            fontSize: "0.85rem",
            color: "#ef4444",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleResearch}
        disabled={loading}
        style={{
          background: "var(--portal-gold)",
          color: "#000",
          border: "none",
          borderRadius: 6,
          padding: "8px 20px",
          fontWeight: 700,
          fontSize: "0.875rem",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {loading ? (
          <>
            <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            Researching… (30–60 s)
          </>
        ) : (
          <>
            <Search size={15} />
            Run Deep Research
          </>
        )}
      </button>

      {loading && (
        <p style={{ fontSize: "0.8rem", color: "var(--portal-muted)", marginTop: 10 }}>
          OpenAI is searching the web for applicable regulations. This typically takes 30–60 seconds.
        </p>
      )}
    </div>
  );
}

function ResearchResults({
  result,
  onSave,
  onDismiss,
}: {
  result: ResearchResult;
  onSave: (items: ResearchedLegalItem[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(result.items.map((_, i) => i)));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  function toggleAll() {
    if (selected.size === result.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.items.map((_, i) => i)));
    }
  }

  async function handleSave() {
    const toSave = result.items.filter((_, i) => selected.has(i));
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(toSave);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--portal-surface)",
        border: "1px solid var(--portal-border)",
        borderRadius: 10,
        marginBottom: 28,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--portal-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: 4 }}>
            Research Complete — {result.items.length} items found
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--portal-muted)" }}>{result.summary}</div>
        </div>
        <button onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--portal-border)", display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={toggleAll}
          style={{
            fontSize: "0.8rem",
            background: "none",
            border: "1px solid var(--portal-border)",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            color: "inherit",
          }}
        >
          {selected.size === result.items.length ? "Deselect all" : "Select all"}
        </button>
        <span style={{ fontSize: "0.8rem", color: "var(--portal-muted)" }}>{selected.size} selected</span>
        <button
          onClick={handleSave}
          disabled={saving || selected.size === 0}
          style={{
            marginLeft: "auto",
            background: "var(--portal-gold)",
            color: "#000",
            border: "none",
            borderRadius: 6,
            padding: "6px 16px",
            fontWeight: 700,
            fontSize: "0.8rem",
            cursor: saving || selected.size === 0 ? "not-allowed" : "pointer",
            opacity: saving || selected.size === 0 ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={13} />}
          Save to Register
        </button>
      </div>

      {saveError && (
        <div
          style={{
            margin: "12px 24px 0",
            background: "#ef444422",
            border: "1px solid #ef444444",
            borderRadius: 6,
            padding: "10px 14px",
            fontSize: "0.82rem",
            color: "#ef4444",
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{saveError}</span>
        </div>
      )}

      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {result.items.map((item, i) => (
          <div
            key={i}
            style={{
              borderBottom: "1px solid var(--portal-border)",
              padding: "12px 24px",
              opacity: selected.has(i) ? 1 : 0.5,
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => {
                  const next = new Set(selected);
                  next.has(i) ? next.delete(i) : next.add(i);
                  setSelected(next);
                }}
                style={{ marginTop: 3, cursor: "pointer", flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{item.title}</span>
                  {item.citation && (
                    <span style={{ fontSize: "0.75rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>
                      {item.citation}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: "var(--portal-border)",
                      borderRadius: 3,
                      padding: "1px 6px",
                      color: "var(--portal-muted)",
                    }}
                  >
                    {categoryLabels[item.category]}
                  </span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      background: "var(--portal-border)",
                      borderRadius: 3,
                      padding: "1px 6px",
                      color: "var(--portal-muted)",
                    }}
                  >
                    {jurisdictionLabels[item.jurisdiction]}
                    {item.jurisdiction_state ? ` (${item.jurisdiction_state})` : ""}
                  </span>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--portal-muted)", margin: 0, lineHeight: 1.5 }}>
                  {item.description}
                </p>
                {expanded === i && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {item.compliance_requirements && (
                      <div>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 3 }}>
                          Compliance Requirements
                        </div>
                        <p style={{ fontSize: "0.8rem", margin: 0, lineHeight: 1.5 }}>{item.compliance_requirements}</p>
                      </div>
                    )}
                    {item.penalties && (
                      <div>
                        <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 3 }}>
                          Penalties
                        </div>
                        <p style={{ fontSize: "0.8rem", margin: 0, color: "#f59e0b" }}>{item.penalties}</p>
                      </div>
                    )}
                    {item.source_urls.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {item.source_urls.map((url, j) => (
                          <a
                            key={j}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: "0.78rem", color: "var(--portal-gold)", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <ExternalLink size={11} />
                            Source
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    color: "var(--portal-muted)",
                    padding: "4px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {expanded === i ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {expanded === i ? "Less" : "Details"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegisterTable({ items, onStatusChange }: { items: LegalRegisterItem[]; onStatusChange: (id: string, status: LegalComplianceStatus) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = items.filter(
    (item) =>
      !filter ||
      item.title.toLowerCase().includes(filter.toLowerCase()) ||
      item.issuing_body?.toLowerCase().includes(filter.toLowerCase()) ||
      item.citation?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="search"
          placeholder="Filter by title, issuing body, or citation…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 400,
            background: "var(--portal-surface)",
            border: "1px solid var(--portal-border)",
            borderRadius: 6,
            padding: "7px 12px",
            fontSize: "0.875rem",
            color: "inherit",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={() => printRegister(filtered, new Date().toLocaleDateString())}
          disabled={filtered.length === 0}
          title="Print or save the register as a PDF"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--portal-surface)",
            border: "1px solid var(--portal-border)",
            borderRadius: 6,
            padding: "7px 14px",
            fontSize: "0.82rem",
            fontWeight: 600,
            color: "inherit",
            cursor: filtered.length === 0 ? "not-allowed" : "pointer",
            opacity: filtered.length === 0 ? 0.5 : 1,
          }}
        >
          <Printer size={14} />
          Print / Save as PDF
        </button>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 24px",
            color: "var(--portal-muted)",
            background: "var(--portal-surface)",
            border: "1px solid var(--portal-border)",
            borderRadius: 10,
          }}
        >
          <BookOpen size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {filter ? "No items match your filter" : "Legal register is empty"}
          </div>
          <div style={{ fontSize: "0.85rem" }}>
            {filter ? "Try a different search term." : "Use the AI Deep Research tool above to populate your register."}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid var(--portal-border)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--portal-surface)", borderBottom: "1px solid var(--portal-border)" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "var(--portal-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Title / Citation
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Type
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Jurisdiction
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600, color: "var(--portal-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Status
                </th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <>
                  <tr
                    key={item.id}
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    style={{
                      borderBottom: "1px solid var(--portal-border)",
                      cursor: "pointer",
                      background: expanded === item.id ? "var(--portal-surface)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>{item.title}</div>
                      {item.citation && (
                        <div style={{ fontSize: "0.75rem", color: "var(--portal-gold)", fontFamily: "monospace" }}>
                          {item.citation}
                        </div>
                      )}
                      {item.issuing_body && (
                        <div style={{ fontSize: "0.75rem", color: "var(--portal-muted)" }}>{item.issuing_body}</div>
                      )}
                    </td>
                    <td style={{ padding: "12px 12px", whiteSpace: "nowrap", color: "var(--portal-muted)", fontSize: "0.8rem" }}>
                      {categoryLabels[item.category]}
                    </td>
                    <td style={{ padding: "12px 12px", whiteSpace: "nowrap", color: "var(--portal-muted)", fontSize: "0.8rem" }}>
                      {jurisdictionLabels[item.jurisdiction]}
                      {item.jurisdiction_state ? ` · ${item.jurisdiction_state}` : ""}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <select
                        value={item.compliance_status}
                        onChange={(e) => {
                          e.stopPropagation();
                          onStatusChange(item.id, e.target.value as LegalComplianceStatus);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: `${statusColors[item.compliance_status]}22`,
                          color: statusColors[item.compliance_status],
                          border: `1px solid ${statusColors[item.compliance_status]}44`,
                          borderRadius: 4,
                          padding: "3px 8px",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {Object.entries(statusLabels).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", color: "var(--portal-muted)" }}>
                      {expanded === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                  </tr>
                  {expanded === item.id && (
                    <tr key={`${item.id}-detail`} style={{ borderBottom: "1px solid var(--portal-border)", background: "var(--portal-surface)" }}>
                      <td colSpan={5} style={{ padding: "16px 24px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          {item.description && (
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 6 }}>Description</div>
                              <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.6 }}>{item.description}</p>
                            </div>
                          )}
                          {item.compliance_requirements && (
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 6 }}>Compliance Requirements</div>
                              <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.6 }}>{item.compliance_requirements}</p>
                            </div>
                          )}
                          {item.penalties && (
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 6 }}>Penalties</div>
                              <p style={{ fontSize: "0.85rem", margin: 0, color: "#f59e0b" }}>{item.penalties}</p>
                            </div>
                          )}
                          {item.source_urls.length > 0 && (
                            <div>
                              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--portal-muted)", marginBottom: 6 }}>Sources</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {item.source_urls.map((url, j) => (
                                  <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.82rem", color: "var(--portal-gold)", display: "flex", alignItems: "center", gap: 5, wordBreak: "break-all" }}>
                                    <ExternalLink size={11} style={{ flexShrink: 0 }} />
                                    {url}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        {item.ai_researched && (
                          <div style={{ marginTop: 12, fontSize: "0.75rem", color: "var(--portal-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                            <CheckCircle2 size={12} />
                            AI-researched {item.ai_research_query ? `· Query: "${item.ai_research_query}"` : ""}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LegalRegister({ initialItems, isAdmin }: LegalRegisterProps) {
  const [items, setItems] = useState<LegalRegisterItem[]>(initialItems);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  async function handleSave(toSave: ResearchedLegalItem[]) {
    if (!researchResult) return;

    const res = await fetch("/api/legal-research", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: toSave,
        query: researchResult.query,
        sessionId: researchResult.sessionId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");

    setResearchResult(null);
    setSaveSuccess(`${data.saved} regulation${data.saved !== 1 ? "s" : ""} added to your legal register.`);

    const refreshRes = await fetch("/api/legal-research/items");
    if (refreshRes.ok) {
      const { items: fresh } = await refreshRes.json();
      setItems(fresh ?? []);
    }
  }

  async function handleStatusChange(id: string, status: LegalComplianceStatus) {
    await fetch(`/api/legal-research/items`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, compliance_status: status }),
    });

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, compliance_status: status } : item)));
  }

  return (
    <>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {saveSuccess && (
        <div
          style={{
            background: "#22c55e22",
            border: "1px solid #22c55e44",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: "0.875rem",
            color: "#22c55e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} />
            {saveSuccess}
          </span>
          <button onClick={() => setSaveSuccess(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#22c55e" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {isAdmin && <ResearchPanel onResultsReady={setResearchResult} />}

      {researchResult && (
        <ResearchResults
          result={researchResult}
          onSave={handleSave}
          onDismiss={() => setResearchResult(null)}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: "0.875rem", color: "var(--portal-muted)" }}>
          {items.length} item{items.length !== 1 ? "s" : ""} in register
        </div>
      </div>

      <RegisterTable items={items} onStatusChange={handleStatusChange} />
    </>
  );
}
