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
import { CheckCircle2, MessageSquare, PenLine } from "lucide-react";
import { acceptProposalViaShareLink, declineProposalViaShareLink } from "@/app/employee/proposals/actions";
import { declineReasonOptions } from "@/app/employee/proposals/share-link-policy";

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
  // The decline half. Collapsed behind a link rather than shown as a second
  // button of equal weight: this page's job is acceptance, and a decline is a
  // deliberate act, not a mis-click. But it has to EXIST — a client with no way
  // to say no simply goes silent, and the reason is lost with them.
  const [decliningOpen, setDecliningOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineDetail, setDeclineDetail] = useState("");
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return (
      <div className="form-panel rp-doc-noprint" style={{ marginTop: 24 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquare size={20} color="var(--portal-gold)" /> Response recorded
        </h2>
        <p style={{ color: "var(--portal-muted)", marginTop: 8 }}>
          Thank you for letting us know. Your response has been sent to your representative, who will follow up if
          there is anything worth revisiting.
        </p>
      </div>
    );
  }

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

  function submitDecline() {
    setError("");
    setFieldErrors({});
    startTransition(async () => {
      const result = await declineProposalViaShareLink(token, {
        name,
        reason: declineReason,
        detail: declineDetail,
      });
      if (!result.ok) {
        setError(result.error ?? "Your response could not be recorded.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setDeclined(true);
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

      <div style={{ borderTop: "1px solid var(--portal-line, #dbe2e9)", marginTop: 20, paddingTop: 16 }}>
        {!decliningOpen ? (
          <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
            Not moving forward?{" "}
            <button
              type="button"
              onClick={() => setDecliningOpen(true)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                color: "var(--portal-gold)",
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Let us know why
            </button>
            . It takes a moment and helps us make a better proposal next time.
          </p>
        ) : (
          <form
            className="form-grid"
            style={{ gridTemplateColumns: "1fr" }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!isPending) submitDecline();
            }}
          >
            <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Decline this proposal</h3>
            <p style={{ color: "var(--portal-muted)", fontSize: "0.85rem", margin: 0 }}>
              This records your response so your representative knows where things stand. Enter your name above, then
              tell us the main reason.
            </p>

            <div className="field">
              <label htmlFor="decline-reason">Main reason</label>
              <select
                id="decline-reason"
                value={declineReason}
                disabled={isPending}
                onChange={(event) => setDeclineReason(event.target.value)}
                required
              >
                <option value="">Select a reason…</option>
                {declineReasonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {fieldErrors.reason ? (
                <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{fieldErrors.reason}</span>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="decline-detail">Anything else? (optional)</label>
              <textarea
                id="decline-detail"
                rows={3}
                value={declineDetail}
                disabled={isPending}
                onChange={(event) => setDeclineDetail(event.target.value)}
                placeholder="Budget, timing, scope — whatever would be useful for us to know."
              />
              {fieldErrors.detail ? (
                <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>{fieldErrors.detail}</span>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button button-light" type="submit" disabled={isPending}>
                {isPending ? "Sending…" : "Send response"}
              </button>
              <button
                className="button button-light"
                type="button"
                disabled={isPending}
                onClick={() => setDecliningOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
