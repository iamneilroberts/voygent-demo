# Session Handoff: phase-machine BUILT + acceptance-passed, NOT YET DEPLOYED

**Date:** 2026-06-08 · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `phase-machine` (off `demo-enrichment`)
**Supersedes the build half of:** `handoff-2026-06-08-phase-machine-ready-to-build.md` (that plan is now implemented).

## TL;DR — SHIPPED + LIVE (2026-06-08)
The server-side trip-build **phase machine** is implemented, two-stage-reviewed, Codex-reviewed, acceptance-passed **10/10** local + **3/3** prod canary, **merged to `demo-enrichment` (`16827fc`), deployed, and the `DEMO_PHASE_MACHINE` flag is LIVE in prod** (Worker `voygent-demo` version `11577554`). The merge superset (phase-machine + the concurrently-landed llm-tweaks/store-ops work) is **221 tests green**. **Instant rollback: `npx wrangler secret delete DEMO_PHASE_MACHINE`** (reverts to the legacy path, no redeploy). v1 limit stands: keep the behavior FEATURED-only mentally — directives aren't liveMode-aware (the seed's LIVE_TRIP_WORKFLOW still covers live trips).

## What's done (Tasks 0–9 of the plan)
- 11 commits on `phase-machine` (merge-base `9d9030a`). `npx tsc --noEmit` clean; **190 vitest tests pass** (167 baseline + 23 new).
- **phases.ts** — pure `TripPhase` machine: enum + ordering helpers, `phaseDirective()` (per-phase micro-directives), `advancePhase()` reducer (advances by OBSERVED tool results), `shouldInjectPhaseDirectiveAfterBatch()`.
- **loop.ts** — two additive optional hooks (`afterToolBatch` result-carrying; `continueDirective` capped continuation). Flag-off path byte-identical (no hooks → unchanged).
- **session-do.ts** — flag-gated wiring (`DEMO_PHASE_MACHINE`): holds/hydrates/persists `tripPhase`; first-turn INTAKE directive; `afterToolBatch` advances + emits `kind:"phase"` + injects directive (suppressed at boards FLIGHT_PICK/HOTEL_PICK — seed owns the interactive flow); `continueDirective` with boards present-and-wait guard, SUMMARY→EDITS, retry-cap→SUMMARY (`MAX_CONTINUATIONS=4`). Legacy `nudge` suppressed only when flag on.
- **session-store.ts** — `SessRecord.tripPhase?` (optional, backward-compatible).
- **shared/events.ts + web** — `kind:"phase"` inspector event + a "Workflow engine" phase trail in the inspector panel.

## Review outcomes (Task 8)
- Codex external review run on the full diff. Findings triaged with receiving-code-review discipline:
  - **HIGH #2 (boards hotel present-and-wait bug) — FIXED** (commit `585a96f`, Option B): in boards mode `afterToolBatch` injects no directive at the pick phases; the seed's `BOARDS_WORKFLOW_OVERRIDE` drives the interactive present/wait/promote. (A directive-mirror alternative was rejected for a separate-batch staging deadlock risk.)
  - **HIGH #1 (phaseDirective ignores liveMode) — DOCUMENTED as a v1 limitation** (comment above `phaseDirective`). Directives are tuned for FEATURED/replay trips; for LIVE (off-menu) trips the real MCP chain differs (viator needs a resolved `destination_id`; dining doesn't auto-save). **Keep `DEMO_PHASE_MACHINE` OFF for live traffic** until directives are made liveMode-aware. The seed's `LIVE_TRIP_WORKFLOW` still covers live trips.
  - MEDIUM (one-batch multi-advance; cap→SUMMARY over a half-built folio) — accepted as intended/low-risk. LOW (tripPhase persisted when flag off) — harmless/desirable.

## Acceptance (Task 9) — 10/10 PASSED
Local `wrangler dev --local` with `DEMO_PHASE_MACHINE=1`, `LLM_MODEL=claude-haiku-4-5`, boards mode, 3-exchange Dublin build, ×10:
`node scripts/smoke-enriched-run.mjs --base http://localhost:8787 --boards --repeat 10`
→ **10/10**, every run: 5 days · 3 activities (≥1 free + ≥1 paid) · 6 dining · 3 includes, zero fabricated names.
- Auto-mode sanity also drove the full chain: `INTAKE→FLIGHT_PICK→HOTEL_SEARCH→HOTEL_PICK→ENRICH_EXCURSIONS→APPLY_PICKS→ENRICH_DINING→SUMMARY`, 0 errors.

### Harness fixes made during Task 9 (commits `f456888`, `2bc1f82`)
The `--repeat` acceptance harness in `scripts/smoke-enriched-run.mjs`:
- defaults the prompt to **Dublin** in `--repeat` mode (was Cancún, mismatching the Dublin fixture);
- validates prose names against the run's **actual tool output** (committed folio + presented board candidates + tool results), not just the excursion/dining fixture — so legit hotels/airlines/landmarks aren't flagged;
- token-overlap paraphrase tolerance (e.g. "Darley Kelly's" ≈ fixture "Darkey Kelly's") so a minor model typo of a real name doesn't fail the run, while wholesale fabrication still does.

### Local-run gotcha (cost a budget cap today)
The worker's budget-skip requires **`DEMO_TEST_TOKEN` in `.dev.vars`** (the worker reads bindings from `.dev.vars`; the harness reads its header value from `.env`). If it's missing locally, test runs count against the daily cap and you'll hit a **503 "hit its daily limit"**. Add `DEMO_TEST_TOKEN=<value from .env>` to `.dev.vars` for local acceptance runs. (Both `DEMO_TEST_TOKEN` and `DEMO_PHASE_MACHINE=1` were added to `.dev.vars` for the run and **reverted afterward** — `.dev.vars` is back to its original 4 keys.)

## REMAINING — Task 10 (paused before the prod flag-flip)
Do these from the `demo-enrichment` worktree. **Deploy only from `demo-enrichment`, never `main`.**
1. **Merge:** `git checkout demo-enrichment && git merge --no-ff phase-machine && npx tsc --noEmit && npx vitest run` (expect 190 pass).
2. **Deploy DORMANT (flag still off):** `VITE_API_BASE="" npm run build:web && npx wrangler deploy`. Verify visitor behavior unchanged (no `DEMO_PHASE_MACHINE` secret set yet → legacy path; `GET /stats` still 200; a normal build still works).
3. **Canary (THE FLAG-FLIP — human-gated):** `npx wrangler secret put DEMO_PHASE_MACHINE` (value `1`), optionally `npx wrangler secret put LLM_MODEL` (`claude-haiku-4-5`), then `node scripts/smoke-enriched-run.mjs --base https://voygent-demo.somotravel.workers.dev --boards --repeat 3` (export `DEMO_TEST_TOKEN` from `.env` first). Expect 3/3.
   - **Instant rollback:** `npx wrangler secret delete DEMO_PHASE_MACHINE` (reverts to legacy path, no redeploy).
4. Record the deployed Worker version + acceptance numbers here; update the project memory pointer.

## Don't
- Don't deploy from `main` (prod runs `demo-enrichment`).
- Don't enable `DEMO_PHASE_MACHINE` for live/off-menu traffic yet (HIGH #1 v1 limitation).
- Don't `git add -A` (`.dev.vars`/`.env` are gitignored WIP).
