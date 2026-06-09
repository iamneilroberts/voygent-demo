# Session Handoff: demo-enrichment — plan written, codex-reviewed, ready to BUILD

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` · **Worktree:** `/home/neil/dev/voygent-demo-demo-enrichment` · **Branch:** `demo-enrichment` (off `main` `eddffa5`)
**This session:** Got Neil's spec sign-off, wrote the implementation plan, ran `/codex-review` on the plan, folded all findings in. **No app code written yet** — next session executes the plan.

## TL;DR for the next session
1. **Read the plan — it's self-contained and has exact code for every step:** `docs/superpowers/plans/2026-06-06-demo-enrichment.md` (commit `0dade96`, codex-hardened).
2. Skim the spec for the "why": `docs/superpowers/specs/2026-06-06-demo-enrichment-and-replay-design.md`.
3. Skim the merged seams you build on: `docs/summaries/handoff-2026-06-06-claude-skin-shipped.md`.
4. **Execute with `superpowers:subagent-driven-development`** — fresh subagent per task, `/codex-review` as the per-task review gate (Neil's standing preference).
5. **Build Phase A → C** (worker enrichment → client record/replay → rendering). **PAUSE at Phase D** (capture real Dublin fixtures + golden recording + deploy) — those are done WITH Neil, not solo.
6. **Do NOT deploy and do NOT run the capture script without Neil.**

## Status / what's done
- Spec approved; **dining source locked to `tripadvisor_search`** (Neil's call at sign-off).
- Plan: 13 TDD tasks, 4 phases. Self-reviewed (writing-plans checklist) + externally reviewed (`/codex-review`, gpt-5.5, read-only against real source).
- Codex outcome: **1 blocker + 7 should-fix + 2 nits — ALL folded into the plan** (`0dade96`). Codex also confirmed the two riskiest claims hold (the `applyEvent` extraction is behavior-identical; the committed-JSON import is build-safe via `resolveJsonModule`).
- Worktree journal updated (`## Active` → `demo-enrichment`, with the don't-touch list).
- `npm install` already run in this worktree (node_modules present).

## What the plan builds (recap)
Two independent components meeting only at the `{type:"folio"}` SSE event + the extended `FolioData` shape:
- **Component A (worker):** add `excursion_search` / `apply_gap_tour_picks` / `tripadvisor_search` to `DEMO_TOOLS`; a separate additive `ENRICHMENT_WORKFLOW` prompt constant (SYSTEM_HINT stays byte-identical); fixture-keyed interception in `replay.ts` (writes only into `trip.itinerary[]`); `FolioData += days[]/includes[]` projected by `tripToFolio`; render in both folio views.
- **Component B (client):** `?record=1` recorder → committed golden `Recording`; extract `App.tsx` `send()` reducer into a shared `applyEvent`; `replayChat` player on a `?mode=auto` axis; "▶ Watch the demo" control.

## Locked design decisions (resolved during planning — do NOT re-litigate)
1. Excursions + free things ride `excursion_search` → `apply_gap_tour_picks` (free = `free:true`/$0 same fixture set). **`suggest_gap_tours` is NOT used** (needs gap-day itinerary the demo trip lacks).
2. Dining = `tripadvisor_search` **doubles as its own apply** (editorial/non-bookable, no promote step) — writes fixture dining into `itinerary[].dining[]` when a trip id is present. Fixture-keyed → fabrication-safe; model authors no dining content.
3. Includes = static boilerplate template (`DEMO_INCLUDES`) attached by `tripToFolio` when enriched.
4. Golden/dev trip = **Dublin** (`dublin-oct`). The 1–2 showcased edits are chosen with Neil at capture (Task D2).

## The codex BLOCKER fix (most important thing to get right)
`patch_trip` runs LIVE against staging and is NOT intercepted. Without the fix, a model that wrote `patch_trip {itinerary:[…fabricated…]}` (skipping the enrichment tools) could land fabricated days in the folio — violating the demo's zero-fabrication promise. The plan now closes it two ways:
- `onFolio` sets `data.itinerary` **unconditionally** from replay state (`promoted.itinerary`); null → `delete data.itinerary`. The live staging itinerary is never trusted.
- The model-facing `callTool` wrapper in `session-do.ts` strips `itinerary`/`days`/`activities`/`dining`/`includes` from a model `patch_trip` before the live write. Replay's `helpers.patchTrip` calls `mcp.callTool` directly (bypasses the wrapper), so fixture writes still go through.
This is now the **strongest** of the three guards (flights/hotels/itinerary). Tasks A3 + A4 implement it; replay.test.ts covers it.

## Environment gotchas (carry forward)
- **Code-discovery hook blocks the `Read` tool on `.ts`/`.tsx`/`.html`.** View with `cat -n <file>` via Bash; author with `Write`/`Edit`. `.md`/`.json`/`.css` Read fine (retry once if the first call is intercepted).
- Verify from the worktree root: `npx tsc --noEmit`, `npx vitest run` (baseline 15 files / 87 tests), single file e.g. `npx vitest run worker/mcp/replay.test.ts`.
- Build/deploy (Phase D, with Neil): `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy` — the empty `VITE_API_BASE` is mandatory or the bundle bakes localhost.
- Capture script (Phase D Task D1, with Neil): `VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs --only=dublin-oct`

## What NOT to do
- Don't touch `worker/agent/boards.ts`, the `board` SSE event, `BOARDS_WORKFLOW_OVERRIDE`, or the `buildBoard` wiring (claude-skin owns them; everything here is additive).
- Don't add a `kind:"excursion"` board (deferred to sub-project 2 — ping claude-skin owner first).
- Don't change `SYSTEM_HINT` (must stay byte-identical; enrichment is a separate appended constant).
- Don't reskin boards in amber-CRT; stay skin-agnostic.
- Don't deploy or run the capture/golden-recording steps without Neil.
- Don't `git add -A` — stage by name.

## Commits this session (on `demo-enrichment`)
- `2e5d6ff` spec: lock dining → tripadvisor_search
- `bc4aef0` plan: initial implementation plan
- `0dade96` plan: apply codex-review (blocker + 7 fixes)
- (journal entry added in this session is uncommitted — batch it with the first build commit)

## Next session's first action
Read the plan, then invoke `superpowers:subagent-driven-development` and start at **Task A1 (FolioData shape)**. Proceed A1→A5 (Phase A), then B1→B4 (Phase B), then C1→C3 (Phase C), `/codex-review` between tasks, and STOP before Phase D.
