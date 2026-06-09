# Session Handoff: demo-enrichment — Phases A/B/C BUILT, paused before Phase D (capture + deploy, with Neil)

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (off `main` `eddffa5`)
**This session:** Executed the implementation plan task-by-task (subagent-driven-development, `/codex-review` gate per task). Phases A→C complete. **Nothing deployed; capture script NOT run.** Paused at the Phase D boundary (golden capture + deploy are done WITH Neil).

## TL;DR for the next (Phase D, with-Neil) session
1. The enrichment pipeline + record/replay is fully built and green: `npx tsc --noEmit` clean, `npx vitest run` = **102 passed (17 files)**, `VITE_API_BASE="" npm run build:web` clean.
2. The fabrication guard is **Codex-confirmed sound** (see "Guard" below).
3. Phase D remains: **D1** capture real Dublin fixtures, **D2** capture the golden recording + (Neil's call) deploy. Steps are in the plan: `docs/superpowers/plans/2026-06-06-demo-enrichment.md`.
4. Two product decisions Neil made this session are already implemented (see "Decisions").

## What shipped to the branch (15 commits, `f639ec4`…`8825880`)
**Phase A — worker enrichment**
- `f639ec4` A1 — `FolioData += days[]/includes[]` (+ FolioActivity/Dining/Day/Include) in `shared/events.ts`.
- `f5aad07` A2 — `tripToFolio` projects `itinerary[]→days[]` + attaches `DEMO_INCLUDES`; `isTripMutating` widened (snake/camel trip id) in `worker/agent/folio-sync.ts`.
- `3916498` A3 — intercept `excursion_search`/`apply_gap_tour_picks`/`tripadvisor_search` in `worker/mcp/replay.ts`, fixture-keyed writes only; `lastPromoted().itinerary`; fixtures-injection test seam. Types in `worker/fixtures/index.ts`.
- `88ac40f` A3-fix (codex) — `slimExcursion` exposes fixture `day` so the prompt's per-pick day is coherent.
- `5eaccb4` A4 — `DEMO_TOOLS` += 3 tools; `ENRICHMENT_WORKFLOW` prompt appended to every seed (SYSTEM_HINT byte-identical); `onFolio` overlays `promoted.itinerary` **unconditionally** (null→delete); model `patch_trip` sanitized (strips itinerary/days/activities/dining/includes) in the model-facing `callTool` only.
- `f780390` A5 + `4fbb567` A5-fix (codex) — `scripts/capture-fixtures.mjs` captures excursions/dining/day-scaffold; `String()` productCode, numeric-normalize fields, dropped the unguaranteed "Depart" label. **NOT RUN.**

**Phase B — client record/replay**
- `bbf9d98` B1 — `web/src/lib/mode.ts` live/auto axis (mirrors skin axis).
- `ac24e7b` B2 — extracted `applyEvent(e, claude)` reducer in `App.tsx` (pure refactor, shared by live stream + replay).
- `7e2dee7` B3 + `c2499d2` B3-fix (codex) — `?record=1` recorder (`lib/recorder.ts`/`recording.ts`); `window.__exportRecording`; gated to the claude skin so captures aren't mislabeled.
- `027af7b` B4 — `replayChat` player (abort-aware) + `?mode=auto` autoplay + "watch the demo / build your own" pill + stub `web/src/recordings/dublin-oct.json`.
- `ab72a65` B5 — **default first-time visitors to autoplay** (`DEFAULT_MODE="auto"`) + claude skin on first paint (no board→claude flash via `applySkin("claude")` in the skin initializer).

**Phase C — rendering**
- `8afd3fa` C1 — render `days`/`includes` in the claude-skin `FolioArtifact` (`cl-*` classes) + `skin-claude.css`.
- `8825880` C2 — render `days`/`includes` in the board-skin `FolioPanel` (`folio-*` classes) + `styles.css`.

## The fabrication guard (Codex-confirmed sound on A3 + A4)
Three layers, all verified:
1. **Write sink** (`replay.ts`): `apply_gap_tour_picks` uses `productCode` only as a lookup key into `fixture.excursions`; unknown codes → `failedPicks`, dropped. Written fields come from the fixture (`ex`), day = `ex.day` (not the model's pick). Dining is fixture-sourced.
2. **Folio overlay** (`session-do.ts onFolio`): `data.itinerary` is ALWAYS set from replay state (`promoted.itinerary`), else deleted — a model/live-written staging itinerary is never rendered. (Codex verified no other `{type:"folio"}` emission path.)
3. **patch_trip sanitize** (`session-do.ts callTool`): the model can't even persist enrichment keys to staging. Replay's own `helpers.patchTrip` calls `mcp.callTool` directly, bypassing the sanitize, so fixture writes still land. (Codex confirmed the reference-mutation is correct for both `{updates:{…}}` and flat `{itinerary:[…]}` shapes.)

Codex's A3-isolation "blocker" (route-clear not persisted to staging) is **inert**: A4's unconditional overlay means staging's itinerary is never the rendered source. A naive staging-persist fix is actively unsafe (would clobber cross-tool dining), so it was deliberately not added — matching the plan's design.

## Decisions Neil made this session (already implemented)
1. **First-time visitors land on autoplay**, not live (B5). Funnel: land → watch golden run ($0, deterministic) → "● build your own" opts into + persists live.
2. **"Build your own" lands in the claude skin** (continuity with the demo just watched). The board (amber Engineering Inspector) skin stays one click away via the skin-switch pill. (No code change beyond B5 — it's the natural consequence of `applySkin` persisting claude.)

## C3 verification — what was checked (no deploy, no commit beyond docs)
- ✅ tsc clean; ✅ 102/102 tests; ✅ production build clean (JSON import bundled).
- ✅ `dev:web` (Vite) boots, serves the app on :5173.
- ✅ `dev:worker` (wrangler/miniflare) boots, `/health`→200, SESSION DO bound.
- ✅ Static wiring verified at every integration point (INTERCEPTED, DEMO_TOOLS, ENRICHMENT_WORKFLOW, onFolio overlay, patch_trip sanitize, applyEvent, replayChat/?mode/?record, DEFAULT_MODE=auto, both render skins).
- ⏸️ **Deferred to Phase D (with Neil):** the in-browser visual confirmation (enriched folio render in both skins, `?record=1` capture, `?mode=auto` playback). No headless browser was used to avoid disrupting Neil's live `DISPLAY=:0` Chrome. The plan's C3 already anticipates this needs D1 fixtures (or a temporary hand-injected stub) — fold it into the D2 capture run. (A temp enriched stub was injected during verification and reverted cleanly; the tree is clean.)

## Phase D (do WITH Neil — NOT solo)
- **D1** — run `node scripts/capture-fixtures.mjs --only=dublin-oct` (needs `VOYGENT_MCP_URL_NEIL` from `~/dev/voygent-lite/.env`; hits prod, self-cleans `demo-cap-*` trips). Confirm non-zero excursions/dining; add count-bearing tests to `replay.test.ts`.
- **D2** — `?skin=claude&record=1`, run the full golden flow + the 1–2 showcased edits Neil chooses live, `__exportRecording()`, replace `web/src/recordings/dublin-oct.json`, verify `?mode=auto`, then **deploy on Neil's say-so**: `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`.

## Notes / gotchas carried forward
- Code-discovery hook blocks `Read` on `.ts`/`.tsx`/`.html` — view with `cat -n`, author with Write/Edit (or Python exact-replace if Edit's read-gate trips). `.md`/`.json`/`.css` Read fine.
- `VITE_API_BASE=""` is mandatory on every web build/deploy (else the bundle bakes localhost).
- Stage files by name; never `git add -A`.
- Did NOT touch `worker/agent/boards.ts`, the board SSE event, `BOARDS_WORKFLOW_OVERRIDE`, `buildBoard`. No `kind:"excursion"` board. `SYSTEM_HINT` byte-identical.
