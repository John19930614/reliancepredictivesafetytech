// The numbered rail across the top of a client's workflow: where this company
// is in the journey, what it has already cleared, and what is still ahead.
//
// Presentational and server-safe — no "use client", no state, no handlers. The
// page computes the positions and hands them over, so the rail cannot disagree
// with the step card underneath it.
//
// ACCESSIBILITY. The circles and the connecting line are decoration
// (aria-hidden); the state of each step is carried in text — a visually hidden
// word per step plus aria-current="step" on the one the client is on. This
// follows MatchScoreRing, where the arc is decorative and the value is also
// text. A rail that encoded "done" only as a green tick tells a screen reader
// nothing.

import { Check } from "lucide-react";
import type { StagePosition } from "@/lib/pipeline/stages";

export interface RailStage {
  name: string;
  /** 1-based step number shown in the circle. */
  number: number;
  position: StagePosition;
}

interface StageRailProps {
  stages: RailStage[];
}

/** Word appended for assistive tech, since colour alone carries the state. */
const positionWord: Record<StagePosition, string> = {
  done: "completed",
  current: "current step",
  future: "not started",
};

export function StageRail({ stages }: StageRailProps) {
  return (
    <nav aria-label="Client journey" className="wf-rail-wrap">
      <ol className="wf-rail">
        {stages.map((stage) => (
          <li
            aria-current={stage.position === "current" ? "step" : undefined}
            className={`wf-rail-step wf-rail-step-${stage.position}`}
            key={stage.name}
          >
            <span aria-hidden="true" className="wf-rail-node">
              {stage.position === "done" ? <Check size={16} /> : stage.number}
            </span>
            <span className="wf-rail-label">{stage.name}</span>
            <span className="wf-visually-hidden">{` — ${positionWord[stage.position]}`}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
