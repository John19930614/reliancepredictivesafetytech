"use client";

/**
 * Intake form for a client job order — the bill-rate side of every spread.
 *
 * A small client island in the Job Orders card, collapsed behind a "New job
 * order" toggle so the console keeps its dashboard shape. It imports the
 * Server Action and nothing else stateful — no Supabase client reaches the
 * browser bundle (CLAUDE.md, security standards).
 *
 * Rendered only when the viewer canPropose; the bill-rate field additionally
 * requires canSetRate (it is the client price), so for a propose-only viewer
 * the field is disabled with the reason in its title.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPlus, Loader2 } from "lucide-react";
import { createJobOrder } from "@/app/employee/talent-engine/actions";
import { jobOrderPriorities, type JobOrderPriority } from "@/lib/talent-engine/types";
import { splitList, parseOptionalNumber } from "./intake";
import { VerticalDropdown, readVerticalFromForm } from "./VerticalSelect";

interface ClientOption {
  id: string;
  name: string;
}

const noRateReason = "Setting the client bill rate requires rate-setting permission — leave it blank and an approver will price it.";

export function JobOrderCreateForm({
  clients,
  canSetRate,
  verticalOptions,
}: {
  clients: ClientOption[];
  canSetRate: boolean;
  verticalOptions?: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const billRate = parseOptionalNumber(data.get("bill_rate"));
    const minSpread = parseOptionalNumber(data.get("min_spread"));
    const openingsRaw = parseOptionalNumber(data.get("openings"));
    if (billRate === undefined || minSpread === undefined || openingsRaw === undefined) {
      setError("Rates and openings must be numbers.");
      return;
    }

    const priorityRaw = String(data.get("priority") ?? "normal");
    const priority = (jobOrderPriorities as readonly string[]).includes(priorityRaw)
      ? (priorityRaw as JobOrderPriority)
      : "normal";

    setError("");
    startTransition(async () => {
      const result = await createJobOrder({
        title: String(data.get("title") ?? "").trim(),
        clientId: String(data.get("client_id") ?? "") || null,
        vertical: readVerticalFromForm(data),
        location: String(data.get("location") ?? "").trim() || null,
        certRequirements: splitList(data.get("cert_requirements")),
        billRate: canSetRate ? billRate : null,
        minSpread: canSetRate ? minSpread : null,
        openings: openingsRaw === null ? 1 : Math.trunc(openingsRaw),
        priority,
        startDate: String(data.get("start_date") ?? "") || null,
      });
      if (!result.ok) {
        setError(result.error ?? Object.values(result.fieldErrors ?? {})[0] ?? "The job order could not be created.");
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
        <ClipboardPlus size={14} aria-hidden="true" />
        {open ? "Close" : "New job order"}
      </button>

      {open ? (
        <form className="talent-intake-form" onSubmit={handleSubmit}>
          {error ? <p className="talent-intake-error" role="alert">{error}</p> : null}
          <label className="talent-field talent-field-wide">
            <span>Title</span>
            <input name="title" placeholder="e.g. Sr. EHS Manager — Data Center" required maxLength={200} />
          </label>
          <label className="talent-field">
            <span>Client</span>
            <select defaultValue="" name="client_id">
              <option value="">Unassigned</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="talent-field">
            <span>Location</span>
            <input name="location" placeholder="e.g. Austin, TX" maxLength={120} />
          </label>
          <VerticalDropdown options={verticalOptions} />
          <label className="talent-field">
            <span>Required certs</span>
            <input name="cert_requirements" placeholder="CSP, CHST (comma-separated)" maxLength={300} />
          </label>
          <label className="talent-field" title={canSetRate ? undefined : noRateReason}>
            <span>Bill rate $/hr</span>
            <input disabled={!canSetRate} inputMode="decimal" name="bill_rate" placeholder="e.g. 95" />
          </label>
          <label className="talent-field" title={canSetRate ? undefined : noRateReason}>
            <span>Spread floor $/hr</span>
            <input disabled={!canSetRate} inputMode="decimal" name="min_spread" placeholder="agency default" />
          </label>
          <label className="talent-field">
            <span>Openings</span>
            <input defaultValue="1" inputMode="numeric" name="openings" />
          </label>
          <label className="talent-field">
            <span>Priority</span>
            <select defaultValue="normal" name="priority">
              {jobOrderPriorities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="talent-field">
            <span>Start date</span>
            <input name="start_date" type="date" />
          </label>
          <button className="talent-btn talent-btn-approve talent-intake-submit" disabled={isPending} type="submit">
            {isPending ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
            {isPending ? "Creating…" : "Create job order"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
