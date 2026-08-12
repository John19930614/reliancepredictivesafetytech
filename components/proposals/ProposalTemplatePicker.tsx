"use client";

// "Proposal type" control for the New proposal form.
//
// Two sources in one select, deliberately labelled apart:
//   * PROPOSAL TYPES — the built-in transaction-type templates
//     (lib/proposals/transaction-templates.ts): Pilot, Time & Materials, Fixed
//     Price, Enterprise, Retainer, Training. Code-defined, so they are always
//     present and always current with the price book.
//   * SAVED TEMPLATES — user-captured states from the Proposal Templates
//     module, fetched through the listProposalTemplates() Server Action rather
//     than a client-side Supabase read: the page that renders
//     ProposalCreateForm does not pass templates down, and CLAUDE.md keeps
//     data access on the server.
//
// Built-in options are encoded as "type:<key>" so the form can route them to
// their own create action; saved templates keep their uuid values.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { listProposalTemplates, type ProposalTemplateSummary } from "@/app/employee/proposals/templates/actions";
import { listTransactionTemplates } from "@/lib/proposals/transaction-templates";

/** Option-value prefix that marks a built-in transaction type. */
export const transactionTypeOptionPrefix = "type:";

interface ProposalTemplatePickerProps {
  /** "type:<key>", a saved template uuid, or "" for the blank path. */
  value: string;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function ProposalTemplatePicker({ value, onChange, disabled }: ProposalTemplatePickerProps) {
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const builtIns = useMemo(() => listTransactionTemplates(), []);

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

  const selectedBuiltIn = value.startsWith(transactionTypeOptionPrefix)
    ? builtIns.find((builtIn) => `${transactionTypeOptionPrefix}${builtIn.key}` === value) ?? null
    : null;
  const selectedSaved = templates.find((template) => template.id === value) ?? null;

  return (
    <div className="field">
      <label htmlFor="proposal_template">Proposal type</label>
      <select
        id="proposal_template"
        name="proposal_template"
        value={value}
        // Deliberately NOT disabled while the saved list loads or is empty —
        // the built-in types and the blank path are real choices regardless.
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {/* Said "(default pilot scope)", which was accurate and was the
            problem: a blank proposal opened on the pilot package with three
            phases whose copy ended "— included in the pilot". Both are neutral
            now, so blank means blank — and a pilot is the Pilot type below. */}
        <option value="">Blank proposal — no pilot wording</option>
        <optgroup label="Proposal types">
          {builtIns.map((builtIn) => (
            <option key={builtIn.key} value={`${transactionTypeOptionPrefix}${builtIn.key}`}>
              {builtIn.label}
            </option>
          ))}
        </optgroup>
        {templates.length > 0 ? (
          <optgroup label="Saved templates">
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>

      {error ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{error}</p>
      ) : selectedBuiltIn ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{selectedBuiltIn.description}</p>
      ) : selectedSaved?.description ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{selectedSaved.description}</p>
      ) : value === "" ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          Starts blank: manual price, no pilot wording. Pick a proposal type above for a ready-made starting point
          {loading ? null : templates.length === 0 ? (
            <>
              , or{" "}
              <Link href="/employee/proposals/templates">
                <LayoutTemplate size={13} style={{ verticalAlign: "-2px" }} /> save your own from an existing proposal
              </Link>
            </>
          ) : null}
          .
        </p>
      ) : (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          A template carries scope, pricing and terms only — the client block is filled from the company you assign
          here.
        </p>
      )}
    </div>
  );
}
