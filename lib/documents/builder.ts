import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import type { DocumentBuilderInput, GeneratedDocument } from "./types";
import { buildDocumentPrompt, documentResponseSchema, parseDocumentOutput } from "./schema";

/**
 * Generates a structured safety document (SOP or Policy) draft via the OpenAI
 * Responses API with strict JSON-schema output. Mirrors the orchestration shape
 * of lib/legal/research.ts (runStructuredLegalResearch) but does not use web
 * search — document drafting works from the provided scope, not live lookup.
 */
export async function generateSafetyDocument(input: DocumentBuilderInput): Promise<GeneratedDocument> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your environment variables.");
  }

  // Budget gate: a denial surfaces through the same thrown-Error path the rest
  // of this function uses, so the route reports decision.message to the user.
  const budget = await checkAiBudget("document_builder");
  if (!budget.allowed) {
    throw new Error(budget.message);
  }

  const client = new OpenAI({ apiKey });
  const model =
    budget.modelOverride || process.env.OPENAI_DOCUMENT_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    max_output_tokens: 16000,
    text: {
      format: {
        type: "json_schema",
        name: "safety_document",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: documentResponseSchema as any,
      },
    },
    input: buildDocumentPrompt(input),
  });

  // Metered before the incomplete check — a cut-off run still spent the tokens.
  await recordAiUsage({
    featureKey: "document_builder",
    runSource: "user",
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  if (response.status === "incomplete") {
    throw new Error(
      "Document generation was cut off before completing (the result was too long). Try narrowing the scope.",
    );
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseDocumentOutput(text, input.doc_type);

  if (!result) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(
      `Document generated but the output could not be parsed. Model returned: "${snippet}…". Please try again.`,
    );
  }

  return result;
}
