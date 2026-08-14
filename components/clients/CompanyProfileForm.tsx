"use client";

// The company profile, and what it prices.
//
// The estimate recomputes AS YOU TYPE, from the draft rather than the saved
// row. That is the point of the screen: a salesperson can see what another
// hundred employees, or a hazard class they were unsure about, does to the
// number — before committing anything. The formula is pure and synchronous
// (lib/pricing/contract-estimate.ts), so this costs nothing and needs no
// server round-trip.
//
// Nothing here writes to the deal. The estimate is advisory: somebody decides
// what the opportunity is worth, and this tells them what the profile implies.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Calculator, ShieldAlert, TriangleAlert } from "lucide-react";
import { saveCompanyProfile, type CompanyProfileInput } from "@/app/employee/clients/[id]/actions";
import { estimateContractValue, hazardClasses } from "@/lib/pricing/contract-estimate";

export interface CompanyProfileDraft {
  employee_count: string;
  site_count: string;
  annual_revenue: string;
  primary_state: string;
  states_operated: string;
  naics_code: string;
  hazard_class: string;
  emr: string;
  trir: string;
  recordables_12mo: string;
  lost_time_12mo: string;
  osha_citations_3yr: string;
  contractor_share_pct: string;
  union_workforce: boolean;
  notes: string;
}

export const emptyProfileDraft: CompanyProfileDraft = {
  employee_count: "",
  site_count: "",
  annual_revenue: "",
  primary_state: "",
  states_operated: "",
  naics_code: "",
  hazard_class: "",
  emr: "",
  trir: "",
  recordables_12mo: "",
  lost_time_12mo: "",
  osha_citations_3yr: "",
  contractor_share_pct: "",
  union_workforce: false,
  notes: "",
};

const hazardHelp: Record<string, string> = {
  low: "Office, professional services, light retail",
  moderate: "Warehousing, light manufacturing, facilities",
  high: "Construction, heavy manufacturing, transport",
  severe: "Oil & gas, roofing, confined space, high voltage",
};

/** A blank means "not known" — never zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

interface CompanyProfileFormProps {
  clientId: string;
  initial: CompanyProfileDraft;
  canManage: boolean;
  /** True when company_profiles has not been migrated yet. */
  unavailable?: boolean;
}

export function CompanyProfileForm({ clientId, initial, canManage, unavailable }: CompanyProfileFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CompanyProfileDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Recomputed from the DRAFT, so the number tracks what is on screen rather
  // than what was last saved.
  const estimate = useMemo(
    () =>
      estimateContractValue({
        employeeCount: toNumber(draft.employee_count),
        siteCount: toNumber(draft.site_count),
        annualRevenue: toNumber(draft.annual_revenue),
        hazardClass: draft.hazard_class || null,
        emr: toNumber(draft.emr),
        trir: toNumber(draft.trir),
        contractorSharePct: toNumber(draft.contractor_share_pct),
      }),
    [draft],
  );

  function set<K extends keyof CompanyProfileDraft>(key: K, value: CompanyProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }

  function save() {
    setError(null);
    setFieldErrors({});
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await saveCompanyProfile(clientId, draft as unknown as CompanyProfileInput);
        if (result.ok) {
          setNotice("Profile saved.");
          router.refresh();
        } else {
          setError(result.error ?? "Could not save the profile.");
          setFieldErrors(result.fieldErrors ?? {});
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  if (unavailable) {
    return (
      <section className="portal-card">
        <h2>Company Profile</h2>
        <p className="lc-empty">
          <TriangleAlert aria-hidden="true" size={14} /> Company profiles are not set up in Supabase yet. Apply the
          latest database migrations and this becomes editable.
        </p>
      </section>
    );
  }

  const field = (
    key: keyof CompanyProfileDraft,
    label: string,
    hint?: string,
    type: "text" | "number" = "number",
  ) => (
    <label className="lc-field">
      <span>{label}</span>
      <input
        disabled={pending || !canManage}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={(event) => set(key, event.target.value as CompanyProfileDraft[typeof key])}
        type={type}
        value={draft[key] as string}
      />
      {fieldErrors[key] ? <small className="lc-field-error">{fieldErrors[key]}</small> : hint ? <small>{hint}</small> : null}
    </label>
  );

  return (
    <section className="portal-card">
      <div className="lc-panel-head">
        <h2>
          <Building2 aria-hidden="true" size={16} /> Company Profile
        </h2>
        <span className="lc-pill lc-pill-neutral">Drives the estimate</span>
      </div>

      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="lc-meta" role="status">
          {notice}
        </p>
      ) : null}

      {!canManage ? (
        <p className="lc-body">
          You can see this company&apos;s profile, but your role cannot change it.
        </p>
      ) : null}

      <h3 className="lc-subhead">Size</h3>
      <div className="lc-field-grid">
        {field("employee_count", "Employees", "The one figure the estimate cannot work without")}
        {field("site_count", "Locations", "Sites, yards or offices")}
        {field("annual_revenue", "Annual revenue", "Context only — never raises the estimate")}
      </div>

      <h3 className="lc-subhead">Where</h3>
      <div className="lc-field-grid">
        {field("primary_state", "Primary state", undefined, "text")}
        {field("states_operated", "States operated", "Free text — caveats welcome", "text")}
        {field("naics_code", "NAICS code", "2 to 6 digits", "text")}
      </div>

      <h3 className="lc-subhead">
        <ShieldAlert aria-hidden="true" size={14} /> Risk
      </h3>
      <div className="lc-field-grid">
        <label className="lc-field">
          <span>Hazard class</span>
          <select
            disabled={pending || !canManage}
            onChange={(event) => set("hazard_class", event.target.value)}
            value={draft.hazard_class}
          >
            <option value="">Not classified</option>
            {hazardClasses.map((hazard) => (
              <option key={hazard} value={hazard}>
                {hazard[0].toUpperCase() + hazard.slice(1)}
              </option>
            ))}
          </select>
          <small>{hazardHelp[draft.hazard_class] ?? "The biggest single driver after headcount"}</small>
        </label>
        {field("emr", "EMR", "1.00 is the industry average")}
        {field("trir", "TRIR", "Recordables per 100 workers per year")}
        {field("recordables_12mo", "Recordables (12 mo)")}
        {field("lost_time_12mo", "Lost-time (12 mo)", "Cannot exceed recordables")}
        {field("osha_citations_3yr", "OSHA citations (3 yr)")}
        {field("contractor_share_pct", "Contract labour %", "0-100")}
        <label className="lc-field lc-field-check">
          <input
            checked={draft.union_workforce}
            disabled={pending || !canManage}
            onChange={(event) => set("union_workforce", event.target.checked)}
            type="checkbox"
          />
          <span>Union workforce</span>
        </label>
      </div>

      <label className="lc-field">
        <span>Notes</span>
        <textarea
          disabled={pending || !canManage}
          onChange={(event) => set("notes", event.target.value)}
          rows={3}
          value={draft.notes}
        />
      </label>

      {/* ------------------------------------------------------------------ */}
      {/* The estimate                                                        */}
      {/* ------------------------------------------------------------------ */}

      <div className="lc-estimate">
        <div className="lc-panel-head">
          <h3>
            <Calculator aria-hidden="true" size={15} /> Estimated annual contract value
          </h3>
          <span className={`lc-pill lc-pill-${estimate.confidence === "high" ? "good" : estimate.confidence === "none" ? "warn" : "neutral"}`}>
            {estimate.confidence === "none" ? "No estimate" : `${estimate.confidence} confidence`}
          </span>
        </div>

        {estimate.ok ? (
          <>
            <p className="lc-estimate-figure">
              {money(estimate.low, estimate.currency)} – <strong>{money(estimate.mid, estimate.currency)}</strong> –{" "}
              {money(estimate.high, estimate.currency)}
            </p>
            <ul className="lc-estimate-drivers">
              {estimate.drivers.map((driver) => (
                <li key={driver.label}>
                  <strong>{driver.label}</strong>
                  {driver.amount !== undefined ? ` · ${money(driver.amount, estimate.currency)}` : ""}
                  {driver.multiplier !== undefined ? ` · ×${driver.multiplier}` : ""}
                  <span> — {driver.detail}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="lc-empty">
            <Calculator aria-hidden="true" size={14} /> Enter an employee count and this estimates the contract.
          </p>
        )}

        {estimate.missing.length > 0 ? (
          <p className="lc-meta">
            Would sharpen it: {estimate.missing.join(" · ")}
          </p>
        ) : null}

        <p className="lc-meta">
          Advisory. Nothing here changes a deal&apos;s value until somebody enters it on the opportunity.
        </p>
      </div>

      <div className="lc-form-actions">
        <button className="lc-btn lc-btn-primary" disabled={pending || !canManage} onClick={save} type="button">
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </section>
  );
}
