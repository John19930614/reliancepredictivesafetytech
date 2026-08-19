import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import {
  buildReceiptExtractionPrompt,
  parseReceiptExtractionOutput,
  receiptExtractionResponseSchema,
  type ReceiptExtractionResult,
} from "./receipt-extraction-schema";

export type ReceiptExtractionOutcome =
  | { ok: true; result: ReceiptExtractionResult; model: string; rawText: string }
  | { ok: false; reason: "budget_denied"; message: string }
  | { ok: false; reason: "unparseable"; rawText: string };

/** Image types the vision model can read directly. PDFs and HEIC are not accepted here. */
export const SUPPORTED_RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_RECEIPT_BYTES_FOR_EXTRACTION = 15 * 1024 * 1024;

/**
 * Runs a single receipt photo through the OpenAI Responses API vision input
 * with strict JSON-schema output. Mirrors lib/leads/triage.ts.
 *
 * The caller is responsible for passing the parsed result through
 * validateAIOutput() before treating it as anything more than a suggestion,
 * and must never write it to employee_expense_reports without an explicit
 * human submit action (Human Authority Rule).
 */
export async function runReceiptExtraction(input: {
  fileBase64: string;
  mimeType: (typeof SUPPORTED_RECEIPT_MIME_TYPES)[number];
  userId: string;
}): Promise<ReceiptExtractionOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your environment variables.");
  }

  const decision = await checkAiBudget("expense_receipt_extraction");
  if (!decision.allowed) {
    return { ok: false, reason: "budget_denied", message: decision.message };
  }

  const client = new OpenAI({ apiKey });
  const model = decision.modelOverride || process.env.OPENAI_RECEIPT_MODEL || process.env.OPENAI_DOCUMENT_MODEL || "gpt-4o-mini";

  const prompt = buildReceiptExtractionPrompt();
  const response = await client.responses.create({
    model,
    max_output_tokens: 800,
    text: {
      format: {
        type: "json_schema",
        name: "receipt_extraction",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: receiptExtractionResponseSchema as any,
      },
    },
    input: [
      { role: prompt[0].role, content: prompt[0].content },
      {
        role: prompt[1].role,
        content: [
          { type: "input_text", text: prompt[1].content },
          { type: "input_image", image_url: `data:${input.mimeType};base64,${input.fileBase64}`, detail: "high" },
        ],
      },
    ],
  });

  await recordAiUsage({
    featureKey: "expense_receipt_extraction",
    runSource: "user",
    userId: input.userId,
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  });

  if (response.status === "incomplete") {
    return { ok: false, reason: "unparseable", rawText: "" };
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseReceiptExtractionOutput(text);
  if (!result) {
    return { ok: false, reason: "unparseable", rawText: text };
  }

  return { ok: true, result, model, rawText: text };
}
