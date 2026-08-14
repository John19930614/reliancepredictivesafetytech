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
import {
  buildTransactionTemplateState,
  listTransactionTemplates,
  type TransactionTemplateSummary,
} from "@/lib/proposals/transaction-templates";
import { isNoPlatformPackageKey } from "@/lib/proposals/catalog";

/** Option-value prefix that marks a built-in transaction type. */
export const transactionTypeOptionPrefix = "type:";

interface ProposalTemplatePickerProps {
  /** "type:<key>" or a saved template uuid. "" means nothing is chosen yet. */
  value: string;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function ProposalTemplatePicker({ value, onChange, disabled }: ProposalTemplatePickerProps) {
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const builtIns = useMemo(() => listTransactionTemplates(), []);

  /**
   * The seven built-in types, split by what they SELL.
   *
   * Three seed a platform subscription and four seed none (`packageKey: "none"`)
   * — which decides whether the document prints a subscription fee row and
   * seat/jobsite counts, and whether the editor asks for them at all. That was
   * the single most consequential thing about the choice and the picker did not
   * say it. Derived from the registry's own seeded state rather than a second
   * list here, so a type that changes what it sells cannot be mislabelled.
   */
  const builtInGroups = useMemo(() => {
    const subscription: TransactionTemplateSummary[] = [];
    const services: TransactionTemplateSummary[] = [];
    for (const entry of builtIns) {
      const packageKey = String(buildTransactionTemplateState(entry.key).fields.packageSelect ?? "");
      (isNoPlatformPackageKey(packageKey) ? services : subscription).push(entry);
    }
    return { subscription, services };
  }, [builtIns]);

  /** true / false for a built-in type, null when the choice is not one. */
  const selectedSellsSubscription = useMemo(() => {
    if (!value.startsWith(transactionTypeOptionPrefix)) return null;
    const key = value.slice(transactionTypeOptionPrefix.length);
    if (builtInGroups.services.some((entry) => entry.key === key)) return false;
    if (builtInGroups.subscription.some((entry) => entry.key === key)) return true;
    return null;
  }, [builtInGroups, value]);

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
      <label htmlFor="proposal_template">
        Proposal type <span aria-hidden="true">*</span>
      </label>
      <select
        id="proposal_template"
        name="proposal_template"
        value={value}
        // Deliberately NOT disabled while the saved list loads or is empty —
        // the built-in types are real choices regardless.
        disabled={disabled}
        // A proposal with no type stamped falls back to the platform-era copy
        // for its subtitle, its section 03 lead-in and its deliverables, and
        // computes includesPlatformPackage = true from the default package key.
        // That is how a signed CPR/AED training proposal went out carrying
        // "Configured platform subscription" and a Selected Platform Package
        // block. The per-type suppression that prevents it is keyed entirely on
        // this control, so the control cannot be optional.
        required
        aria-required="true"
        onChange={(event) => onChange(event.target.value)}
      >
        {/*
          A PLACEHOLDER, not a choice. There used to be a real "Blank proposal"
          option here and it was the preselected one, so the default outcome of
          the New proposal form was a document with no type — the single input
          that decides whether the client reads about a platform subscription or
          about the work they are actually buying. `disabled` keeps it visible
          as a prompt while making it unselectable, so the seller has to say
          what kind of deal this is.

          A seller who wants an empty scope picks the type and clears the seeded
          lines in the editor; the type is the part that cannot be added back
          later without restyling a document that may already be out.
        */}
        <option value="" disabled>
          Select a proposal type…
        </option>
        <optgroup label="Proposal types — platform subscription">
          {builtInGroups.subscription.map((builtIn) => (
            <option key={builtIn.key} value={`${transactionTypeOptionPrefix}${builtIn.key}`}>
              {builtIn.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Proposal types — services only, no subscription">
          {builtInGroups.services.map((builtIn) => (
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
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          {selectedBuiltIn.description}
          {selectedSellsSubscription === false ? (
            <>
              {" "}
              The editor will not ask for a subscription price, included users or included jobsites, and the document
              prints none — add a platform package later if this deal includes one.
            </>
          ) : selectedSellsSubscription === true ? (
            <>
              {" "}
              Sells a platform subscription: the document prints the package, its price and the included user and
              jobsite counts.
            </>
          ) : null}
        </p>
      ) : selectedSaved?.description ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>{selectedSaved.description}</p>
      ) : value === "" ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.8rem", marginTop: 4 }}>
          Required. The type decides what the client reads — a subscription document names a platform package, a
          services document does not
          {loading ? null : templates.length === 0 ? (
            <>
              . You can also{" "}
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
