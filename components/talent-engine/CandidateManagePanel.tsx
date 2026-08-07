"use client";

/**
 * Manage one EHS professional after intake: verify their certifications, and
 * edit the record.
 *
 * WHY THIS EXISTS. `verifyCandidateCertification` had no caller anywhere in the
 * console, and a job order's required certs must be VERIFIED before a match for
 * that candidate can be submitted to the client. With no way to verify, every
 * order carrying cert requirements — which is most EHS orders — dead-ended at
 * the submittal gate. The verification list below is the control that unblocks
 * it; the edit fields are the second half of the same gap (a candidate, once
 * created, could never be corrected or moved through a status).
 *
 * Like every other interactive surface in this module it is a client island
 * that imports Server Actions and pure helpers only — no Supabase client and no
 * write path reaches the browser bundle (CLAUDE.md: no client-side mutation).
 *
 * There is deliberately NO input for verified certifications. That column is
 * written by verifyCandidateCertification() alone, which needs `canApprove`;
 * exposing it as an editable field would hand a propose-only role the approval
 * gate through the back door.
 *
 * THE GATE IS VISIBLE, NOT HIDDEN. An operator who cannot verify or cannot edit
 * still sees the controls, disabled, with the reason in the title — the same
 * rule MatchDecisionActions follows. Someone has to be able to tell WHY a
 * submittal is stuck, and that is exactly the person without the permission.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  updateCandidate,
  verifyCandidateCertification,
  type ActionResult,
  type CandidatePatch,
} from "@/app/employee/talent-engine/actions";
import {
  candidateStatusLabels,
  candidateStatuses,
  type CandidateRow,
  type CandidateStatus,
} from "@/lib/talent-engine/types";
import { splitList, parseOptionalNumber } from "./intake";

const noApproveReason =
  "Verifying a certification is the human gate that unblocks submittal — your role can see the claim but not confirm it.";
const noProposeReason = "Editing a candidate record requires proposing permission.";

/** Why an operator should care that a cert is still unverified. */
const verificationConsequence =
  "A job order's required certifications must be verified here before a match for this candidate can be submitted to the client. An unverified requirement blocks the submittal.";

function messageFor(result: ActionResult | null | undefined, fallback: string): string {
  const values = Object.values(result?.fieldErrors ?? {});
  return result?.error || values[0] || fallback;
}

/** `<input type="date">` only accepts YYYY-MM-DD; slice so a timestamp cannot blank the field. */
function dateValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

export function CandidateManagePanel({
  candidate,
  canPropose,
  canApprove,
}: {
  candidate: CandidateRow;
  /** Gates the edit fields — updateCandidate re-checks this on the server. */
  canPropose: boolean;
  /** Gates certification verification — verifyCandidateCertification re-checks it. */
  canApprove: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Verification and editing are separate controls with separate outcomes, so
  // each reports next to the control the operator actually pressed.
  const [certError, setCertError] = useState("");
  const [certNotice, setCertNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  /** Which cert is mid-flight, so the spinner lands on the button that was pressed. */
  const [pendingCert, setPendingCert] = useState<string | null>(null);

  // The action normalises case before it compares, so the display must too —
  // otherwise "csp" verified against a claimed "CSP" would still render as
  // unverified and invite a second, failing, click.
  const verified = new Set(
    candidate.verified_certifications.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
  );

  function handleVerify(certification: string) {
    setCertError("");
    setCertNotice("");
    setPendingCert(certification);
    startTransition(async () => {
      const result = await verifyCandidateCertification(candidate.id, certification);
      setPendingCert(null);
      if (!result?.ok) {
        setCertError(messageFor(result, `${certification} could not be verified.`));
        return;
      }
      setCertNotice(`${certification} is verified — it no longer blocks submittal.`);
      router.refresh();
    });
  }

  /**
   * Builds a patch of CHANGED fields only. An update that names a field it did
   * not change is not harmless here: rewriting `certifications` makes the
   * action re-derive the verified list, which can drop a verification.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    const payExpectation = parseOptionalNumber(data.get("pay_expectation"));
    const yearsRaw = parseOptionalNumber(data.get("years_experience"));
    if (payExpectation === undefined || yearsRaw === undefined) {
      setEditNotice("");
      setEditError("Pay ask and years of experience must be numbers.");
      return;
    }
    const yearsExperience = yearsRaw === null ? null : Math.trunc(yearsRaw);

    const patch: CandidatePatch = {};

    const fullName = String(data.get("full_name") ?? "").trim();
    if (fullName !== candidate.full_name.trim()) patch.fullName = fullName;

    const email = String(data.get("email") ?? "").trim();
    if (email !== (candidate.email ?? "")) patch.email = email || null;

    const phone = String(data.get("phone") ?? "").trim();
    if (phone !== (candidate.phone ?? "")) patch.phone = phone || null;

    const location = String(data.get("location") ?? "").trim();
    if (location !== (candidate.location ?? "")) patch.location = location || null;

    if (payExpectation !== candidate.pay_expectation) patch.payExpectation = payExpectation;
    if (yearsExperience !== candidate.years_experience) patch.yearsExperience = yearsExperience;

    const certifications = splitList(data.get("certifications"));
    if (!sameList(certifications, candidate.certifications)) patch.certifications = certifications;

    const verticals = splitList(data.get("verticals"));
    if (!sameList(verticals, candidate.verticals)) patch.verticals = verticals;

    const willingToRelocate = data.get("willing_to_relocate") === "on";
    if (willingToRelocate !== candidate.willing_to_relocate) patch.willingToRelocate = willingToRelocate;

    const availabilityDate = String(data.get("availability_date") ?? "");
    if (availabilityDate !== dateValue(candidate.availability_date)) {
      patch.availabilityDate = availabilityDate || null;
    }

    const statusRaw = String(data.get("status") ?? candidate.status);
    const status = (candidateStatuses as readonly string[]).includes(statusRaw)
      ? (statusRaw as CandidateStatus)
      : candidate.status;
    if (status !== candidate.status) patch.status = status;

    if (Object.keys(patch).length === 0) {
      setEditError("");
      setEditNotice("Nothing changed, so nothing was saved.");
      return;
    }

    setEditError("");
    setEditNotice("");
    startTransition(async () => {
      const result = await updateCandidate(candidate.id, patch);
      if (!result?.ok) {
        setEditError(messageFor(result, "The candidate could not be updated."));
        return;
      }
      setEditNotice("Changes saved.");
      router.refresh();
    });
  }

  const verifyTitle = canApprove ? undefined : noApproveReason;
  const editTitle = canPropose ? undefined : noProposeReason;
  const fieldsDisabled = isPending || !canPropose;

  return (
    <div className="talent-intake">
      <button
        aria-expanded={open}
        className="talent-intake-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={14} />
        {open ? "Close" : `Manage ${candidate.full_name}`}
      </button>

      {open ? (
        <>
          <div className="talent-intake-form">
            <p className="talent-review-heading talent-field-wide">Certifications</p>
            <p className="talent-action-hint talent-field-wide">{verificationConsequence}</p>

            {certError ? (
              <p className="talent-intake-error" role="alert">
                {certError}
              </p>
            ) : null}
            {certNotice ? (
              <p className="talent-action-hint talent-field-wide" role="status">
                {certNotice}
              </p>
            ) : null}

            {candidate.certifications.length === 0 ? (
              <p className="talent-action-hint talent-field-wide">
                No certifications are claimed for this candidate. Add them in the edit fields below, then verify each
                one.
              </p>
            ) : (
              <ul className="talent-list talent-field-wide">
                {candidate.certifications.map((certification, index) => {
                  const isVerified = verified.has(certification.trim().toLowerCase());
                  const busy = pendingCert === certification;
                  return (
                    <li className="talent-row" key={`${certification}-${index}`}>
                      <span className="talent-lead-cert">{certification}</span>
                      <span className="talent-row-main">
                        <span
                          className="talent-row-sub"
                          title={
                            isVerified
                              ? `${certification} has been confirmed by a human reviewer and no longer blocks submittal.`
                              : `${certification} is claimed but unconfirmed. A job order requiring it cannot be submitted for this candidate.`
                          }
                        >
                          {isVerified ? "Verified" : "Claimed, not verified"}
                        </span>
                      </span>
                      {isVerified ? (
                        <span className="talent-row-rate">
                          <span className="talent-rate-unit">verified</span>
                        </span>
                      ) : (
                        <button
                          aria-label={`Verify ${certification} for ${candidate.full_name}`}
                          className="talent-btn talent-btn-approve"
                          disabled={isPending || !canApprove}
                          onClick={() => handleVerify(certification)}
                          title={verifyTitle}
                          type="button"
                        >
                          {busy ? (
                            <Loader2 aria-hidden="true" className="spin" size={14} />
                          ) : (
                            <ShieldCheck aria-hidden="true" size={14} />
                          )}
                          {busy ? "Verifying…" : "Verify"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canApprove ? null : <p className="talent-action-hint talent-field-wide">{noApproveReason}</p>}
          </div>

          <form className="talent-intake-form" onSubmit={handleSubmit}>
            <p className="talent-review-heading talent-field-wide">Edit candidate</p>
            {editError ? (
              <p className="talent-intake-error" role="alert">
                {editError}
              </p>
            ) : null}
            {editNotice ? (
              <p className="talent-action-hint talent-field-wide" role="status">
                {editNotice}
              </p>
            ) : null}

            <label className="talent-field talent-field-wide" title={editTitle}>
              <span>Full name</span>
              <input
                defaultValue={candidate.full_name}
                disabled={fieldsDisabled}
                maxLength={200}
                name="full_name"
                required
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Email</span>
              <input
                defaultValue={candidate.email ?? ""}
                disabled={fieldsDisabled}
                maxLength={200}
                name="email"
                placeholder="optional"
                type="email"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Phone</span>
              <input
                defaultValue={candidate.phone ?? ""}
                disabled={fieldsDisabled}
                maxLength={40}
                name="phone"
                placeholder="optional"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Pay ask $/hr</span>
              <input
                defaultValue={candidate.pay_expectation === null ? "" : String(candidate.pay_expectation)}
                disabled={fieldsDisabled}
                inputMode="decimal"
                name="pay_expectation"
                placeholder="e.g. 70"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Years exp.</span>
              <input
                defaultValue={candidate.years_experience === null ? "" : String(candidate.years_experience)}
                disabled={fieldsDisabled}
                inputMode="numeric"
                name="years_experience"
                placeholder="e.g. 14"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Certifications</span>
              <input
                defaultValue={candidate.certifications.join(", ")}
                disabled={fieldsDisabled}
                maxLength={300}
                name="certifications"
                placeholder="CSP, CHST (comma-separated)"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Verticals</span>
              <input
                defaultValue={candidate.verticals.join(", ")}
                disabled={fieldsDisabled}
                maxLength={300}
                name="verticals"
                placeholder="Pharma, Solar (comma-separated)"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Location</span>
              <input
                defaultValue={candidate.location ?? ""}
                disabled={fieldsDisabled}
                maxLength={120}
                name="location"
                placeholder="e.g. Phoenix, AZ"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Available from</span>
              <input
                defaultValue={dateValue(candidate.availability_date)}
                disabled={fieldsDisabled}
                name="availability_date"
                type="date"
              />
            </label>
            <label className="talent-field" title={editTitle}>
              <span>Status</span>
              <select defaultValue={candidate.status} disabled={fieldsDisabled} name="status">
                {candidateStatuses.map((value) => (
                  <option key={value} value={value}>
                    {candidateStatusLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="talent-field talent-field-check" title={editTitle}>
              <input
                defaultChecked={candidate.willing_to_relocate}
                disabled={fieldsDisabled}
                name="willing_to_relocate"
                type="checkbox"
              />
              <span>Open to relocation</span>
            </label>

            <p className="talent-action-hint talent-field-wide">
              Removing a certification from this list also drops any verification that was granted against it.
            </p>

            <button
              className="talent-btn talent-btn-approve talent-intake-submit"
              disabled={fieldsDisabled}
              title={editTitle}
              type="submit"
            >
              {isPending ? <Loader2 aria-hidden="true" className="spin" size={14} /> : null}
              {isPending ? "Saving…" : "Save changes"}
            </button>

            {canPropose ? null : <p className="talent-action-hint talent-field-wide">{noProposeReason}</p>}
          </form>
        </>
      ) : null}
    </div>
  );
}
