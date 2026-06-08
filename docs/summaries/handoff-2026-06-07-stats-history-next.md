# Session Handoff: stats-history spec ready to implement (+ what shipped)

**Date:** 2026-06-07 (late) · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (prod runs this branch; deploy-from-main clobbers)
**Supersedes:** `handoff-2026-06-07-model-selector-mobile-shipped.md`.

## FIRST ACTION for the new session
Implement the **engineering-stats history** feature. The design is fully specced AND Codex-reviewed (findings folded). Spec: **`docs/superpowers/specs/2026-06-07-stats-history-design.md`** — read it; it has the schema, write-path, `/stats`, UI, and the exact **deploy order**. Nothing is built yet (no D1, no code).

## Prod state (all SHIPPED + deployed this session)
- Worker version **`756cd5b9`** @ branch HEAD **`4039544`** → https://voygent-demo.somotravel.workers.dev . Working tree clean. 161 tests pass, tsc clean.
- **Model selector + per-phase routing** (Smart default; Opus gated by `DEMO_OPUS_ENABLED`), **mobile UX** (chat full-screen + folio/engineering slide-up overlays via pill bar, inline-folio hidden, scroll fix, chrome relocated), **mobile declutter** (kept only the ribbon disambiguation), **engineering pane shows `$` by default** (`4a46992`).
- **Budget:** daily cap raised to **$25** (`BUDGET_DAILY_USD` secret; $5 was exhausted by testing → /chat 503). **Test bypass** (`de2e3c2`): header `x-demo-test: <DEMO_TEST_TOKEN secret>` skips the cap + ledger; smoke/record scripts auto-send `process.env.DEMO_TEST_TOKEN` (token in repo `.env`, now gitignored). A `/chat` 503 = budget/`DEMO_DISABLED`, NOT layout.

## Stats-history feature — design summary (build this)
One row per completed exchange → **D1** `voygent-demo-stats` (binding `STATS_DB`); public **`GET /stats`** aggregates feed an "Across all sessions" panel section.
- **Schema** (`migrations/0001_session_stats.sql`): per the spec — `UNIQUE(session_id,exchange_id)` + `INSERT OR IGNORE`; numerics `NOT NULL DEFAULT 0`; `actual_haiku/sonnet/opus` (SQL-summable routed split) + counterfactual `cost_*`; `saved_tokens` (ESTIMATE); `idx_session_stats_ts`.
- **Write** in `SessionDO.handleChat` `finally`: emit summary, then `await Promise.allSettled([statsInsert(if STATS_DB && !isTest), budgetAdd])` **BEFORE `mux.close()`** (Codex #2 — don't leave it as a detached tail after close). Best-effort; allSettled never aborts the turn. Exclude `isTest`. No-op when `STATS_DB` unbound.
- **Read** `GET /stats` (worker/index.ts): one aggregate query (`COALESCE(SUM(...),0)`), **edge-cached via `caches.default` 60s** (Codex #4 — header alone doesn't protect D1 from scripted reads), empty-on-error/unbound. **Aggregates only — no `recent` list** (Codex #6).
- **New files:** `worker/stats.ts` (+ `.test.ts`) = `statsRowFromSummary(summary, ctx, savedTokens, ts)` → ordered bind tuple (incl. actual_* from `summary.actualCostByModel`) + `shapeStats(aggRow)`. `migrations/0001_session_stats.sql`.
- **Touch:** `worker/session-do.ts` (Env `STATS_DB?: D1Database`; `savedTokens` accumulator summing emitted `kind:"savings"` `tokensSaved`; the anchored write), `worker/index.ts` (Env `STATS_DB?`; `/stats` handler), `web/src/App.tsx` (fetch `/stats` on mount like `/presets`), `web/src/Inspector.tsx` ("Across all sessions" section; tokens labeled "estimated"), `wrangler.toml` (`[[d1_databases]]`).
- The summary event already carries everything needed (turns/tools/tokens/`costByModel`/`actualCostUsd`/`actualCostByModel`) — see `shared/events.ts` summary type.

## Deploy order (Codex #7 — wrangler deploy does NOT apply D1 schema)
1. `wrangler d1 create voygent-demo-stats` → copy `database_id` into `wrangler.toml`.
2. `wrangler d1 execute voygent-demo-stats --remote --file migrations/0001_session_stats.sql`.
3. `VITE_API_BASE="" npm run build:web`.
4. `wrangler deploy`.
5. Verify: build a trip, then `wrangler d1 execute voygent-demo-stats --remote --command "SELECT COUNT(*) FROM session_stats"`; `curl <prod>/stats`.
(If deployed before the table exists, writes are silently swallowed and `/stats` returns empty — safe, just no data until migrated.)

## Verify / run
- Suite: `cd ~/dev/voygent-demo-demo-enrichment && npx tsc --noEmit && npx vitest run` (161 baseline).
- Boards smoke (won't touch budget; auto-sends test token): `export DEMO_TEST_TOKEN=$(grep '^DEMO_TEST_TOKEN=' .env | cut -d= -f2-) && export VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" && node scripts/smoke-enriched-run.mjs --base https://voygent-demo.somotravel.workers.dev --boards`
- Mobile visual (no API): Playwright chromium at 390px against `?mode=auto` (binary: `~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`, via `/home/neil/dev/voygent-desktop/node_modules/playwright-core`). Recipe in chat history if needed.

## Known follow-ups (not blocking)
- Autoplay engineering panel is EMPTY (recording omits inspector events by design); to show eng flexes in autoplay, regen recording WITH inspector events (extend `scripts/record-replay.mjs`).
- ModelSwitch only visible once the inspector is live (in headExtra) — not before first message (same as Advisor/Theme).
- **Task 10** (claude.ai usage measurement — NEEDS Neil interactive): run the same Cancún/Lisbon script in Claude Code w/ the voygent connector + `/cost`, compare vs the demo engineering tab (now full-catalog, comparable).

## Don't
- Don't deploy from `main` (clobbers; prod runs `demo-enrichment`).
- Don't `git add -A`/`.` — stage by name (`.env` holds the test token; gitignored now).
- Don't assume a `/chat` 503 is a layout bug — it's the budget cap / `DEMO_DISABLED`.
