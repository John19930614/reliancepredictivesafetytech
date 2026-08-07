import { Zap } from "lucide-react";
import type { MatchQueueRow } from "@/lib/talent-engine/types";
import { TalentCard, TalentEmpty, TalentGateTag } from "./TalentCard";
import { MatchCard } from "./MatchCard";
import { MatchDraftForm, type MatchDraftOption } from "./MatchDraftForm";

/**
 * The AI Match Queue — the heart of the module. Nothing in it has left the
 * building: every row is a candidate an agent priced and drafted, waiting on a
 * human to approve, counter, hold or reject.
 */
export function MatchQueueCard({
  matches,
  pendingCount,
  minSpread,
  hoursPerWeek,
  canApprove,
  canSetRate,
  canPropose,
  orderOptions,
  candidateOptions,
}: {
  matches: MatchQueueRow[];
  /** Total rows awaiting a decision, which may exceed what is rendered. */
  pendingCount: number;
  minSpread: number;
  hoursPerWeek: number;
  canApprove: boolean;
  canSetRate: boolean;
  canPropose: boolean;
  orderOptions: MatchDraftOption[];
  candidateOptions: MatchDraftOption[];
}) {
  const hidden = Math.max(0, pendingCount - matches.length);

  return (
    <TalentCard
      count={pendingCount > 0 ? `${pendingCount} pending` : null}
      icon={<Zap size={15} />}
      tag={<TalentGateTag label="Needs your approval" />}
      title="AI Match Queue"
    >
      {canPropose ? <MatchDraftForm candidates={candidateOptions} orders={orderOptions} /> : null}
      {matches.length === 0 ? (
        <TalentEmpty
          hint="When the matching agent pairs a candidate with an order, it prices the spread and parks the draft here for your sign-off. Nothing is ever submitted to a client without it."
          title="Nothing waiting on you"
        />
      ) : (
        <>
          {matches.map((match) => (
            <MatchCard
              canApprove={canApprove}
              canSetRate={canSetRate}
              hoursPerWeek={hoursPerWeek}
              key={match.id}
              match={match}
              minSpread={minSpread}
            />
          ))}
          {hidden > 0 ? (
            <p className="talent-action-hint" style={{ marginTop: 12 }}>
              {hidden} more {hidden === 1 ? "match is" : "matches are"} queued behind these.
            </p>
          ) : null}
        </>
      )}
    </TalentCard>
  );
}
