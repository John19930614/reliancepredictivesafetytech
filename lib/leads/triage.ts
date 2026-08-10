import "server-only";
import OpenAI from "openai";
import { checkAiBudget, recordAiUsage } from "@/lib/ai/metering";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Budget gate. A denial is a normal daily outcome, not a cron failure: close
  // out the route's run row (unique per run_date, which is `today`) as completed
  // with a skip note, and hand back an empty result so the caller finishes clean.
  const decision = await checkAiBudget("lead_triage");
  if (!decision.allowed) {
    try {
      const admin = createAdminClient();
      if (admin) {
        await admin
          .from("lead_triage_runs")
          .update({
            status: "completed",
            leads_analyzed: 0,
            error_message: "Skipped — AI budget reached for today",
            completed_at: new Date().toISOString(),
          })
          .eq("run_date", today);
      }
    } catch {
      // Metering bookkeeping must never fail the cron.
    }
    return { result: { findings: [], summary: "Skipped — AI budget reached for today" }, model: "none" };
  }

  const client = new OpenAI({ apiKey });
  const model =
    decision.modelOverride || process.env.OPENAI_LEAD_TRIAGE_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";

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

  // Metered before the incomplete check — a cut-off run still spent the tokens.
  await recordAiUsage({
    featureKey: "lead_triage",
    runSource: "cron",
    model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
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
