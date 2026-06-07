import { describe, it, expect } from "vitest";
import { costWeightedTokens, cacheHitRate } from "./usage";

describe("costWeightedTokens", () => {
  it("weights cache reads at 0.1x and writes at 1.25x", () => {
    expect(costWeightedTokens({ inputTokens: 1000, cacheCreationTokens: 2000, cacheReadTokens: 100_000 }))
      .toBe(1000 + 2500 + 10_000);
  });
  it("is far below the raw sum on a cache-heavy session (the 5-10x pessimism fix)", () => {
    const u = { inputTokens: 5_000, cacheCreationTokens: 10_000, cacheReadTokens: 500_000 };
    const raw = u.inputTokens + u.cacheReadTokens; // the old formula
    expect(costWeightedTokens(u)).toBeLessThan(raw / 5);
  });
});

describe("cacheHitRate", () => {
  it("computes cacheRead share of all input", () => {
    expect(cacheHitRate({ inputTokens: 100, cacheCreationTokens: 100, cacheReadTokens: 800 })).toBeCloseTo(0.8);
  });
  it("returns null before any input (never NaN)", () => {
    expect(cacheHitRate({ inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })).toBeNull();
  });
});
