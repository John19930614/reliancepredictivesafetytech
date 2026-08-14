"use client";

// The one screen that can finish setting up a company.
//
// WHY IT EXISTS. Companies created since lib/clients/provision.ts landed get a
// checklist, a folder set and a profile row on creation. Every company created
// before that has none of them, and a company with no checklist cannot clear a
// single stage gate — lib/pipeline/gates.ts reads those exact rows. The board
// showed those companies as simply not advancing, with nothing on screen saying
// why or offering a way out.
//
// IT ONLY APPEARS WHEN SOMETHING IS ACTUALLY MISSING. A fully provisioned
// company renders nothing at all, so this is not one more permanent banner
// competing for attention on a record that is already fine.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, TriangleAlert } from "lucide-react";
import { backfillClientSetup } from "@/app/employee/clients/[id]/actions";

export interface ClientSetupBannerProps {
  clientId: string;
  /** True when this company has no onboarding checklist rows at all. */
  needsChecklist: boolean;
  /** True when one or more of the five standard folders is absent. */
  needsFolders: boolean;
  /** True when no company_profiles row exists yet. */
  needsProfile: boolean;
}

export function ClientSetupBanner({ clientId, needsChecklist, needsFolders, needsProfile }: ClientSetupBannerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!needsChecklist && !needsFolders && !needsProfile) return null;

  const missing: string[] = [];
  if (needsChecklist) missing.push("an onboarding checklist");
  if (needsFolders) missing.push("its File Center folders");
  if (needsProfile) missing.push("a company profile");

  const list =
    missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

  function run() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try {
        const result = await backfillClientSetup(clientId);
        if (result.ok) {
          const counts = result.created ?? { onboarding: 0, folders: 0, profile: 0 };
          const parts: string[] = [];
          if (counts.onboarding > 0) parts.push(`${counts.onboarding} checklist items`);
          if (counts.folders > 0) parts.push(`${counts.folders} folders`);
          if (counts.profile > 0) parts.push("a profile");
          setDone(parts.length > 0 ? `Created ${parts.join(", ")}.` : "Everything was already in place.");
          router.refresh();
        } else {
          setError(result.error ?? "Could not set this company up.");
        }
      } catch {
        setError("Something went wrong reaching the server. Try again in a moment.");
      }
    });
  }

  return (
    <section className="portal-card lc-setup-banner">
      <div className="lc-panel-head">
        <h2>
          <TriangleAlert aria-hidden="true" size={16} /> This company is not fully set up
        </h2>
      </div>
      <p className="lc-body">
        It is missing {list}.{" "}
        {needsChecklist
          ? "Without a checklist it cannot clear a stage gate, so it will not move on the pipeline board."
          : null}
      </p>

      {error ? (
        <p className="lc-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="lc-meta" role="status">
          {done}
        </p>
      ) : null}

      <div className="lc-form-actions">
        <button className="lc-btn lc-btn-primary" disabled={pending} onClick={run} type="button">
          <PackagePlus aria-hidden="true" size={15} /> {pending ? "Setting up…" : "Set this company up"}
        </button>
      </div>
      <p className="lc-meta">
        Adds only what is missing. Nothing already on the record is changed, and pressing it twice is safe.
      </p>
    </section>
  );
}
