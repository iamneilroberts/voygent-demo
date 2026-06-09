import type { TokenUsage } from "./provider";

// Per-million-token USD rates. Cache write ≈ 1.25x input, cache read ≈ 0.1x input.
interface Rates { in: number; out: number; cacheWrite: number; cacheRead: number; }
const PRICING: Record<string, Rates> = {
  "claude-sonnet-4-6": { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.10 },
  "claude-opus-4-8": { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  // DeepSeek V4 (deepseek-chat) — automatic prefix caching: there is no cache-WRITE
  // concept, so cacheWrite is set equal to `in` (it should never be exercised; the
  // DeepSeekProvider always emits cacheCreationTokens=0). cacheRead = cache-hit rate.
  // Rates VERIFIED against api-docs.deepseek.com 2026-06-07 (deepseek-v4-flash):
  // input cache-miss $0.14/M, cache-hit $0.0028/M, output $0.28/M (the plan's
  // 0.27/1.10/0.027 starting values were stale — corrected to live docs).
  "deepseek-chat": { in: 0.14, out: 0.28, cacheWrite: 0.14, cacheRead: 0.0028 },
};
// Unknown models fall back to Sonnet rates (conservative — never under-reports cheaply).
function ratesFor(model: string): Rates {
  return PRICING[model] ?? PRICING["claude-sonnet-4-6"];
}

export function estimateCostUsd(model: string, u: TokenUsage): number {
  const r = ratesFor(model);
  return (
    u.inputTokens * r.in +
    u.outputTokens * r.out +
    u.cacheCreationTokens * r.cacheWrite +
    u.cacheReadTokens * r.cacheRead
  ) / 1_000_000;
}
