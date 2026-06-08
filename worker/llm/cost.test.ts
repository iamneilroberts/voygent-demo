import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "./cost";

describe("estimateCostUsd", () => {
  it("prices haiku-4-5 input+output", () => {
    // 1M input @ $1 + 1M output @ $5 = $6
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0 })).toBeCloseTo(6, 5);
  });
  it("applies cheap cache-read rate", () => {
    // 1M cache-read on haiku @ $0.10 = $0.10
    expect(estimateCostUsd("claude-haiku-4-5", { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 1_000_000 })).toBeCloseTo(0.10, 5);
  });
  it("prices sonnet higher than haiku for the same usage", () => {
    const u = { inputTokens: 50_000, outputTokens: 3_000, cacheCreationTokens: 0, cacheReadTokens: 0 };
    expect(estimateCostUsd("claude-sonnet-4-6", u)).toBeGreaterThan(estimateCostUsd("claude-haiku-4-5", u));
  });
  it("falls back to sonnet rates for an unknown model", () => {
    const u = { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
    expect(estimateCostUsd("some-future-model", u)).toBeCloseTo(3, 5);
  });
});

describe("DeepSeek pricing", () => {
  it("prices deepseek-chat with a cache-read discount and no write premium", () => {
    // DeepSeek does automatic prefix caching: cacheCreationTokens is always 0 for it.
    const c = estimateCostUsd("deepseek-chat", {
      inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    });
    expect(c).toBeGreaterThan(0);
    // A 1M cache-read costs strictly less than 1M fresh input.
    const fresh = estimateCostUsd("deepseek-chat", { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
    const cached = estimateCostUsd("deepseek-chat", { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 1_000_000 });
    expect(cached).toBeLessThan(fresh);
  });
});
