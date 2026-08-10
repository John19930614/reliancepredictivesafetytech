// Cost estimation for the AI usage ledger (lib/ai/metering.ts).
//
// Prices are per ONE MILLION tokens, in CENTS, from OpenAI's published list.
// The table is deliberately small: any model not listed is priced as gpt-4o —
// the most expensive entry — so an unlisted model can only ever be
// over-counted against the budget, never under-counted.
export const AI_PRICE_TABLE: Record<string, { inCents: number; outCents: number }> = {
  "gpt-4o": { inCents: 250, outCents: 1000 },
  "gpt-4o-mini": { inCents: 15, outCents: 60 },
};

/** Flat surcharge per OpenAI web_search tool call, in cents. */
export const WEB_SEARCH_CALL_CENTS = 2.5;

export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
  webSearchCalls = 0,
): number {
  // Gateway-style ids ("openai/gpt-4o") price the same as the bare model id.
  const key = model.startsWith("openai/") ? model.slice("openai/".length) : model;
  const price = AI_PRICE_TABLE[key] ?? AI_PRICE_TABLE["gpt-4o"];
  // Token counts come straight from provider responses; treat anything
  // malformed as zero so a bad count can never poison the ledger write.
  const input = Math.max(0, Number(inputTokens) || 0);
  const output = Math.max(0, Number(outputTokens) || 0);
  const calls = Math.max(0, Number(webSearchCalls) || 0);
  return (input * price.inCents + output * price.outCents) / 1_000_000 + calls * WEB_SEARCH_CALL_CENTS;
}
