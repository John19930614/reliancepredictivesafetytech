import { Bot } from "lucide-react";
import type { TalentActivityRow } from "@/lib/talent-engine/types";
import { TalentCard, TalentEmpty } from "./TalentCard";
import { formatRelativeTime } from "./format";

/**
 * The append-only audit trail, read back as a feed.
 *
 * Each entry is tagged with the autonomy tier it was taken at, in words:
 * AUTO (tier 1, the agent acted alone), GATE (tier 2, the agent drafted and is
 * waiting on a human), HUMAN (a person committed it). That tag is the
 * defensible part — it is what tells you, months later, whether a rate was set
 * by a machine or by a named human.
 */
function toneFor(event: TalentActivityRow): { dot: string; badge: string; label: string } {
  if (event.actor_type === "human") {
    return { dot: "talent-feed-dot-human", badge: "talent-feed-badge-human", label: "HUMAN" };
  }
  if (event.agent_name === "Margin Agent") {
    return { dot: "talent-feed-dot-money", badge: "talent-feed-badge-gate", label: event.tier === 1 ? "AUTO" : "GATE" };
  }
  if (event.tier === 2) {
    return { dot: "talent-feed-dot-gate", badge: "talent-feed-badge-gate", label: "GATE" };
  }
  if (event.tier === 3) {
    return { dot: "talent-feed-dot-human", badge: "talent-feed-badge-human", label: "HUMAN-ONLY" };
  }
  return { dot: "talent-feed-dot-ai", badge: "talent-feed-badge-auto", label: "AUTO" };
}

function actorLabel(event: TalentActivityRow): string {
  if (event.agent_name) return event.agent_name;
  if (event.actor_type === "human") return "Human review";
  return "System";
}

export function AgentActivityFeed({ events }: { events: TalentActivityRow[] }) {
  return (
    <TalentCard count={events.length > 0 ? "live" : null} icon={<Bot size={15} />} title="AI Agent Activity">
      {events.length === 0 ? (
        <TalentEmpty
          hint="Every sourcing run, price check, rate proposal and human decision writes a line here — it is the audit trail on the money."
          title="No agent activity logged yet"
        />
      ) : (
        <ul className="talent-feed">
          {events.map((event) => {
            const tone = toneFor(event);
            return (
              <li className="talent-feed-item" key={event.id}>
                <span aria-hidden="true" className={`talent-feed-dot ${tone.dot}`} />
                <div>
                  <p className="talent-feed-text">
                    <strong>{actorLabel(event)}</strong> {event.summary}{" "}
                    <span className={`talent-feed-badge ${tone.badge}`}>· {tone.label}</span>
                  </p>
                  <p className="talent-feed-meta">{formatRelativeTime(event.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </TalentCard>
  );
}
