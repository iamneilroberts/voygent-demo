import type { TokenUsage } from "./provider";

// Per-million-token USD rates. Cache write ≈ 1.25x input, cache read ≈ 0.1x input.
interface Rates { in: number; out: number; cacheWrite: number; cacheRead: number; }
const PRICING: Record<string, Rates> = {
  "claude-sonnet-4-6": { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.10 },
  "claude-opus-4-8": { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.50 },
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
