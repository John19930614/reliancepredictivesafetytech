"use client";

// Client-facing acceptance form for a shared proposal.
//
// This is the ONLY interactive element on the public share page. It collects a
// name, an email, and an EXPLICIT agreement checkbox, then hands them to the
// server action along with the share token from the URL. It deliberately does
// not collect — and the server deliberately does not accept — an IP address,
// a proposal id, or a revision id: the server derives all three itself from the
// token, so a client can only ever accept the exact revision they were shown.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PenLine } from "lucide-react";
import { acceptProposalViaShareLink } from "@/app/employee/proposals/actions";

export function ProposalAcceptanceForm({
  token,
  revisionNumber,
}: {
  token: string;
  revisionNumber: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);

  if (accepted) {
    return (
      <div className="form-panel rp-doc-noprint" style={{ marginTop: 24 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={20} color="var(--portal-gold)" /> Acceptance recorded
        </h2>
        <p style={{ color: "var(--portal-muted)", marginTop: 8 }}>
          Thank you. Your acceptance of revision {revisionNumber} has been recorded with today&apos;s date and a copy
          of this document. Your representative will be in touch to confirm next steps.
        </p>
      </div>
    );
  }

  function submit() {
    setError("");
    setFieldErrors({});
    startTransition(async () => {
      const result = await acceptProposalViaShareLink(token, { name, email, agreed });
      if (!result.ok) {
        setError(result.error ?? "Your acceptance could not be recorded.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setAccepted(true);
      router.refresh();
    });
  }

  return (
    <div className="form-panel rp-doc-noprint" style={{ marginTop: 24 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PenLine size={18} color="var(--portal-gold)" /> Accept this proposal
      </h2>
      <p style={{ color: "var(--portal-muted)", marginTop: 8, fontSize: "0.9rem" }}>
        Accepting records your name, email address, the date and time, and the exact revision shown above (revision{" "}
        {revisionNumber}). It does not replace a signed agreement where one is required.
      </p>

      {error ? (
        <div className="success-box portal-alert portal-alert-error" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      <form
        className="form-grid"
        style={{ gridTemplateColumns: "1fr", marginTop: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!isPending) submit();
        }}
      >
        <div className="field">
          <label htmlFor="acceptance-name">Full name</label>
          <input
            id="acceptance-name"
            name="name"
            autoComplete="name"
            value={name}
            disabled={isPending}
            onChange={(event) => setName(event.target.value)}
            required
          />
          {fieldErrors.name ? (
            <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{fieldErrors.name}</span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="acceptance-email">Email address</label>
          <input
            id="acceptance-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={isPending}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {fieldErrors.email ? (
            <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{fieldErrors.email}</span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="acceptance-agreed" style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input
              id="acceptance-agreed"
              name="agreed"
              type="checkbox"
              checked={agreed}
              disabled={isPending}
              onChange={(event) => setAgreed(event.target.checked)}
              style={{ marginTop: 3, width: "auto" }}
            />
            <span>
              I have read revision {revisionNumber} of this proposal, including the commercial and legal terms in
              section 09, and I am authorised to accept it on behalf of my organisation.
            </span>
          </label>
          {fieldErrors.agreed ? (
            <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{fieldErrors.agreed}</span>
          ) : null}
        </div>

        <div>
          <button className="button button-primary" type="submit" disabled={isPending}>
            {isPending ? "Recording…" : "Accept proposal"}
          </button>
        </div>
      </form>
    </div>
  );
}
