"use client";

// Opens a new opportunity at step 1.
//
// Deliberately short. The lifecycle's own steps are where a deal gets enriched,
// scored, owned and priced — asking for all of that at intake is how leads stop
// being logged at all. Name is the only required field.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createOpportunity } from "@/app/employee/lifecycle/actions";

interface NewOpportunityFormProps {
  canManage: boolean;
  clients: Array<{ id: string; name: string }>;
}

export function NewOpportunityForm({ canManage, clients }: NewOpportunityFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const parsed = Number(value);
        const result = await createOpportunity({
          name,
          clientId: clientId || null,
          value: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
          source: source || null,
        });
        if (result.ok && result.opportunityId) {
          router.push(`/employee/lifecycle/${result.opportunityId}`);
        } else {
          setError(result.error ?? "Could not open the opportunity.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  return (
    <form className="lc-new" onSubmit={submit}>
      <p className="lc-form-title">Open an opportunity</p>

      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}

      <label className="lc-field">
        <span>Name</span>
        <input
          disabled={pending || !canManage}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          placeholder="Northbridge — Predictive Maintenance Platform"
          required
          type="text"
          value={name}
        />
      </label>

      <label className="lc-field">
        <span>Company (optional)</span>
        <select disabled={pending || !canManage} onChange={(event) => setClientId(event.target.value)} value={clientId}>
          <option value="">Not linked yet</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <div className="lc-field-row">
        <label className="lc-field">
          <span>Value (optional)</span>
          <input
            disabled={pending || !canManage}
            inputMode="decimal"
            onChange={(event) => setValue(event.target.value)}
            placeholder="250000"
            type="text"
            value={value}
          />
        </label>

        <label className="lc-field">
          <span>Source (optional)</span>
          <input
            disabled={pending || !canManage}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Website — Contact Us Form"
            type="text"
            value={source}
          />
        </label>
      </div>

      <button
        className="lc-btn lc-btn-primary"
        disabled={pending || !canManage || name.trim().length === 0}
        title={canManage ? undefined : "Your role cannot open opportunities."}
        type="submit"
      >
        <Plus size={15} /> Open at Lead Captured
      </button>
    </form>
  );
}
