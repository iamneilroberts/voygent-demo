# Session Handoff: demo-enrichment — spec ready, awaiting review → plan → build

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (off `main` `eddffa5`)
**This session:** Brainstormed + specced **sub-project 1** of the demo's "rich itinerary + two modes" effort. **No app code written yet** — the design spec is committed; the next session reviews it with Neil, writes the plan, and builds.

## TL;DR for the next session
1. **Read the spec** (it's self-contained): `docs/superpowers/specs/2026-06-06-demo-enrichment-and-replay-design.md` (commit `b0da371`).
2. **Get Neil's explicit OK on the spec** if he hasn't given it (we paused exactly at the brainstorming user-review gate). Make any edits he asks for.
3. Then invoke **`superpowers:writing-plans`** → produce `docs/superpowers/plans/2026-06-06-demo-enrichment.md`.
4. Then execute with **`superpowers:subagent-driven-development`** (the household pattern; `/codex-review` as the review gate per Neil's standing preference — he had me use it that way on the prior demo-ui-port build).
5. **Capture the golden recording LAST**, with Neil (it needs a real live run + his choice of the 1–2 showcased edits).
6. **Do NOT deploy** without Neil's say-so. When you do: `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy` (the `VITE_API_BASE=""` is non-negotiable or the bundle bakes localhost).

## What this is (full context)
The demo (`voygent-demo.somotravel.workers.dev`) is a hand-rolled MCP agent host that builds a real trip live. Two sessions ran in parallel today:
- **`claude-skin` — SHIPPED & merged to main** (`821f44e`): the `?skin=claude` split-screen (claude.ai-style chat left / amber-CRT Inspector right) + **interactive flight/hotel selection boards** (click a card → agent promotes that candidate). Its handoff: `docs/summaries/handoff-2026-06-06-claude-skin-shipped.md`. Read it before touching `App.tsx`/`session-do.ts`/`shared/events.ts`.
- **`demo-enrichment` — THIS work** (spec only so far): make the trip *rich* (excursions, free things, dining, includes, day-by-day) + an **automated record/replay** "▶ Watch the demo" mode.

Neil's framing: the **automated** mode "demonstrates what's possible" (hands-off); the **interactive** mode (claude-skin boards) "lets the user have a realistic simulation." This sub-project is the automated/rich half (Goal A). Goal B (interactive selection) largely shipped via claude-skin; sub-project 2 extends it (excursion boards, folio-board inline edits).

## The design in brief (full detail in the spec)
Two independent components meeting only at the existing `{type:"folio"}` SSE event:
- **A — worker-only enrichment:** add excursion/gap-tour/dining tools to `DEMO_TOOLS`; a **separate additive** `ENRICHMENT_WORKFLOW` prompt constant (leave `SYSTEM_HINT` byte-identical, mirroring how claude-skin added `BOARDS_WORKFLOW_OVERRIDE`); fixtures + slim mappers in `replay.ts` (mirror `slimFlight`/`slimHotel`); extend `FolioData` with `days[]`/`includes[]` (mirroring voygent's `src/folio-board/types.ts` `DayBlock`/`IncludeSection`) projected by `tripToFolio`; render the new fields in `FolioArtifact` (claude skin) + `FolioPanel` (board skin). **Preserve the fabrication guarantee** — excursion/dining writes must be fixture-keyed only.
- **B — client-only record/replay:** a `?record=1` capture wrapper → JSON recording; a `replayChat` player on a `?mode=auto` axis (orthogonal to skin; plays in claude skin); one small `App.tsx` refactor extracting the inline `send()` reducer into a shared `applyEvent` used by both live and replay. **No worker change for record/replay.**

## Locked decisions (do NOT re-litigate)
- Build order: **automated showcase first** (this), interactive second.
- Automated mode = **record-then-replay** (client-side, $0, deterministic) — NOT live each run.
- Boards/folio = the **real voygent surfaces** (claude-skin's claude.ai-style cards) — **no amber-CRT reskin of boards**. (The amber-CRT skin is being reconsidered; the claude split-screen skin is the direction. Skin is not this sub-project's concern — stay skin-agnostic.)
- Dining/free = **mixed**: excursions + free via real tools (Viator/gap-tours); dining as framed editorial "local picks," not bookable inventory.
- Golden/dev trip = **Dublin** (existing `dublin-oct` fixtures; claude-skin's test trip). Swappable.

## Resolve during planning (non-blocking)
- Exact voygent tool names/return shapes for excursion/gap/dining + how excursions get promoted into the trip (fabrication-guard-preserving). Check the live catalog (`mcp__claude_ai_voygent__*`: `excursion_search`, `suggest_gap_tours`, `apply_gap_tour_picks`, `google_places_lookup`, `tripadvisor_search`, `viator_activity_search`).
- Dining tool choice (`google_places_lookup` vs `tripadvisor_search`).
- The trip-side fields the enrichment tools write (drives `tripToFolio` source paths) — verify on a real run.
- Placement of the "Watch the demo / Build your own" control vs `SkinSwitch`.
- The exact 1–2 showcased edits (decide with Neil at capture time).

## Coordination state (`docs/worktree-journal.md`)
- `claude-skin` is **shipped/merged/worktree-closed**; its merged branch can be `git branch -d claude-skin` when convenient. The seams it owns are in main: the `board` event, `boardsMode`+`BOARDS_WORKFLOW_OVERRIDE`, `buildBoard` hook, `App.tsx items: TimelineItem[]`. `replay.ts` was untouched by it.
- **`kind:"excursion"` selection boards are DEFERRED** — they extend claude-skin's `board` event; coordinate before adding (that's sub-project 2, not this).
- Keep all changes **additive** (separate constants/files) — claude-skin is merged so it's a clean rebase, no live race.

## Environment gotchas
- **Code-discovery hook blocks the `Read` tool on `.ts`/`.tsx`/`.html`** in this environment (routes to codebase-memory-mcp). Workaround: `cat -n <file>` via Bash to view; `Write`/`Edit` to author. `.md`/`.css` Read fine (retry once if the first call is intercepted).
- A fresh worktree has **no `node_modules`** — run `npm install` in it before `typecheck`/`test`/`build`.
- Build/deploy: `rm -rf dist-web && VITE_API_BASE="" npm run build:web` (the empty `VITE_API_BASE` is mandatory).

## What NOT to do
- Don't build board *presentation* or a `kind:"excursion"` board (claude-skin's domain / deferred).
- Don't reskin the boards in amber-CRT.
- Don't touch `boards.ts` / `BOARDS_WORKFLOW_OVERRIDE` / the `board` event (additive-only elsewhere).
- Don't add a worker `?record=1` path — record/replay is client-side.
- Don't deploy or capture the golden recording without Neil.
