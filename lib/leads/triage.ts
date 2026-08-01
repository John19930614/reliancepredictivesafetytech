import "server-only";
import OpenAI from "openai";
import {
  buildLeadTriagePrompt,
  leadTriageResponseSchema,
  parseLeadTriageOutput,
  type TriageLeadInput,
  type TriageResult,
} from "./triage-schema";

export interface TriageRunOutcome {
  result: TriageResult;
  model: string;
}

/**
 * Runs the daily lead triage through the OpenAI Responses API with strict
 * JSON-schema output. Mirrors lib/documents/builder.ts.
 *
 * The caller is responsible for passing the output through validateAIOutput()
 * before anything is written to an official record.
 */
export async function runLeadTriage(leads: readonly TriageLeadInput[], today: string): Promise<TriageRunOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your environment variables.");
  }
  if (leads.length === 0) {
    return { result: { findings: [], summary: "No new leads to triage." }, model: "none" };
  }

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_LEAD_TRIAGE_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";

  const response = await client.responses.create({
    model,
    max_output_tokens: 8000,
    text: {
      format: {
        type: "json_schema",
        name: "lead_triage",
        strict: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schema: leadTriageResponseSchema as any,
      },
    },
    input: buildLeadTriagePrompt(leads, today),
  });

  if (response.status === "incomplete") {
    throw new Error("Lead triage was cut off before completing. Try a smaller batch of leads.");
  }

  const text = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => (item as { type: "message"; content: Array<{ type: string; text?: string }> }).content)
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

  const result = parseLeadTriageOutput(
    text,
    leads.map((lead) => lead.id),
  );

  if (!result) {
    const snippet = text.slice(0, 300).replace(/\s+/g, " ").trim();
    throw new Error(`Lead triage output could not be parsed. Model returned: "${snippet}…".`);
  }

  return { result, model };
}
