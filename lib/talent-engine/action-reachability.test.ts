/**
 * Every Talent Engine server action must be reachable from the UI.
 *
 * WHY THIS EXISTS. The module first shipped with 15 server actions of which only
 * 8 had any caller in the interface. Each of the orphaned 7 was written, unit
 * tested and permission-gated, so every gate was green — the actions were simply
 * unreachable. Two of those holes were load-bearing:
 *
 *   - `verifyCandidateCertification` had no caller, so a certification could
 *     never be verified, so submittal stayed blocked forever on any job order
 *     with cert requirements. The workflow dead-ended at `approved`.
 *   - `createPlacement` and `logTimesheet` had no callers, so no placement or
 *     timesheet could exist, so the Margin Ledger and every money KPI could only
 *     ever read $0. A margin console that cannot show margin.
 *
 * Unit tests cannot catch this by construction: they import the action and call
 * it directly, which is precisely the thing a user cannot do. This test asserts
 * the wiring instead — that some file under `app/` or `components/` imports each
 * action by name.
 *
 * It is deliberately a COARSE check. It proves a caller exists, not that the
 * control is rendered, enabled, or correct. It is a tripwire against "we forgot
 * the screen", not a substitute for walking the flow.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..");
const actionsFile = join(repoRoot, "app", "employee", "talent-engine", "actions.ts");

/** Directories whose files count as "the UI". */
const uiRoots = [join(repoRoot, "app"), join(repoRoot, "components")];

/**
 * Actions with no UI caller BY DESIGN. Anything listed here needs a reason.
 * An empty list is the healthy state — resist adding to it.
 */
const intentionallyUnreachable: Record<string, string> = {};

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Exported action names, read from the actions module itself. */
function exportedActionNames(): string[] {
  const source = readFileSync(actionsFile, "utf8");
  const names = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  return [...new Set(names)];
}

describe("talent engine — every server action is reachable from the UI", () => {
  const actions = exportedActionNames();

  it("finds the action module and its exports", () => {
    // Guards against the regex silently matching nothing after a refactor,
    // which would make every assertion below vacuously pass.
    expect(actions.length).toBeGreaterThanOrEqual(15);
    expect(actions).toContain("createPlacement");
    expect(actions).toContain("verifyCandidateCertification");
  });

  // The UI files are read once and shared across the per-action assertions.
  const uiSources = uiRoots
    .flatMap((root) => collectSourceFiles(root))
    // The actions module obviously references its own names.
    .filter((file) => file !== actionsFile)
    .map((file) => ({ file, text: readFileSync(file, "utf8") }));

  it("reads a non-trivial set of UI files", () => {
    expect(uiSources.length).toBeGreaterThan(20);
  });

  for (const action of actions) {
    const reason = intentionallyUnreachable[action];

    it(`${action} has a caller in the UI${reason ? " (or a documented exemption)" : ""}`, () => {
      const callers = uiSources
        .filter(({ text }) => new RegExp(`\\b${action}\\b`).test(text))
        .map(({ file }) => file.slice(repoRoot.length + 1));

      if (reason) {
        expect(callers, `${action} is exempt (${reason}) but now HAS a caller — remove the exemption`).toHaveLength(0);
        return;
      }

      expect(
        callers,
        `No UI file references ${action}(). It is written and tested but no user can invoke it. ` +
          `Either wire it into a page/component, or add it to intentionallyUnreachable with a reason.`,
      ).not.toHaveLength(0);
    });
  }
});
