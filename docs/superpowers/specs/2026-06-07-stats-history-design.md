# Design: Engineering-stats history (per-session, D1)

**Date:** 2026-06-07 · **Repo:** `~/dev/voygent-demo` (worktree `demo-enrichment`) · **Status:** approved (brainstorm); Codex design review pending

## Goal
Persist the per-exchange engineering stats the Inspector already computes, so the demo accumulates a history across sessions, and surface cumulative aggregates ("Across all sessions") in the engineering panel. Reinforces the cost-engineering story for a portfolio audience.

## Decisions (locked in brainstorm)
- **Storage: D1** — one table, **one row per completed exchange**.
- **Surface:** persist + a **public** read path feeding a "past sessions" section in the panel.
- **Public $:** yes — cumulative dollar figures are shown publicly (own aggregate spend, no PII).

## Storage (D1)
- New D1 database `voygent-demo-stats`, binding **`STATS_DB`** (added to `wrangler.toml`; the SessionDO and the top-level worker both get it via env).
- Migration `migrations/0001_session_stats.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS session_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,                 -- epoch ms (worker Date.now(), passed in)
    session_id TEXT NOT NULL,
    exchange_id TEXT NOT NULL,
    trip_id TEXT,
    boards_mode INTEGER NOT NULL DEFAULT 0,
    live_mode INTEGER NOT NULL DEFAULT 0,
    routing_mode TEXT,                   -- "single" | "smart"
    routing_json TEXT,                   -- the ModelRouting
    turns INTEGER, tool_calls INTEGER, exposed_tools INTEGER, full_tools INTEGER,
    in_tok INTEGER, out_tok INTEGER, cache_read INTEGER, cache_write INTEGER,
    actual_cost_usd REAL,                -- measured routed spend
    actual_cost_by_model_json TEXT,
    cost_haiku REAL, cost_sonnet REAL, cost_opus REAL,  -- counterfactual (all-tier)
    saved_tokens INTEGER                 -- tokens kept out of context (aggregate savings)
  );
  CREATE INDEX IF NOT EXISTS idx_session_stats_session ON session_stats (session_id, ts);
  CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats (ts);
  ```

## Write path
- A pure mapper `statsRowFromSummary(summary, ctx)` (new `worker/stats.ts`) builds the row's bind values from the summary numbers + session context (sessionId, exchangeId, tripId, boardsMode, liveMode, routing, savedTokens, ts). Unit-tested.
- In `SessionDO.handleChat`'s `finally` (after the summary is computed and `mux.close()`), best-effort insert:
  ```ts
  if (this.env.STATS_DB && !isTest) {
    try { await this.env.STATS_DB.prepare(INSERT).bind(...statsRowFromSummary(...)).run(); }
    catch (e) { console.log(`[stats] write failed: ${e.message}`); }  // never abort
  }
  ```
  - **`isTest` excluded** (same flag as the budget bypass) so smoke/Playwright runs don't pollute history.
  - No-op when `STATS_DB` is unbound (local dev without D1) — never throws.
  - `saved_tokens` = the same headline the panel shows (aggregate savings sum + perTurn×turns); computed worker-side from the savings events already tallied, or recomputed from the summary. (Keep it simple: sum the savings the worker emitted this exchange.)

## Read path
- `GET /stats` (top-level worker, **public**, `cache-control: public, max-age=60`):
  ```ts
  SELECT COUNT(*) exchanges, COUNT(DISTINCT session_id) sessions,
         COUNT(DISTINCT trip_id) trips,
         SUM(actual_cost_usd) totalActualCostUsd, SUM(saved_tokens) totalSavedTokens,
         SUM(in_tok+out_tok+cache_read+cache_write) totalTokens
  FROM session_stats;
  -- + SUM per model from actual_cost_by_model_json (computed in JS over a recent window) OR
  --   a second query summing cost_* columns; byModel via JS reduce over recent rows.
  ```
  Returns `{ sessions, exchanges, trips, totalActualCostUsd, totalSavedTokens, totalTokens, byModel, recent: [...] }`. `recent` = last ~10 rows, **anonymized** (no session_id/exchange_id/trip_id — just stats + ts). No-op/empty shape when `STATS_DB` unbound.
- Aggregation query is cheap (indexed, demo-scale rows); the 60s cache absorbs visitor load.

## UI
- New Inspector section "**Across all sessions**" (in the live region, below the live-session stats). Fetched once on mount via `/stats` (App owns the fetch + state, passes to Inspector — mirrors the `/presets` pattern). Shows: trips planned · total tokens kept out of context · total inference $ (+ per-model split) · sessions. Hidden if `/stats` returns empty/unavailable.
- Public, framed as cumulative demo usage (the "marginal cost ≈ $0 under MCP" flex).

## Privacy / safety
- Session ids are random/anonymous; rows carry no PII. Public endpoint exposes only aggregates + anonymized recent stats. Test runs excluded from writes (so excluded from totals).
- D1 is append-only here; no deletes/updates from the request path. Retention unbounded (demo scale); revisit if it grows.

## Components / files
- `wrangler.toml` — `[[d1_databases]]` binding `STATS_DB` + `database_id`.
- `migrations/0001_session_stats.sql` — schema (applied via `wrangler d1 execute --file` / `migrations`).
- `worker/stats.ts` (+ `.test.ts`) — `statsRowFromSummary()` mapper + `aggregateStats(rows)` shaping helper (pure, tested).
- `worker/session-do.ts` — Env `STATS_DB?: D1Database`; best-effort insert in `finally` (skip on `isTest`/unbound); compute `saved_tokens`.
- `worker/index.ts` — Env `STATS_DB?`; `GET /stats` handler (cached).
- `web/src/App.tsx` — fetch `/stats` on mount; pass to Inspector.
- `web/src/Inspector.tsx` — "Across all sessions" section + props.
- `shared/events.ts` — (only if a shared StatsSummary type helps; otherwise local).

## Testing
- `worker/stats.test.ts`: `statsRowFromSummary` maps a summary+ctx to the right bind tuple; `aggregateStats` sums/derives byModel + handles empty.
- `worker/index` `/stats` shape via a fake `STATS_DB` (prepare/all stub) if cheap; else manual.
- Full `vitest run` + `tsc`; post-deploy `wrangler d1 execute voygent-demo-stats --command "SELECT COUNT(*) FROM session_stats"` to confirm rows land; `curl /stats`.

## Out of scope (YAGNI)
- Per-tool / per-turn rows (one row per exchange is enough; turns is a column).
- Retention/pruning, dashboards beyond the panel aggregates.
- Auth on /stats (public by decision); a token-gated detail endpoint can come later if needed.
- Backfill (history starts at deploy).

## Invariants (unchanged)
No change to replay, sanitizer, board allowlist, commission firewall, or the budget ledger. Stats writes are best-effort and orthogonal — a D1 failure never affects a chat turn.
