import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import type { ResearchRunInput, StructuredResearchResult } from "./types";
import { DEFAULT_LEGAL_DISCLAIMER } from "./types";
import { buildStructuredResearchPrompt, normalizeStructuredResult, structuredResponseSchema } from "./structured-research";

/**
 * Defensive fallback: extract the first complete, balanced JSON object from
 * arbitrary text (handles markdown fences and surrounding prose). Only used if
 * structured output is somehow not clean JSON.
 */
function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let t = text.trim();

  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  const start = t.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

function parseStructuredOutput(text: string): StructuredResearchResult | null {
  try {
    return normalizeStructuredResult(JSON.parse(text.trim()));
  } catch {
    // fall through to defensive extraction
  }
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;
  try {
    return normalizeStructuredResult(JSON.parse(jsonText));
  } catch {
    return null;
  }
}

/**
 * Runs a full structured research run (doc §14): findings + gap analysis +
 * module recommendations + audit checklist + human-review notes. `input` may be
 * a plain free-text query or the structured New Research Run form payload.
 */
export async function runStructuredLegalResearch(input: ResearchRunInput | string): Promise<StructuredResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your environment variables.");
  }

  // Budget gate: a denial surfaces through the same thrown-Error path the rest
  // of this function uses, so the route reports decision.message to the user.
  const budget = await checkAiBudget("legal_research");
  if (!budget.allowed) {
    throw new Error(budget.message);
  }

  const client = new OpenAI({ apiKey });
  const model = budget.modelOverride || process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";
  const query = typeof input === "string" ? input : input.question || input.title || input.program || "";

  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    max_output_tokens: 32000,
    text: {
      format: {
        type: "json_schema",
        name: "legal_register_intelligence",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: structuredResponseSchema as any,
      },
    },
    input: buildStructuredResearchPrompt(input),
  });

  // Metered before the incomplete check — a cut-off run still spent the tokens.
  await recordAiUsage({
    featureKey: "legal_research",
    runSource: "user",
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    webSearchCalls: response.output.filter((item) => item.type === "web_search_call").length,
  });

  if (response.status === "incomplete") {
    throw new Error(
      "Research was cut off before completing (the result was too long). Try narrowing the scope, e.g. one state or one program at a time.",
    );
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseStructuredOutput(text);

  if (!result) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `Research completed but the output could not be parsed. Model returned: "${snippet}…". Please try again.`,
    );
  }

  return { ...result, query, disclaimer: DEFAULT_LEGAL_DISCLAIMER };
}
