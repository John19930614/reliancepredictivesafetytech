/** Warm-to-green progression so a stage pill reads at a glance on a phone. */
const STAGE_TONES: Record<string, string> = {
  Lead: "tone-slate",
  "First Pitch": "tone-slate",
  "Demo Scheduled": "tone-blue",
  "Demo Completed": "tone-blue",
  "Proposal Sent": "tone-gold",
  "Legal Review": "tone-gold",
  "Contract Sent": "tone-gold",
  "Signed / Won": "tone-green",
  Onboarding: "tone-green",
  "Pilot / Setup": "tone-green",
  "Active Company": "tone-green",
  "Renewal / Expansion": "tone-green",
};

export function getStageTone(stage: string | null | undefined) {
  return STAGE_TONES[stage ?? ""] ?? "tone-slate";
}
