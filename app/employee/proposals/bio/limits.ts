// Length bounds for a proposal bio, in a plain module rather than actions.ts:
// a "use server" file may only export async functions — exporting this object
// from there makes Next.js throw at module evaluation and takes every bio
// action down with it (lib/guardrails/use-server-exports.test.ts enforces
// this repo-wide). BioEditor reads these for its maxLength attributes; the
// actions re-check them server-side.

/** Mirrors the CHECK constraints on proposal_team_bios. */
export const bioLimits = Object.freeze({
  displayName: 120,
  title: 160,
  bio: 4000,
});
