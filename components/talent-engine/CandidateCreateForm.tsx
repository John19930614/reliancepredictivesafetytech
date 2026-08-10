"use client";

/**
 * Intake form for an EHS professional — the pay-ask side of every spread.
 *
 * Same shape as JobOrderCreateForm: a collapsed client island in the Talent
 * Pool card that calls the createCandidate Server Action and refreshes.
 *
 * There is deliberately NO field for verified certifications here: claiming a
 * cert is intake, verifying one is a gated action (canApprove) because it
 * unblocks submittal.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { createCandidate } from "@/app/employee/talent-engine/actions";
import { splitList, parseOptionalNumber } from "./intake";
import { VerticalChecklist, readVerticalsFromForm } from "./VerticalSelect";

export function CandidateCreateForm({ verticalOptions }: { verticalOptions?: string[] } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const payExpectation = parseOptionalNumber(data.get("pay_expectation"));
    const yearsExperience = parseOptionalNumber(data.get("years_experience"));
    if (payExpectation === undefined || yearsExperience === undefined) {
      setError("Pay ask and years of experience must be numbers.");
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await createCandidate({
        fullName: String(data.get("full_name") ?? "").trim(),
        email: String(data.get("email") ?? "").trim() || null,
        phone: String(data.get("phone") ?? "").trim() || null,
        yearsExperience: yearsExperience === null ? null : Math.trunc(yearsExperience),
        certifications: splitList(data.get("certifications")),
        verticals: readVerticalsFromForm(data),
        location: String(data.get("location") ?? "").trim() || null,
        willingToRelocate: data.get("willing_to_relocate") === "on",
        payExpectation,
        availabilityDate: String(data.get("availability_date") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "The candidate could not be added.");
        return;
      }
      form.reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="talent-intake">
      <button
        aria-expanded={open}
        className="talent-intake-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <UserPlus size={14} aria-hidden="true" />
        {open ? "Close" : "Add candidate"}
      </button>

      {open ? (
        <form className="talent-intake-form" onSubmit={handleSubmit}>
          {error ? <p className="talent-intake-error" role="alert">{error}</p> : null}
          <label className="talent-field talent-field-wide">
            <span>Full name</span>
            <input name="full_name" placeholder="e.g. Maria Reyes" required maxLength={200} />
          </label>
          <label className="talent-field">
            <span>Email</span>
            <input name="email" type="email" placeholder="optional" maxLength={200} />
          </label>
          <label className="talent-field">
            <span>Phone</span>
            <input name="phone" placeholder="optional" maxLength={40} />
          </label>
          <label className="talent-field">
            <span>Pay ask $/hr</span>
            <input inputMode="decimal" name="pay_expectation" placeholder="e.g. 70" />
          </label>
          <label className="talent-field">
            <span>Years exp.</span>
            <input inputMode="numeric" name="years_experience" placeholder="e.g. 14" />
          </label>
          <label className="talent-field">
            <span>Certifications</span>
            <input name="certifications" placeholder="CSP, CHST (comma-separated)" maxLength={300} />
          </label>
          <VerticalChecklist options={verticalOptions} />
          <label className="talent-field">
            <span>Location</span>
            <input name="location" placeholder="e.g. Phoenix, AZ" maxLength={120} />
          </label>
          <label className="talent-field">
            <span>Available from</span>
            <input name="availability_date" type="date" />
          </label>
          <label className="talent-field talent-field-check">
            <input name="willing_to_relocate" type="checkbox" />
            <span>Open to relocation</span>
          </label>
          <button className="talent-btn talent-btn-approve talent-intake-submit" disabled={isPending} type="submit">
            {isPending ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
            {isPending ? "Adding…" : "Add candidate"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
