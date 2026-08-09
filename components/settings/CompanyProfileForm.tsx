"use client";

// Our own company record — the seller side of every document we issue.
//
// Until this existed, the name, address and contact email on every proposal
// were literal strings inside a 255 KB static HTML asset. Every proposal
// printed a personal gmail address as the company's contact and was "Prepared
// By John Haldemann" regardless of who wrote it, and correcting any of it meant
// editing the asset and re-running a build script.
//
// Proposals SNAPSHOT these values when they are created, so editing here
// changes what future proposals open with — it does not rewrite the address on
// a proposal a client already signed.

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { saveCompanyProfile } from "@/app/employee/settings/company/actions";
import {
  formatSellerContactBlock,
  missingCompanyProfileFields,
  type CompanyProfile,
} from "@/lib/company/profile";

const fields: { key: keyof CompanyProfile; label: string; hint?: string }[] = [
  { key: "legal_name", label: "Legal entity name", hint: "As registered — used where the document has to be precise." },
  { key: "display_name", label: "Display name", hint: "The wordmark across the top of a proposal." },
  { key: "address_line1", label: "Street address" },
  { key: "address_line2", label: "Suite / floor" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal_code", label: "ZIP code" },
  { key: "country", label: "Country", hint: "Left blank or “United States” is omitted from domestic documents." },
  { key: "email", label: "Company email", hint: "A shared inbox, not an individual's — documents outlive people." },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
];

export function CompanyProfileForm({ profile, canEdit }: { profile: CompanyProfile; canEdit: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CompanyProfile>(profile);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const gaps = missingCompanyProfileFields(draft);
  const preview = formatSellerContactBlock(draft);

  return (
    <form
      className="form-panel"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        setMessage("");
        startTransition(async () => {
          const result = await saveCompanyProfile(draft);
          if (!result.ok) {
            setError(result.error ?? "Something went wrong.");
            return;
          }
          setMessage("Company profile saved. New proposals will use it.");
        });
      }}
    >
      {error ? <div className="success-box portal-alert portal-alert-error">{error}</div> : null}
      {message ? <div className="success-box portal-alert">{message}</div> : null}

      {!canEdit ? (
        <p style={{ color: "var(--portal-muted)", fontSize: "0.9rem" }}>
          Only a platform admin can change these. This is the legal name and address on every commercial document the
          company issues.
        </p>
      ) : null}

      {gaps.length > 0 ? (
        <div className="success-box portal-alert">
          Still missing: <strong>{gaps.join(", ")}</strong>. Until these are filled in, every proposal prints an
          incomplete seller block.
        </div>
      ) : null}

      <div className="form-grid">
        {fields.map((field) => (
          <div className="field" key={field.key}>
            <label htmlFor={`company-profile-${field.key}`}>{field.label}</label>
            <input
              id={`company-profile-${field.key}`}
              value={(draft[field.key] as string) ?? ""}
              disabled={isPending || !canEdit}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            />
            {field.hint ? (
              <p style={{ color: "var(--portal-muted)", fontSize: "0.78rem", marginTop: 4 }}>{field.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      {/* The document formats these parts rather than printing them verbatim,
          so show the result — a blank line or a stray comma is exactly the kind
          of thing nobody notices until a client is looking at it. */}
      <div className="field">
        <label>How the Prepared By block will print</label>
        <div style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
          {[draft.display_name || draft.legal_name, preview].filter((part) => part !== "").join("\n") || "—"}
        </div>
      </div>

      <button className="button button-primary" type="submit" disabled={isPending || !canEdit}>
        <Save size={16} /> {isPending ? "Saving…" : "Save company profile"}
      </button>
    </form>
  );
}
