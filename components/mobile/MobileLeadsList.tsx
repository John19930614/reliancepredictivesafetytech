"use client";

import { ChevronRight, Search, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { lifecycleStages } from "@/lib/company-data";
import { formatRelativeTimestamp } from "@/lib/mobile-app";
import { MobileAvatar } from "./MobileAvatar";
import { MobileHeader } from "./MobileHeader";
import { getStageTone } from "./stage-tone";

type Lead = {
  id: string;
  name: string;
  contactName: string | null;
  lifecycleStage: string;
  status: string;
  owner: string | null;
  updatedAt: string | null;
};

export function MobileLeadsList({ leads }: { leads: Lead[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<string>("all");

  const stagesInUse = useMemo(() => {
    const present = new Set(leads.map((lead) => lead.lifecycleStage));
    return lifecycleStages.filter((candidate) => present.has(candidate));
  }, [leads]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return leads.filter((lead) => {
      if (stage !== "all" && lead.lifecycleStage !== stage) {
        return false;
      }

      if (!needle) {
        return true;
      }

      return (
        lead.name.toLowerCase().includes(needle) ||
        (lead.contactName ?? "").toLowerCase().includes(needle) ||
        (lead.owner ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, query, stage]);

  const now = new Date();

  return (
    <>
      <MobileHeader
        eyebrow="Leads"
        subtitle={`${visible.length} of ${leads.length} in the pipeline`}
        title="Pipeline"
      />

      <label className="m-search m-search-inline">
        <Search aria-hidden="true" size={16} strokeWidth={2.1} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search company, contact, or owner"
          type="search"
          value={query}
        />
      </label>

      <div className="m-chips" role="tablist">
        <button
          aria-selected={stage === "all"}
          className={`m-chip${stage === "all" ? " is-active" : ""}`}
          onClick={() => setStage("all")}
          role="tab"
          type="button"
        >
          All stages
        </button>
        {stagesInUse.map((candidate) => (
          <button
            aria-selected={stage === candidate}
            className={`m-chip${stage === candidate ? " is-active" : ""}`}
            key={candidate}
            onClick={() => setStage(candidate)}
            role="tab"
            type="button"
          >
            {candidate}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="m-empty">
          <Target aria-hidden="true" size={26} strokeWidth={1.7} />
          <p>No leads match.</p>
          <small>Try a different stage or clear the search.</small>
        </div>
      ) : (
        <ul className="m-list m-list-cards">
          {visible.map((lead) => (
            <li key={lead.id}>
              <Link className="m-list-row" href={`/m/leads/${lead.id}`}>
                <MobileAvatar name={lead.name} seed={lead.id} />
                <span className="m-list-body">
                  <strong>{lead.name}</strong>
                  <small className="m-truncate">
                    {lead.contactName ? `${lead.contactName} · ` : ""}
                    {formatRelativeTimestamp(lead.updatedAt, now)}
                  </small>
                  <span className={`m-pill ${getStageTone(lead.lifecycleStage)}`}>{lead.lifecycleStage}</span>
                </span>
                <ChevronRight aria-hidden="true" className="m-list-arrow" size={16} strokeWidth={2.1} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
