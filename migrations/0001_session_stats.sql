-- Engineering-stats history: one row per completed exchange.
-- Applied with: wrangler d1 execute voygent-demo-stats --remote --file migrations/0001_session_stats.sql
-- (wrangler deploy does NOT apply D1 schema — see the deploy order in the handoff.)
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
  turns INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  exposed_tools INTEGER NOT NULL DEFAULT 0,
  full_tools INTEGER NOT NULL DEFAULT 0,
  in_tok INTEGER NOT NULL DEFAULT 0,
  out_tok INTEGER NOT NULL DEFAULT 0,
  cache_read INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  actual_cost_usd REAL NOT NULL DEFAULT 0,                             -- measured routed spend (sum of per-turn cost)
  actual_haiku REAL NOT NULL DEFAULT 0,
  actual_sonnet REAL NOT NULL DEFAULT 0,
  actual_opus REAL NOT NULL DEFAULT 0,                                -- routed split (SQL-summable)
  cost_haiku REAL NOT NULL DEFAULT 0,
  cost_sonnet REAL NOT NULL DEFAULT 0,
  cost_opus REAL NOT NULL DEFAULT 0,                                  -- counterfactual (all-tier)
  saved_tokens INTEGER NOT NULL DEFAULT 0,                            -- ESTIMATED tokens kept out of context
  UNIQUE (session_id, exchange_id)     -- guard double-finalization/retries (INSERT OR IGNORE)
);
CREATE INDEX IF NOT EXISTS idx_session_stats_ts ON session_stats (ts);  -- ordering
