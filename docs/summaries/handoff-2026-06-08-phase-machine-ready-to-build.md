# Session Handoff: phase-machine plan ready to build (+ what shipped this session)

**Date:** 2026-06-08 · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (prod runs THIS branch — deploy-from-main clobbers)
**Prod:** Worker `voygent-demo` version `66f67181-fef7-4a3d-842d-9360bd16a2f1` → https://voygent-demo.somotravel.workers.dev
**Supersedes:** `handoff-2026-06-07-stats-history-next.md` (that feature shipped — see below).

## FIRST ACTION for the new session
**Execute the phase-machine implementation plan:** `docs/superpowers/plans/2026-06-08-phase-machine-demo-orchestration.md`. It is a complete, self-contained, 10-task TDD plan (commit `631bb13`). Start at **Task 0** (create branch `phase-machine` off `demo-enrichment`). REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`.
- **Pause for the human at two points** (per the plan): after **Task 8 (`/codex-review`)** so they see the findings, and before **Task 10's flag-flip** in prod.
- The source design spec is `docs/superpowers/specs/2026-06-07-phase-machine-demo-orchestration.md` (the plan already absorbs it; read only if you need the "why").

## What the phase-machine is (one paragraph)
The demo's trip build is one open-ended agent loop that sometimes stops early, presents-instead-of-acting, or narrates restaurants from memory. The plan replaces model discretion with a **server-side phase state machine** in `SessionDO`: a pure `advancePhase()` reducer (driven by *observed tool results*, not trust) walks INTAKE→FLIGHT_PICK→…→SUMMARY, and the model only ever sees ONE small directive at a time. Auto-continuation (capped) re-prompts a model that stops mid-build, killing the failure modes structurally. **The whole machine is gated behind a `DEMO_PHASE_MACHINE` env flag** — ships dormant, flag-off path byte-identical to today, instant rollback via `wrangler secret delete DEMO_PHASE_MACHINE`.

## Plan specifics the new session MUST keep in mind
- **Name the build-state type `TripPhase`** — `shared/models.ts` already exports `Phase` ("discovery"|"enrichment", the model-routing phase). Do not collide.
- **Flag isolation is the #1 risk control.** When `DEMO_PHASE_MACHINE` is unset, the existing seed+`nudge` path must run unchanged (the golden recording, boards mode, and live demo depend on it). The new loop hooks (`afterToolBatch`, `continueDirective`) are additive and no-op when absent.
- **Boards present-and-wait guard:** in boards mode, a model stop at `FLIGHT_PICK`/`HOTEL_PICK` is the model correctly waiting for a human — `continueDirective` must return null there (it does in the plan; verify it survives codex review).
- **Acceptance bar (Task 9):** with `LLM_MODEL=claude-haiku-4-5`, **10/10** scripted Dublin runs → folio days≥3, ≥1 free + ≥1 paid activity, dining≥4, zero un-fixture names in prose. Don't lower the bar; tune `phases.ts` directives if it misses.
- **The `/codex-review` (Task 8)** runs after unit-green, before the live (money-spending) acceptance runs and before deploy. The exact review prompt (6 focus areas) is in the task.

## Verify / run (from the worktree root)
```bash
cd ~/dev/voygent-demo-demo-enrichment
npx tsc --noEmit && npx vitest run        # baseline: 167 tests pass
```
- Local run with the flag on: put `DEMO_PHASE_MACHINE=1` (+ `ANTHROPIC_API_KEY`, `VOYGENT_MCP_URL`, `VOYGENT_MCP_BEARER`) in `.dev.vars`, then `npx wrangler dev --local --port 8787`.
- Smoke (skips budget + stats via the test token): `export DEMO_TEST_TOKEN=$(grep '^DEMO_TEST_TOKEN=' .env | cut -d= -f2- | tr -d '"')` then `node scripts/smoke-enriched-run.mjs --base <url> --boards` (Task 9 adds `--repeat N`).
- **Deploy (only from `demo-enrichment`, never main):** `VITE_API_BASE="" npm run build:web && npx wrangler deploy`.

## What shipped THIS session (all on `demo-enrichment`, all deployed unless noted)
1. **Engineering-stats history** — `14a2c59` + `954ff5c`. D1 `voygent-demo-stats` (`20321ac2-3669-489e-b67c-5e5bd91d6f2e`, binding `STATS_DB`), one row per completed exchange written in an anchored `Promise.allSettled` before `mux.close()`; public edge-cached `GET /stats` aggregates feed the Inspector's "Across all sessions" section. **Deployed + E2E verified** (a real exchange wrote a matching row, then deleted → table clean at 0). **GOTCHA: test-token/smoke runs are EXCLUDED from stats writes by design** — only a real `/chat` writes a row.
2. **Free things for cancun/nyc/rome/tokyo** — `f345e35`. 15 TripAdvisor-validated free `excursions` (real TA location ids + ratings via targeted single-landmark lookups; a generic "free things" query returns junk — the `shiny-camel` relevance issue). Every `bookingUrl` HTTP-checked.
3. **URL validation at capture + durability** — `5fc7102`. `capture-fixtures.mjs` now HEAD/GET-validates every excursion/dining URL (ok / bot-gated / BAD classes; `--strict-urls`, `--no-url-check`). Caught + fixed a real dead link (dublin Ha'penny → `bridgesofdublin.ie` is NXDOMAIN). Added the 4 cities to `FREE_THINGS_BY_ID` so re-capture preserves them.
4. **Autoplay recording with inspector events** — `2a5add5`. `record-replay.mjs` now keeps inspector events (10ms delay, text cadence intact, 600-char result trim) → regenerated `dublin-oct.json` (157 frames, 52 inspector events). **The autoplay (`?mode=auto`) Engineering panel is now LIVE** (Playwright-verified on prod: 13 tool rows, scoreboard, "$0.37 routed").
5. **Phase-machine plan** — `631bb13`. The doc this handoff points you at. **Not started.**

All deployed in Worker `66f67181` (build:web + wrangler deploy from `demo-enrichment`, 2026-06-08). Tree is clean. 167 tests pass.

## State of the worktree
- Branch `demo-enrichment`, clean tree, HEAD `631bb13`.
- `.dev.vars` / `.env` are gitignored; `.env` holds `DEMO_TEST_TOKEN`. `VOYGENT_MCP_URL_NEIL` (for capture/cleanup) lives in `/home/neil/dev/voygent-lite/.env`.
- Secrets in prod: `BUDGET_DAILY_USD=25`, `DEMO_TEST_TOKEN`, `ANTHROPIC_API_KEY`, `VOYGENT_MCP_URL/BEARER`. `DEMO_PHASE_MACHINE` is NOT set (the new feature ships dormant).

## Demo's remaining roadmap after phase-machine
- **Task 10 (needs Neil interactive):** claude.ai usage measurement — run the same Cancún/Lisbon script in Claude Code with the voygent connector + `/cost`, compare vs the demo Engineering tab.
- Minor: ModelSwitch not visible before the first message (lives in the Inspector head).
- Known bugs (filed): `wild-wolf` (auto+live quadrant flaky), `sharp-plateau` (upstream double-wrap).

## Don't
- Don't deploy from `main` (clobbers; prod runs `demo-enrichment`).
- Don't `git add -A`/`.` — stage by name (`.env` holds the test token; gitignored).
- Don't assume a `/chat` 503 is a layout bug — it's the budget cap or `DEMO_DISABLED` (curl the body to tell).
- Don't ship the phase machine flag-ON in one step — code dormant first, canary with the test token, then flip the secret (Task 10).
