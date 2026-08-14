// The 11-step rail across the top of every lifecycle screen.
//
// Presentational and server-safe — no "use client", no state, no handlers. The
// page computes positions and hands them over, so the rail cannot disagree with
// the step header underneath it.
//
// ACCESSIBILITY. The circles and the connecting line are decoration
// (aria-hidden); each step's state is carried in text as well — a visually
// hidden word per step plus aria-current="step" on the live one. A rail that
// encoded "done" only as a colour tells a screen reader nothing.

import { Check, Trophy } from "lucide-react";
import { lifecycleSteps, stepPosition, type StepPosition } from "@/lib/lifecycle/steps";
import { isClosed } from "@/lib/lifecycle/exits";

interface LifecycleRailProps {
  /** The step key the opportunity is on. */
  currentKey: string;
  /** Opportunity status — an exited deal draws its current step as stalled. */
  status: string;
  /** Where each step links to, when the rail is navigable. */
  hrefFor?: (stepKey: string) => string | undefined;
}

const positionWord: Record<StepPosition, string> = {
  done: "completed",
  current: "current step",
  future: "not started",
};

export function LifecycleRail({ currentKey, status, hrefFor }: LifecycleRailProps) {
  const closed = isClosed(status);

  return (
    <nav aria-label="Client lifecycle" className="lc-rail-wrap">
      <ol className="lc-rail">
        {lifecycleSteps.map((step) => {
          const position = stepPosition(step.key, currentKey);
          const href = hrefFor?.(step.key);
          const label = (
            <>
              <span
                aria-hidden="true"
                className={`lc-rail-node${position === "current" && closed ? " lc-rail-node-stalled" : ""}`}
              >
                {position === "done" ? <Check size={15} /> : step.number}
              </span>
              <span className="lc-rail-label">{step.label}</span>
              <span className="lc-visually-hidden">{` — ${positionWord[position]}`}</span>
            </>
          );

          return (
            <li
              aria-current={position === "current" ? "step" : undefined}
              className={`lc-rail-step lc-rail-step-${position}`}
              key={step.key}
            >
              {href ? (
                <a className="lc-rail-link" href={href}>
                  {label}
                </a>
              ) : (
                label
              )}
            </li>
          );
        })}

        {/* The lifecycle ends in a win, not in another step. */}
        <li aria-hidden="true" className="lc-rail-trophy">
          <Trophy size={18} />
        </li>
      </ol>
    </nav>
  );
}
