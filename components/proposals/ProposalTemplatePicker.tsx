"use client";

// "Start from template" control for the New proposal form.
//
// The template list is fetched through the listProposalTemplates() Server
// Action rather than a client-side Supabase read: the page that renders
// ProposalCreateForm does not pass templates down, and CLAUDE.md keeps data
// access on the server. The action applies the same auth gate as every other
// write in the module.

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { listProposalTemplates, type ProposalTemplateSummary } from "@/app/employee/proposals/templates/actions";

interface ProposalTemplatePickerProps {
  /** Selected template id, or "" for the plain default-pilot path. */
  value: string;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function ProposalTemplatePicker({ value, onChange, disabled }: ProposalTemplatePickerProps) {
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    listProposalTemplates()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error ?? "Could not load templates.");
          return;
        }
        setTemplates(result.templates);
      })
      .catch(() => {
        if (active) setError("Could not load templates.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = templates.find((template) => template.id === value) ?? null;

  return (
    <div className="field">
      <label htmlFor="proposal_template">Start from template</label>
      <select
        id="proposal_template"
        name="proposal_template"
        value={value}
        disabled={disabled || loading || templates.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Blank proposal (default pilot scope)</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>

      {error ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{error}</p>
      ) : loading ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>Loading templates…</p>
      ) : templates.length === 0 ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          No templates yet —{" "}
          <Link href="/employee/proposals/templates">
            <LayoutTemplate size={13} style={{ verticalAlign: "-2px" }} /> save one from an existing proposal
          </Link>
          .
        </p>
      ) : selected?.description ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{selected.description}</p>
      ) : (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          A template carries scope, pricing and terms only — the client block is filled from the company you assign
          here.
        </p>
      )}
    </div>
  );
}
