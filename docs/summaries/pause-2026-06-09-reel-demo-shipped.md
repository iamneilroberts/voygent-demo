# Session Pause: Reel Replay Demo — P1 + Inspector/Callout Polish (shipped)
**Date:** 2026-06-09 at 14:10
**Repo:** /home/neil/dev/voygent-demo
**Branch:** main
**Uncommitted changes:** no (untracked: this handoff file + a resume doc + a stale auto-pause; this handoff gets committed below)

## One-line state
The reel ("Watch the demo") replay was rebuilt and is **live in prod** (`demo.voygent.ai`, `origin/main` = `c1554ec`, bundle `index-Tr7XLMwJ.js`). Next session continues with **other demo UI improvements** (Neil will specify). The reel work is DONE unless Neil wants to drop/tune a callout.

## What Was Accomplished (this session)
1. **Reel P1** (intro modal, pacing, callouts, end CTA, registry) — designed (brainstorm + 3 mockups), spec'd, Codex-reviewed plan, built subagent-driven (11 TDD commits), shipped.
   - Spec: `docs/superpowers/specs/2026-06-09-reel-p1-chrome-design.md`
   - Plan: `docs/superpowers/plans/2026-06-09-reel-p1-chrome.md`
2. **Polish round A** — Engineering Inspector: split "tools used" into **distinct tools** (headline) + **N calls** (subline); added `data-stat` hooks to all stat cards; compacted model/view/theme into one control line.
3. **Polish round B** — **anchored callouts**: reel callouts now spotlight their exact target via a fixed-position overlay that dims everything but the target (chosen behavior: "dim everything, spotlight the one"). DOM targeting via `data-stat` (Inspector) / `data-reel-target` (boards, folio sections, tool chips) + a `target` key per highlight (schema `anchor`→`target`).
4. **Polish round C** — **4 more callouts** (now 8 total) + re-fixed the control-line compaction (borderless text links + theme swatches-only, since the first attempt stayed too wide).

## How the reel works now (mental model for next session)
- **Client-only.** No worker/MCP/faithful/secret/D1 changes in any of this. Lives entirely in `web/src/`.
- Default landing is `mode=auto` (`web/src/lib/mode.ts` `DEFAULT_MODE="auto"`) → intro modal gates the reel → "Watch the 2× replay" plays `web/src/recordings/dublin-oct.json` via `replayChat` (`web/src/lib/recording.ts`) with **semantic pacing** (`web/src/lib/pacing.ts`) + a 1×/2× toggle (default 2×) → **8 spotlight callouts** (sidecar track `web/src/recordings/dublin-oct.highlights.json`, matcher resolver `web/src/lib/highlights.ts`, rendered by `web/src/ReelCallout.tsx`) → end bookend → "Try it yourself" into live mode (`?greet=reel`) with the post-reel greeting.
- **Callout = `{ match, target, eyebrow, title, body }`.** `match` (event-matcher) picks the frame (WHEN); `target` is a DOM key (WHAT to spotlight): `board-flight`/`board-hotel` (BoardView), `stat:<key>` (Inspector cards: exposedTools/distinctTools/persistedWrites/contextKeptOut/observedCost/validation), `folio-days`/`folio-includes` (FolioArtifact), `tool-<name>` (ClaudeToolChip). `ReelCallout` measures the target's rect (`getBoundingClientRect`, `scrollIntoView`) and positions a card beside it; `position:fixed` + box-shadow spotlight; CSS custom props inherit from `.product` so tokens resolve.
- The 8 callouts fire at recording frames **9,44,85,135,144,151,155,156** (ascending): real-fares → aggregated-hotels → context-saved(patch) → gaps/excursions → daily-itinerary → value-add → cost → self-correction. Grounding test `web/src/recordings/dublin-oct.highlights.test.ts` asserts all resolve + cost=last summary + ascending order.
- **Reel registry** `web/src/recordings/registry.ts` (`selectReel`, round-robin, `?reel=<id>` override) — ships ONE Dublin reel; adding more = one registry entry + a recording JSON + a highlight track (incremental, no plumbing).

## Decisions Made
- Intro = "calm centered card" (Direction A) BECAUSE lowest-risk, on-brand, replay-primary.
- Pacing = re-derived from event semantics (not captured delays) BECAUSE captured pacing was an artifact of how fast the live capture streamed. "2×" is an honest **speed** label (2× the 1× reading pace), NOT a "half the real session" duration claim.
- Callouts = Treatment 1 (spotlight + dim, auto-resume ~4s + Continue) anchored to the **exact** target BECAUSE the moments ARE the proof (recovery/savings/cost/real-data); region-anchoring put them in the wrong pane.
- Copy voice: **no em-dashes / no over-polished AI cadence** (memory `feedback-demo-copy-voice-no-em-dash`).
- All work isolated in worktrees then rebased+ff-merged onto reconciled main (other sessions were active); deploys are clean supersets of prod.

## Files Created or Modified (key)
| File Path | Action | Description |
|-----------|--------|-------------|
| `web/src/lib/pacing.ts` (+test) | Created | semantic per-event dwell + speed divisor |
| `web/src/lib/highlights.ts` (+test) | Created | Highlight types + event-matcher frame resolver (`target` key) |
| `web/src/recordings/dublin-oct.highlights.json` (+test) | Created | 8-callout sidecar track (grounding-tested) |
| `web/src/recordings/registry.ts` (+test) | Created | reel registry + round-robin `selectReel` |
| `web/src/ReelIntro.tsx` / `ReelCallout.tsx` / `ReelEndCard.tsx` | Created | intro modal / anchored spotlight callout / end bookend |
| `web/src/lib/recording.ts` | Modified | `replayChat` + pacing + speed getter + abort-safe highlight pausing |
| `web/src/App.tsx` | Modified | reel lifecycle (intro→playing→ended), overlays, speed, onHighlight, go-live, chrome-hide-in-reel |
| `web/src/ClaudeChatView.tsx` | Modified | post-reel greeting; `data-reel-target` on folio days/includes |
| `web/src/ClaudeToolChip.tsx` | Modified | `data-reel-target={`tool-${name}`}` |
| `web/src/BoardView.tsx` | Modified | `data-reel-target={`board-${kind}`}` |
| `web/src/Inspector.tsx` | Modified | distinct-tools/calls split + `data-stat` hooks |
| `web/src/skin-claude.css` | Modified | reel overlay/spotlight/callout/intro/end/greeting styles |
| `web/src/styles.css` | Modified | compact `.ins-extra` control line + `.ins-stat-sub` |
| `web/public/mockups/reel-{intro,callouts,cta,inspector}.html` | Created | brainstorming mockups (still hosted at `demo.voygent.ai/mockups/<name>`; harmless) |

## Git State
```
?? docs/Neil_Roberts_FDE_Resume.md
?? docs/summaries/pause-2026-06-09-5ee0b703.md   (stale auto-pause; ignore)
```

## Recent Commits
```
c1554ec docs(journal): coord note — reel + inspector polish deployed (dfbfa67)
dfbfa67 fix(inspector): compact controls to borderless links + theme swatches-only (single line)
2c3cbbe feat(reel): 4 more callouts (hotels, excursions, itinerary, value-add) + folio/tool anchor hooks
86484ff feat(reel): anchored callouts spotlight the target stat/board (fixed overlay + DOM targeting)
b011f2e feat(inspector): split distinct tools vs cumulative calls + data-stat hooks
```

## Remaining Work (next session — "other demo UI improvements")
1. **First:** ask Neil for the specific demo UI improvements he wants next (this is a new, unspecified batch — do not assume).
2. **Established workflow that works well here:** mock visual changes as static HTML in `web/public/mockups/<name>.html` → `VITE_API_BASE="" npm run build:web && npx wrangler deploy` → view at `https://demo.voygent.ai/mockups/<name>` (extensionless). Then implement (subagent-driven worked great), gate (`npx tsc --noEmit && npx vitest run`), build, deploy, push. Smoke needs the passcode in repo `.env` (`DEMO_ACCESS_URL`) — Neil opens it in a browser (no headless Chrome available this env).
3. **If touching the reel:** the only likely follow-up is dropping/tuning a callout (Neil said he "may drop one later") — that's a one-entry edit to `web/src/recordings/dublin-oct.highlights.json`; the grounding test enforces resolution+order.
4. **Worktree/branch hygiene:** other sessions share this clone. Branch before non-trivial work (`/branch <slug>`); rebase onto latest `origin/main` before merging. Two merged refs are deletable: `git branch -d reel-p1 reel-polish`.

## Open Questions
- [ ] Which demo UI improvements next? — Neil to specify (he ended this session intending a fresh one for them).
- [ ] 8 callouts is dense (~1 pause/15s, 4 cluster at the end). Neil may drop one — confirm which when he decides.
- [ ] CSS-only changes (control-line compaction) can't be verified headlessly here — Neil confirms visually after deploy.

## Instructions
Continue from Remaining Work. Confirm git state is unchanged since this handoff (`origin/main` should be `c1554ec` unless another session pushed). Ask Neil what UI improvements to tackle before assuming scope.

## Curator Verification (2026-06-09 14:15)
**Overall trust: HIGH.** 6 of 7 load-bearing claims verified against git/files/live prod; 1 trivial contradiction (self-reference, not real WIP). No LAWS.md in repo (N/A).

| # | Claim | Verdict |
|---|-------|---------|
| 1 | HEAD `c1554ec`, tree clean except untracked docs | **CONTRADICTED (trivial)** — 3 untracked, not 2: this handoff file counts itself now; no hidden WIP, deploy surface unaffected |
| 2 | 8-callout track, each with `target` field; grounding test passes | VERIFIED (8 objects, all `target`; test 3/3) |
| 3 | 331 tests green, tsc clean | VERIFIED (49 files / 331 passed; tsc exit 0) |
| 4 | 6 new files exist (pacing/highlights/registry/Reel*) | VERIFIED |
| 5 | `data-reel-target` hooks (board/folio/tool) + `data-stat` attrs | VERIFIED (all present) |
| 6 | Reel/inspector commits client-only (no worker/wrangler/migrations) | VERIFIED (per-commit `--stat`) |
| 7 | Prod 200 + serves `index-Tr7XLMwJ.js` | VERIFIED |

No CONTRADICTED claim affects deploy safety or the next session's starting assumptions.
