# Design: Engineering-stats history (per-session, D1)

**Date:** 2026-06-07 · **Repo:** `~/dev/voygent-demo` (worktree `demo-enrichment`) · **Status:** approved (brainstorm) + Codex design review folded in

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
    turns INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
    exposed_tools INTEGER NOT NULL DEFAULT 0, full_tools INTEGER NOT NULL DEFAULT 0,
    in_tok INTEGER NOT NULL DEFAULT 0, out_tok INTEGER NOT NULL DEFAULT 0,
    cache_read INTEGER NOT NULL DEFAULT 0, cache_write INTEGER NOT NULL DEFAULT 0,
    actual_cost_usd REAL NOT NULL DEFAULT 0,            -- measured routed spend (sum of per-turn cost)
    actual_haiku REAL NOT NULL DEFAULT 0, actual_sonnet REAL NOT NULL DEFAULT 0, actual_opus REAL NOT NULL DEFAULT 0,  -- routed split (SQL-summable)
    cost_haiku REAL NOT NULL DEFAULT 0, cost_sonnet REAL NOT NULL DEFAULT 0, cost_opus REAL NOT NULL DEFAULT 0,  -- counterfactual (all-tier)
    saved_tokens INTEGER NOT NULL DEFAULT 0,            -- ESTIMATED tokens kept out of context (see below)
    UNIQUE (session_id, exchange_id)     -- guard double-finalization/retries (INSERT OR IGNORE)
  );
  CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats (ts);  -- ordering
  ```

## Write path
- A pure mapper `statsRowFromSummary(summary, ctx)` (new `worker/stats.ts`) builds the row's bind values from the summary numbers + session context (sessionId, exchangeId, tripId, boardsMode, liveMode, routing, savedTokens, ts). Unit-tested.
- In `SessionDO.handleChat`'s `finally`: emit the summary, then **anchor the telemetry writes BEFORE `mux.close()`** (Codex #2 — a detached tail after close can be lost on DO eviction). Both the stats write and the existing budget-ledger add move into one settled await:
  ```ts
  mux.send(summary);
  await Promise.allSettled([
    (this.env.STATS_DB && !isTest)
      ? this.env.STATS_DB.prepare(INSERT_OR_IGNORE).bind(...statsRowFromSummary(...)).run()
      : Promise.resolve(),
    (sessionCost > 0 && !isTest) ? this.budgetStub().fetch(...add...) : Promise.resolve(),
  ]); // best-effort; allSettled never rejects → never aborts the turn
  mux.close();
  ```
  - `INSERT OR IGNORE` (UNIQUE session_id+exchange_id) makes a retry idempotent.
  - **`isTest` excluded** (same flag as the budget bypass) so smoke/Playwright runs don't pollute history.
  - No-op when `STATS_DB` is unbound (local dev without D1) — never throws (the missing-table/binding case is swallowed → silent skip, and `/stats` returns empty).
  - Awaiting before close delays only the stream *close* by the write latency (~ms); all content is already delivered.
  - **`saved_tokens` (ESTIMATE):** a `savedTokens` accumulator sums `tokensSaved` from every `kind:"savings"` event emitted this exchange (patch + searchDistill + toolCatalog + template). Labeled "estimated tokens kept out of context" in the UI — it's a sum of emitted savings (baselines differ by kind; not a literal net delta), not a precise figure.

## Read path
- `GET /stats` (top-level worker, **public**, `cache-control: public, max-age=60`):
  ```ts
  SELECT COUNT(*) exchanges, COUNT(DISTINCT session_id) sessions,
         COUNT(DISTINCT trip_id) trips,
         SUM(actual_cost_usd) totalActualCostUsd, SUM(saved_tokens) totalSavedTokens,
         SUM(in_tok+out_tok+cache_read+cache_write) totalTokens,
         SUM(actual_haiku) actualHaiku, SUM(actual_sonnet) actualSonnet, SUM(actual_opus) actualOpus
  FROM session_stats;
  ```
  One clean aggregate query (byModel = the three `actual_*` SUMs — no JSON parsing). Returns `{ sessions, exchanges, trips, totalActualCostUsd, totalSavedTokens, totalTokens, byModel: {haiku,sonnet,opus} }` — **aggregates only** (no `recent` list; Codex #6 — drops per-exchange exposure + simplifies). `COALESCE(SUM(...),0)` so empty table → zeros, not nulls.
- **Edge-cached via the Cache API** (Codex #4 — a `max-age` header only helps browsers, not scripted reads): on a miss, query D1, build the JSON `Response` with `cache-control: public, max-age=60`, `caches.default.put(req, res.clone())`, return it; on a hit, return the cached copy. So D1 sees at most ~1 read/60s regardless of visitor/scripted volume.
- On any D1 error or unbound `STATS_DB`, return an empty/zero shape (never 500) so the panel just hides the section.

## UI
- New Inspector section "**Across all sessions**" (in the live region, below the live-session stats). Fetched once on mount via `/stats` (App owns the fetch + state, passes to Inspector — mirrors the `/presets` pattern). Shows: trips planned · sessions · ~total tokens kept out of context (labeled "estimated") · total inference $ (+ per-model split). Hidden when `/stats` is empty/unavailable (zero sessions).
- Public, framed as cumulative demo usage (the "marginal cost ≈ $0 under MCP" flex).

## Privacy / safety
- Session ids are random/anonymous; rows carry no PII. Public endpoint exposes only cumulative aggregates (no per-exchange rows). Test runs excluded from writes (so excluded from totals).
- D1 is append-only here; no deletes/updates from the request path. Retention unbounded (demo scale); revisit if it grows.

## Components / files
- `wrangler.toml` — `[[d1_databases]]` binding `STATS_DB` + `database_id`.
- `migrations/0001_session_stats.sql` — schema (applied via `wrangler d1 execute --file` / `migrations`).
- `worker/stats.ts` (+ `.test.ts`) — `statsRowFromSummary(summary, ctx, savedTokens, ts)` mapper (→ ordered bind tuple, incl. actual_* split from `actualCostByModel`) + `shapeStats(aggRow)` (pure, tested).
- `worker/session-do.ts` — Env `STATS_DB?: D1Database`; best-effort insert in `finally` (skip on `isTest`/unbound); compute `saved_tokens`.
- `worker/index.ts` — Env `STATS_DB?`; `GET /stats` handler (aggregates only, `caches.default` edge-cached 60s, empty-on-error).
- `web/src/App.tsx` — fetch `/stats` on mount; pass to Inspector.
- `web/src/Inspector.tsx` — "Across all sessions" section + props.
- `shared/events.ts` — (only if a shared StatsSummary type helps; otherwise local).

## Testing
- `worker/stats.test.ts`: `statsRowFromSummary` maps summary+ctx to the right ordered bind tuple (incl. actual_* split); `shapeStats(aggRow)` derives the aggregates response + coerces null/empty sums to zeros.
- `worker/index` `/stats` shape via a fake `STATS_DB` (prepare/all stub) if cheap; else manual.
- **Deploy order (Codex #7 — wrangler deploy does NOT apply D1 schema):** (1) `wrangler d1 create voygent-demo-stats` → copy the database_id into wrangler.toml; (2) `wrangler d1 execute voygent-demo-stats --remote --file migrations/0001_session_stats.sql`; (3) `npm run build:web`; (4) `wrangler deploy`. If deployed before the table exists, writes are swallowed (silent skip) and `/stats` returns empty until migrated.
- Full `vitest run` + `tsc`; post-deploy `wrangler d1 execute voygent-demo-stats --remote --command "SELECT COUNT(*) FROM session_stats"` to confirm rows land; `curl /stats`.

## Out of scope (YAGNI)
- Per-tool / per-turn rows (one row per exchange is enough; turns is a column).
- Retention/pruning, dashboards beyond the panel aggregates.
- Auth on /stats (public by decision); a token-gated detail endpoint can come later if needed.
- Backfill (history starts at deploy).

## Invariants (unchanged)
No change to replay, sanitizer, board allowlist, commission firewall, or the budget ledger. Stats writes are best-effort and orthogonal — a D1 failure never affects a chat turn.
