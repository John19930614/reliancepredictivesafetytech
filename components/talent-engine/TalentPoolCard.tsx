import { HardHat } from "lucide-react";
import type { CandidateRow } from "@/lib/talent-engine/types";
import { TalentAiTag, TalentCard, TalentEmpty } from "./TalentCard";
import { CandidateCreateForm } from "./CandidateCreateForm";
import { avatarTintClass, formatRate, initials, joinMeta } from "./format";

/**
 * The EHS professionals we can place. The rate on the right is their PAY ASK —
 * the bottom half of the spread. Certifications are shown next to the name
 * because a required-but-unverified cert blocks submittal downstream.
 */
export function TalentPoolCard({
  candidates,
  activeCount,
  canPropose,
}: {
  candidates: CandidateRow[];
  activeCount: number;
  canPropose: boolean;
}) {
  return (
    <TalentCard
      count={activeCount > 0 ? `${activeCount} active` : null}
      icon={<HardHat size={15} />}
      tag={<TalentAiTag label="AI screening" />}
      title="EHS Talent Pool"
    >
      {canPropose ? <CandidateCreateForm /> : null}
      {candidates.length === 0 ? (
        <TalentEmpty
          hint="Sourced and screened EHS professionals land here with the hourly rate they are asking for."
          title="No candidates in the pool yet"
        />
      ) : (
        <ul className="talent-list">
          {candidates.map((candidate) => {
            const certs = candidate.certifications.slice(0, 3).join(", ");
            const title = certs ? `${candidate.full_name} · ${certs}` : candidate.full_name;
            return (
              <li className="talent-row" key={candidate.id}>
                <span
                  aria-hidden="true"
                  className={`talent-avatar talent-avatar-square ${avatarTintClass(candidate.id)}`}
                >
                  {initials(candidate.full_name)}
                </span>
                <span className="talent-row-main">
                  <span className="talent-row-title" title={title}>
                    {title}
                  </span>
                  <span className="talent-row-sub">
                    {joinMeta([
                      candidate.years_experience ? `${candidate.years_experience} yrs` : null,
                      candidate.verticals[0] ?? null,
                      candidate.willing_to_relocate ? "open to relocate" : candidate.location,
                    ]) || "No experience detail on file"}
                  </span>
                </span>
                <span className="talent-row-rate">
                  <span className="talent-rate-value">
                    {candidate.pay_expectation === null ? "—" : formatRate(candidate.pay_expectation)}
                  </span>
                  <span className="talent-rate-unit">pay ask</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </TalentCard>
  );
}
