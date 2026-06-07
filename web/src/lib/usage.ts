// Session-usage math for the Inspector scoreboard + plan-tier comparison.
//
// Raw `tokensIn + cacheRead` counted cache reads at FULL weight against the
// subscription-window estimate — 5-10x pessimistic once the moving cache
// breakpoint landed (most of a long session's input is cache reads billed at
// ~0.1x). Weight by billing ratios instead: reads 0.1x, writes 1.25x, fresh 1x.
export const CACHE_READ_WEIGHT = 0.1;
export const CACHE_WRITE_WEIGHT = 1.25;

export interface UsageTotals {
  inputTokens: number;         // fresh (uncached) input
  cacheReadTokens: number;     // read from cache (~0.1x)
  cacheCreationTokens: number; // written to cache (~1.25x)
}

/** Cost-weighted token figure comparable to a plan window. Rounded for display. */
export function costWeightedTokens(u: UsageTotals): number {
  return Math.round(
    u.inputTokens + u.cacheCreationTokens * CACHE_WRITE_WEIGHT + u.cacheReadTokens * CACHE_READ_WEIGHT,
  );
}

/** Share of all input context served from cache (0..1), or null before any input. */
export function cacheHitRate(u: UsageTotals): number | null {
  const all = u.inputTokens + u.cacheCreationTokens + u.cacheReadTokens;
  return all > 0 ? u.cacheReadTokens / all : null;
}
