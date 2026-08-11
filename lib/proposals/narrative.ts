import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import type { ConsistencyFinding, NarrativeRegion, ProposalFacts } from "./consistency";
import {
  buildNarrativePrompt,
  narrativeResponseSchema,
  parseNarrativeOutput,
  type NarrativeRevision,
} from "./narrative-schema";

/** Raised when the feature cannot run at all, so the route can answer 503. */
export class NarrativeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NarrativeUnavailableError";
  }
}

export interface NarrativeRunOutcome {
  revisions: NarrativeRevision[];
  model: string;
  /** Set when the run was skipped rather than executed (budget). */
  skippedReason: string | null;
}

/**
 * Rewrites the flagged passages so their figures match the proposal's fields.
 *
 * Mirrors lib/leads/triage.ts: budget gate first, strict JSON-schema output,
 * metered before the incomplete check because a truncated run still spent the
 * tokens. The caller passes the result through validateAIOutput() and MUST NOT
 * write it to the proposal — see the Human Authority Rule in CLAUDE.md. This
 * returns a proposal for a human to accept, never an applied edit.
 */
export async function generateProposalNarrative(input: {
  facts: ProposalFacts;
  regions: readonly NarrativeRegion[];
  findings: readonly ConsistencyFinding[];
  userId: string | null;
}): Promise<NarrativeRunOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new NarrativeUnavailableError(
      "OPENAI_API_KEY is not configured, so the AI rewrite is unavailable. The consistency warnings above are still accurate — the figures can be corrected by hand.",
    );
  }
  if (input.regions.length === 0) {
    return { revisions: [], model: "none", skippedReason: "Nothing to rewrite." };
  }

  const decision = await checkAiBudget("proposal_narrative");
  if (!decision.allowed) {
    return { revisions: [], model: "none", skippedReason: decision.message };
  }

  const client = new OpenAI({ apiKey });
  const model = decision.modelOverride || process.env.OPENAI_PROPOSAL_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    max_output_tokens: 6000,
    text: {
      format: {
        type: "json_schema",
        name: "proposal_narrative",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: narrativeResponseSchema as any,
      },
    },
    input: buildNarrativePrompt(input),
  });

  await recordAiUsage({
    featureKey: "proposal_narrative",
    callKind: "figure_rewrite",
    runSource: "user",
    userId: input.userId,
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  if (response.status === "incomplete") {
    throw new Error(
      "The rewrite was cut off before completing. Fix a few sections at a time, or shorten the executive summary.",
    );
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

  const revisions = parseNarrativeOutput(
    text,
    input.regions.map((region) => region.id),
  );

  if (!revisions) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`The rewrite could not be parsed. Model returned: "${snippet}…".`);
  }

  return { revisions, model, skippedReason: null };
}
