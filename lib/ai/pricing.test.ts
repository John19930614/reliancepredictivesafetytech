import { describe, expect, it } from "vitest";

import { AI_PRICE_TABLE, WEB_SEARCH_CALL_CENTS, estimateCostCents } from "./pricing";

describe("estimateCostCents", () => {
  it("prices gpt-4o at the listed per-million rates", () => {
    expect(estimateCostCents("gpt-4o", 1_000_000, 1_000_000)).toBe(1250);
  });

  it("prices gpt-4o-mini at the listed per-million rates", () => {
    expect(estimateCostCents("gpt-4o-mini", 1_000_000, 1_000_000)).toBe(75);
  });

  it("scales linearly for partial token counts", () => {
    // (1000 * 250 + 500 * 1000) / 1M cents
    expect(estimateCostCents("gpt-4o", 1000, 500)).toBeCloseTo(0.75, 10);
  });

  it("strips a leading openai/ gateway prefix before lookup", () => {
    expect(estimateCostCents("openai/gpt-4o-mini", 1_000_000, 1_000_000)).toBe(
      estimateCostCents("gpt-4o-mini", 1_000_000, 1_000_000),
    );
  });

  it("prices an unknown model as gpt-4o so it can only over-count", () => {
    expect(estimateCostCents("some-future-model", 1_000_000, 1_000_000)).toBe(1250);
    expect(estimateCostCents("openai/some-future-model", 1_000_000, 1_000_000)).toBe(1250);
  });

  it("adds the flat web search surcharge per call", () => {
    expect(estimateCostCents("gpt-4o-mini", 0, 0, 2)).toBe(2 * WEB_SEARCH_CALL_CENTS);
    expect(estimateCostCents("gpt-4o-mini", 1_000_000, 0, 1)).toBe(15 + WEB_SEARCH_CALL_CENTS);
  });

  it("returns zero for a free call and treats malformed counts as zero", () => {
    expect(estimateCostCents("gpt-4o", 0, 0)).toBe(0);
    expect(estimateCostCents("gpt-4o", -50, Number.NaN, -1)).toBe(0);
  });

  it("keeps every table entry at or below the gpt-4o fallback price", () => {
    // Guards the conservatism invariant: if a pricier model is ever added, the
    // unknown-model fallback must move with it.
    const fallback = AI_PRICE_TABLE["gpt-4o"];
    for (const price of Object.values(AI_PRICE_TABLE)) {
      expect(price.inCents).toBeLessThanOrEqual(fallback.inCents);
      expect(price.outCents).toBeLessThanOrEqual(fallback.outCents);
    }
  });
});
