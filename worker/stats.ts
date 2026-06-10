// Engineering-stats history: pure mappers between the inspector summary event
// and the D1 `session_stats` table. No env, no D1 handle here — the SessionDO
// and the top-level worker own the actual binding; this module only shapes data
// so it stays unit-testable. One row per completed exchange.

import type { ModelRouting } from "../shared/models";
import type { StatsResponse } from "../shared/events";

// The subset of the inspector "summary" event we persist. Structurally a subset
// of the emitted summary event, so the event object passes straight in.
export interface StatsSummary {
  turns: number;
  toolCalls: number;
  exposedToolCount: number;
  fullToolCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costByModel: { haiku: number; sonnet: number; opus: number };  // counterfactual (all-tier)
  actualCostUsd: number;                                         // measured routed spend
  actualCostByModel?: Record<string, number>;                   // measured spend keyed by model id
}

// Per-exchange context the summary event doesn't carry (session identity + mode).
export interface StatsCtx {
  sessionId: string;
  exchangeId: string;
  tripId: string;
  boardsMode: boolean;
  liveMode: boolean;
  routing: ModelRouting;
  codeId?: string;   // access code that ran this exchange (links stats → who, in admin)
}

// Column order for the INSERT — the bind tuple from statsRowFromSummary must
// match this exactly. Kept as the single source of truth for both.
export const STATS_COLUMNS = [
  "ts", "session_id", "exchange_id", "trip_id", "boards_mode", "live_mode",
  "routing_mode", "routing_json",
  "turns", "tool_calls", "exposed_tools", "full_tools",
  "in_tok", "out_tok", "cache_read", "cache_write",
  "actual_cost_usd", "actual_haiku", "actual_sonnet", "actual_opus",
  "cost_haiku", "cost_sonnet", "cost_opus", "saved_tokens", "code_id",
] as const;

// INSERT OR IGNORE so a retry / double-finalization on the same (session,exchange)
// is idempotent (the table's UNIQUE constraint backs this).
export const STATS_INSERT_SQL =
  `INSERT OR IGNORE INTO session_stats (${STATS_COLUMNS.join(", ")}) ` +
  `VALUES (${STATS_COLUMNS.map(() => "?").join(", ")})`;

// One clean aggregate query feeding GET /stats. COALESCE so an empty table
// yields zeros, not nulls. byModel = the three actual_* SUMs (no JSON parsing).
export const STATS_AGG_SQL =
  `SELECT COUNT(*) AS exchanges, COUNT(DISTINCT session_id) AS sessions, ` +
  `COUNT(DISTINCT trip_id) AS trips, ` +
  `COALESCE(SUM(actual_cost_usd), 0) AS totalActualCostUsd, ` +
  `COALESCE(SUM(saved_tokens), 0) AS totalSavedTokens, ` +
  `COALESCE(SUM(in_tok + out_tok + cache_read + cache_write), 0) AS totalTokens, ` +
  `COALESCE(SUM(actual_haiku), 0) AS actualHaiku, ` +
  `COALESCE(SUM(actual_sonnet), 0) AS actualSonnet, ` +
  `COALESCE(SUM(actual_opus), 0) AS actualOpus ` +
  `FROM session_stats`;

export interface StatsAggRow {
  exchanges: number;
  sessions: number;
  trips: number;
  totalActualCostUsd: number;
  totalSavedTokens: number;
  totalTokens: number;
  actualHaiku: number;
  actualSonnet: number;
  actualOpus: number;
}

type Tier = "haiku" | "sonnet" | "opus";

// Map a model id to its pricing tier. Substring match so a future model rev
// (e.g. "claude-haiku-4-7") still buckets correctly; unknown ids are dropped.
function tierOf(modelId: string): Tier | null {
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("sonnet")) return "sonnet";
  if (modelId.includes("opus")) return "opus";
  return null;
}

// Build the ordered bind tuple for STATS_INSERT_SQL (matches STATS_COLUMNS).
export function statsRowFromSummary(
  summary: StatsSummary,
  ctx: StatsCtx,
  savedTokens: number,
  ts: number,
): unknown[] {
  const actual: Record<Tier, number> = { haiku: 0, sonnet: 0, opus: 0 };
  for (const [modelId, cost] of Object.entries(summary.actualCostByModel ?? {})) {
    const t = tierOf(modelId);
    if (t) actual[t] += cost;
  }
  return [
    ts, ctx.sessionId, ctx.exchangeId, ctx.tripId,
    ctx.boardsMode ? 1 : 0, ctx.liveMode ? 1 : 0,
    ctx.routing.mode, JSON.stringify(ctx.routing),
    summary.turns, summary.toolCalls, summary.exposedToolCount, summary.fullToolCount,
    summary.inputTokens, summary.outputTokens, summary.cacheReadTokens, summary.cacheCreationTokens,
    summary.actualCostUsd, actual.haiku, actual.sonnet, actual.opus,
    summary.costByModel.haiku, summary.costByModel.sonnet, summary.costByModel.opus,
    Math.max(0, Math.round(savedTokens)), ctx.codeId ?? null,
  ];
}

// Coerce a raw aggregate row (possibly null/undefined/NaN sums) to the public shape.
export function shapeStats(row: Partial<StatsAggRow> | null | undefined): StatsResponse {
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const haiku = n(row?.actualHaiku), sonnet = n(row?.actualSonnet), opus = n(row?.actualOpus);
  const total = n(row?.totalActualCostUsd);
  return {
    sessions: n(row?.sessions),
    exchanges: n(row?.exchanges),
    trips: n(row?.trips),
    totalActualCostUsd: total,
    totalSavedTokens: n(row?.totalSavedTokens),
    totalTokens: n(row?.totalTokens),
    // 'other' = total routed spend minus the Claude trio (captures DeepSeek/non-Claude,
    // which actual_cost_usd already sums but the tier columns don't). NO D1 migration.
    byModel: { haiku, sonnet, opus, other: Math.max(0, total - haiku - sonnet - opus) },
  };
}
