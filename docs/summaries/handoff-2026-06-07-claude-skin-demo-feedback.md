# Session Handoff: work Neil's manual-testing feedback on the claude-skin demo

**Date:** 2026-06-07 · **Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (NOT merged to main)
**Mission:** Neil is manually testing the deployed demo — **https://voygent-demo.somotravel.workers.dev/?skin=claude** — and will hand this session a feedback list. Triage each item with the map below, fix, verify, redeploy on his say-so.

## Current state (verified 2026-06-07)
- **Deployed to prod FROM THIS BRANCH** (not main). HEAD `6c1baea`. Wrangler version `1877240a-…` + a later secrets-only update.
- Everything through Phase D1 is DONE: enrichment pipeline (excursions + LLM-proposed/TA-validated free things + dining + includes), record/replay (`?record=1`, `?mode=auto`), autoplay default for first-time visitors, both skins render days/dining/includes. 108 tests green, `npx tsc --noEmit` clean.
- **Prod secrets currently set** (wrangler, write-only — values not in git):
  - `LLM_MODEL=claude-sonnet-4-6` (flipped from haiku for instruction-following; revert = `npx wrangler secret delete LLM_MODEL`).
  - `VOYGENT_MCP_URL` = **Neil's per-user token URL** (NOT the bearer `/mcp` base). This was the critical fix: the old bearer's tier catalog was missing `apply_gap_tour_picks` + `tripadvisor_search` (10/12 tools → model couldn't enrich). Per-user URL exposes 12/12. `VOYGENT_MCP_BEARER` left untouched (ignored on the per-user path) so rollback is just pointing the URL back.
- **Verified on prod after the fixes:** 2/2 single-turn runs complete the full chain unprompted; folio = 5 days / 4 activities (free+paid mix) / 6 dining / 3 includes; prose names ONLY tool-returned items.
- `web/src/recordings/dublin-oct.json` is still the 3-frame STUB → bare `/` autoplays the stub. The golden recording (Task D2) is captured WITH Neil (`?skin=claude&record=1` → `__exportRecording()`), then installed + redeployed.
- Local dev: `.dev.vars` exists (gitignored) with `ANTHROPIC_API_KEY`, `VOYGENT_MCP_URL` (per-user URL), placeholder bearer, `LLM_MODEL`. Local servers are currently DOWN.

## Feedback triage map — where each kind of issue gets fixed
| Feedback smells like… | Fix lives in |
|---|---|
| Claude-skin visuals (bubbles, chips, boards, artifact card, spacing) | `web/src/ClaudeChatView.tsx`, `web/src/skin-claude.css` (ALL rules scoped `:root[data-skin="claude"]`, classes `cl-*`; NEVER touch `--board/--ink/--amber`) |
| Folio content/layout (day-by-day, dining, includes) | claude: `FolioArtifact` in `ClaudeChatView.tsx`; board skin: `web/src/FolioPanel.tsx`; data shape: `shared/events.ts` (`FolioDay/FolioActivity/FolioDining/FolioInclude`); projection: `worker/agent/folio-sync.ts` (`projectDays`, `DEMO_INCLUDES`) |
| Model behavior / prose / ordering / "it said X weirdly" | `ENRICHMENT_WORKFLOW` in `worker/session-do.ts` (safe to edit). **`SYSTEM_HINT` must stay byte-identical; `BOARDS_WORKFLOW_OVERRIDE` is claude-skin-owned — don't touch.** Bigger behavior fixes → the phase-machine (issue `wild-wolf`, spec: `docs/superpowers/specs/2026-06-07-phase-machine-demo-orchestration.md`) |
| Wrong/missing excursion/dining/free-thing data | fixture `worker/fixtures/dublin-oct.json`; regenerate via capture script (see below) — `FREE_THINGS_BY_ID` in `scripts/capture-fixtures.mjs` survives re-capture |
| Board click/pick behavior | `web/src/BoardView.tsx`, pick→message flow in `App.tsx` `onPick`. **Do NOT touch `worker/agent/boards.ts`, the `board` SSE event, or `buildBoard` wiring** |
| Autoplay / watch-the-demo pill / mode | `web/src/lib/mode.ts`, `recording.ts`, `App.tsx` auto effect, `.watch-demo` in `styles.css`. DEFAULT_MODE="auto" is deliberate (Neil's call); build-your-own lands in claude skin (also his call) |
| Tool latency / cost / budget | `LLM_MODEL` secret; `BUDGET_DAILY_USD` (default $5 ≈ 30 sonnet sessions/day); `maxTurns=12`/`maxToolCalls=24` in `worker/agent/loop.ts` |

## Invariants — do not weaken while fixing feedback
1. **Folio itinerary is ALWAYS replay-controlled**: `onFolio` in `session-do.ts` sets `data.itinerary` from `replay.lastPromoted().itinerary` unconditionally (null → delete).
2. **Model `patch_trip` is sanitized** (strips itinerary/days/activities/dining/includes) in the model-facing `callTool` only; replay's `helpers.patchTrip` bypasses it — keep that split.
3. **Only fixture-keyed productCodes/ids reach activities/dining** (`replay.ts`); `tripadvisor_search` writes dining WITHOUT a trip_id gate (the real schema has none — don't re-add the gate).
4. Stage files by name (never `git add -A`); keep changes additive; no `kind:"excursion"` board.

## Verify / run / deploy recipes
- `npx tsc --noEmit` · `npx vitest run` (baseline **108**) — from the worktree root.
- Local: terminal A `npx wrangler dev --port 8787`; terminal B `npx vite --config web/vite.config.ts --port 5173` (NO `VITE_API_BASE` in dev — empty-string breaks the :8787 default). Open `http://localhost:5173/?skin=claude`.
- **Deploy:** `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy` (the empty `VITE_API_BASE` is mandatory FOR BUILDS; worker-only changes still need `dist-web/` present from a prior build). Deploy only on Neil's say-so.
- Headless enriched-run smoke (no browser): POST the Dublin preset prompt to `/chat?session=<id>` and parse the SSE for the last `folio` event — the analyzer snippet lives in the 2026-06-07 session transcript; consider promoting it to `scripts/smoke-enriched-run.mjs` (also wanted by the `wild-wolf` acceptance criteria).
- Capture (hits prod, self-cleans): `VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs --only=dublin-oct`

## Environment gotchas (will bite you)
- A code-discovery hook **blocks the `Read` tool on `.ts/.tsx/.html`** → view with `cat -n` via Bash; author with Write/Edit; if Edit demands a prior Read, use a Python exact-string-replace with a unique multi-line anchor.
- Bash cwd resets to `/home/neil/dev/voygent-lite` after every call → prefix every command with `cd /home/neil/dev/voygent-demo-demo-enrichment && …`.
- Background dev servers: use the harness's `run_in_background` with the server in the FOREGROUND of the command — `nohup …&` dies between tool calls.

## Open items (besides the feedback)
- [ ] **D2 golden recording** (with Neil): capture at `…/?skin=claude&record=1` → `__exportRecording()` → replace `web/src/recordings/dublin-oct.json` → verify `?mode=auto` → commit → redeploy.
- [ ] **Merge decision**: `demo-enrichment` → main (prod currently runs the branch; last-deploy-wins — coordinate before anyone deploys from main, it would clobber the demo).
- [ ] **`wild-wolf`**: phase-machine orchestration (spec committed) — build triggers listed in the spec.
- [ ] Cleanup: `demo-*` smoke trips now persist under Neil's user prefix (per-user URL change) — offer to delete; longer-term a dedicated demo identity with Pro-tier catalog.
- [ ] **Google Places API key is SUSPENDED** (CONSUMER_SUSPENDED 403; `google_places_lookup` dead in prod voygent) — not this repo's bug, but Neil should rotate it.

## What NOT to re-read
- The implementation plan/specs for phases A–C (`docs/superpowers/plans/2026-06-06-demo-enrichment.md`) — built, reviewed, shipped; this doc + `handoff-2026-06-06-demo-enrichment-phaseABC-built.md` carry the conclusions.
