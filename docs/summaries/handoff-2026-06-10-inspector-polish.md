# Session Handoff: Inspector rail + demo surface polish (Phases A–C shipped)

**Date:** 2026-06-10 (evening)
**Repo:** /home/neil/dev/voygent-demo (branch `main`, clean + pushed)
**Live prod bundle at handoff:** `index-D4HAjykg.js`. 421 tests, tsc clean.
**Smoke link:** `https://demo.voygent.ai/?mode=live&skin=claude&advisor=1#code=2ebf-azf0-z0qm-txqq`
(Cancún or NYC menu trip.)

## Read first
- Spec: `docs/superpowers/specs/2026-06-10-inspector-rail-and-surface-polish-design.md`
- Plan: `docs/superpowers/plans/2026-06-10-inspector-rail-and-surface-polish.md`
- Mockup (target look): https://demo.voygent.ai/mockups/inspector-rail
- Memory: `project-credentialed-search-capture` (the cpmaxx track this built on).

## What SHIPPED this session (committed + deployed, do NOT redo)
Three phases of the plan, each its own deploy + Neil-smoke point:

- **Phase A — price fixes** (bundle `KiVaahoc`). Hotel cards + folio headline the CLIENT
  price with "All-inclusive · N nts · M travelers" context; per-night reconciles FROM the
  headline; advisor ladder shows "below public $X" ONLY on real savings (hidden for current
  Cancún data, OTA ≈ cpmaxx rate); flights show "N travelers · $X each".
  Files: `worker/mcp/replay.ts` (slimCpmaxxHotel travelers+allInclusive, synthCpmaxxLodging),
  `worker/agent/boards.ts` (cpmaxxHotelCandidate client-price headline + ladder gate; flight
  per-person), `worker/agent/folio-sync.ts`, `web/src/BoardView.tsx`, `web/src/FolioPanel.tsx`,
  `shared/events.ts` (BoardCandidate/FolioHotel/FolioFlight context fields).
- **Phase B — self-describing tool chips** (bundle `Cw6inXvV`). Chips read human labels
  ("Searching hotels in Cancún", "Shortlisting hotels", "Building the day-by-day") + a mono
  raw-tool tag. Shared resolver `shared/tool-chip-title.ts`; worker emits `title` on the tool
  event (`worker/agent/loop.ts`); App + `ClaudeToolChip.tsx` render it; reel falls back to the
  name-based label.
- **Phase C — skinny live Inspector rail** (bundle `D4HAjykg`, CURRENT live). Inspector NEVER
  auto-expands. `EngState` is now `idle | peek | open` (`web/src/lib/inspector-state.ts`):
  first tool → a live ~96px `peek` rail (active phase + pipeline pips + top-3 registry stats +
  one-time attention beat); click → full `open` two-pane; collapse (▾) returns to rail.
  Extensible stat registry `web/src/lib/inspector-stats.ts` (`buildStats/railStats/deepDiveLinks`)
  drives the rail AND the panel-bottom "Dig deeper" links (stat-tied primary + "More on the
  engineering" secondary). Inspector derivations were moved ABOVE the render branch so the rail
  reuses them. CSS: `.ins-peek*` + `@keyframes insbeat/inspulse/inshint` in `web/src/styles.css`;
  `data-eng` renamed `live→open`, `collapsed→peek` in `styles.css` + `skin-claude.css`.

## What's PENDING Neil's smoke
The peek rail (live-at-rest, attention beat on first tool, click-to-expand, dig-deeper links)
and the Phase A/B surfaces. No headless smoke in this env.

## What the NEXT session should do (in priority order)
1. **Phase D — drill-down telemetry** (the engineering "wow" Neil asked for; the registry +
   drillable panel are now in place, so this is the natural next build). Write its own detailed
   plan first, then build. Sequenced by wow-per-effort (spec Part 6, codex-ranked):
   - **Token Elimination Funnel** — distill ledger first (`raw N tok → slim M tok, −%` per
     search from fixture `meta.*.rawTokensEst` + replay `measurement.modelFacingTokens`), Sankey later.
   - **Counterfactual Cost Simulator** — actual vs all-Sonnet / all-Opus / no-cache grouped bars
     (from `summaries` costByModel + usage).
   - **Per-Phase Critical-Path Waterfall** — tool-call gantt with nested spans (`tools[].latencyMs`
     + phase mapping + `overhead`).
   - Then: per-turn token waterfall, model-routing swimlane, fabrication-guard ledger (needs a
     small new replay event emitting the validated/rejected id tally), latency breakdown.
   Each = a registry entry and/or a click-to-expand detail; model-facing tokens stay 0.
   The mockup already shows the funnel + cost-simulator visuals (`/mockups/inspector-rail`).
2. **C5** — render the panel's summary tiles from `buildStats` (internal refactor; panel currently
   still uses the hardcoded `ins-strip`. Low risk, makes the registry the single source for tiles too).
3. **C7** — mobile live-indicator button (a compact "◉ {tools} · {cost}" in the mobile chat toolbar
   that opens the existing `.engineering` overlay; desktop rail is done, mobile unchanged).
4. **cpmaxx 3-up hotel multi-select** (separate, older handoff `handoff-2026-06-10-cpmaxx-multiselect.md`)
   — worker already supports multi-promote; gap is BoardView (single-highlight → Set of 3 +
   "Present 3 to client →").

## Deploy / verify (every change)
`VITE_API_BASE="" npm run build:web && npx wrangler deploy`
Verify: `curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'` = new bundle;
`curl -s -o /dev/null -w "%{http_code}" https://demo.voygent.ai/blog//stats` = 200 (edge lags ~5s).
Run `npx vitest run && npx tsc --noEmit` before every commit. Wrangler `deploy` occasionally
exits 1 transiently — just re-run it.

## Coordination / branch
On `main` all session (Neil smokes each deploy on prod). Parallel worktree `deepdive-voice`
(branch `deepdive-voice-rewrite`) touches `/info` deep-dive COPY — no file overlap with this
track. Journal coord notes are current (`docs/worktree-journal.md`).

## Conventions
Plain copy, no em-dashes (`feedback-demo-copy-voice-no-em-dash`). Commission/ladder advisor-gated.
Don't bloat the model-facing slim payload beyond cheap ints/bools (telemetry/context rides
out-of-band). Mockups: throwaway static HTML at `web/public/mockups/<name>.html` → served at
`demo.voygent.ai/mockups/<name>`, claude-skin tokens in project CLAUDE.md.
