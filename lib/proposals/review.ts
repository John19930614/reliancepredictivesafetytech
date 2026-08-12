import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import { collectNarrativeRegions } from "./consistency";
import type { GeneratorState } from "./generator-state";
import type { ReadinessFinding } from "./review-checks";
import { buildReviewPrompt, parseReviewOutput, reviewResponseSchema, type AiReviewResult } from "./review-schema";
import type { ProposalStatus } from "./types";

export interface ReviewRunOutcome {
  /** The model's advisory review, or null when the run was skipped. */
  result: AiReviewResult | null;
  model: string;
  /** Set when the run was SKIPPED rather than executed (no key, budget). */
  skippedReason: string | null;
}

/**
 * Runs the advisory AI review over a proposal's current state.
 *
 * Mirrors lib/proposals/narrative.ts: budget gate first, strict JSON-schema
 * output, metered before the incomplete check because a truncated run still
 * spent the tokens. One deliberate difference: a missing OPENAI_API_KEY is a
 * SKIP here, not a thrown 503 — review must stay available at every workflow
 * stage, and the deterministic checks in review-checks.ts still ran. The
 * caller passes the result through validateAIOutput() and MUST NOT write any
 * of it to the proposal (CLAUDE.md, Human Authority Rule): this returns
 * findings for a human to weigh, never an applied change.
 */
export async function generateProposalReview(input: {
  state: GeneratorState;
  status: ProposalStatus;
  deterministic: readonly ReadinessFinding[];
  userId: string | null;
}): Promise<ReviewRunOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      result: null,
      model: "none",
      skippedReason:
        "OPENAI_API_KEY is not configured, so the AI reviewer is unavailable. The automated checks above still ran and are accurate.",
    };
  }

  const decision = await checkAiBudget("proposal_review");
  if (!decision.allowed) {
    return { result: null, model: "none", skippedReason: decision.message };
  }

  const client = new OpenAI({ apiKey });
  const model = decision.modelOverride || process.env.OPENAI_PROPOSAL_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    max_output_tokens: 4000,
    text: {
      format: {
        type: "json_schema",
        name: "proposal_review",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: reviewResponseSchema as any,
      },
    },
    input: buildReviewPrompt(input),
  });

  await recordAiUsage({
    featureKey: "proposal_review",
    callKind: "workflow_review",
    runSource: "user",
    userId: input.userId,
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  if (response.status === "incomplete") {
    throw new Error("The review was cut off before completing. Try again — a shorter executive summary also helps.");
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

  // Edits are only valid against the regions the prompt actually contained.
  const result = parseReviewOutput(
    text,
    collectNarrativeRegions(input.state).map((region) => region.id),
  );
  if (!result) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`The review could not be parsed. Model returned: "${snippet}…".`);
  }

  return { result, model, skippedReason: null };
}
