---
title: Rebuild demo so cueframe can update a reel from guidance
slug: rebuild-demo-cueframe-guided-reel
type: feature
priority: next
milestone: none
issue: https://github.com/iamneilroberts/voygent-demo/issues/10
status: open
created: 2026-06-16
updated: 2026-06-16
---

## Problem / motivation
Rebuild the demo. As part of that, give **cueframe** the ability to update an
existing reel from some **guidance** — point it at a reel (`spec.json`) plus a bit
of direction and have it revise the reel, rather than only building one from
scratch. Today cueframe can capture-from-scratch and edit individual callouts, but
there is no "here's a reel + here's what to change, give me a revised reel" verb.

This idea sits one layer above the in-flight cueframe→demo work: the
[live-reel-anchors spec](#prior-art) wants the demo reel to *be* a real cueframe
recording; this idea asks that, once cueframe can record the demo at all, it can
also **revise** that recording from guidance instead of re-shooting.

## Context for a fresh picker-upper

### What "the demo" is
`~/dev/voygent-demo` → public site at `demo.voygent.ai`. Cloudflare Worker + React
SPA (`web/`) that plays a scripted "reel" of a Voygent advisor/traveller/AI session
building a Dublin trip. Build/deploy: `npm run build:web && npx wrangler deploy`.
D1 backs the (just-shipped, dark) `/showcase` comments page.

**Important:** the current demo does **not** use cueframe's format. It uses a
bespoke in-house system:
- `web/src/recordings/dublin-collab.screenplay.ts` — TS screenplay DSL (`s.agent.says()` …)
- `web/src/lib/screenplay.ts` → compiles DSL to `Recording` + `Highlight[]`
- `web/src/lib/recorder.ts` / `lib/recording.ts` — event-replay engine
- `web/src/ReelCallout.tsx` — resolves `data-reel-target="<key>"` anchors
- `web/src/recordings/registry.ts` — `REELS[]` selects which recording plays

So "rebuild the demo on cueframe" means migrating/replacing this whole subsystem
with a cueframe `spec.json`-aware player. That is a real rework of `web/src/`, not
just a cueframe change. Scope this explicitly (see Open questions).

### What cueframe is + the reel data model
`~/dev/cueframe` — standalone conversational demo creator. Three acts over one
artifact, `spec.json`: **Capture** (Playwright drives a web app, emits frames) →
**Author** (edit callouts from plain English) → **Play/Export** (HTML/MP4/GIF).

Reel shape (`~/dev/cueframe/src/spec/types.ts`):
```
Spec { meta:{title,app,viewport,voice?}, frames: FrameRecord[], callouts: Callout[] }
FrameRecord { id, n, kind:"golden"|"raw", img, caption, axDigest, boxes[], action? }
Callout    { frame, anchor?:{selector?,rect?}, title, eyebrow?, body?, dwellMs?, style? }
```
Storage: `spec.json` + `frames/*.png` in a local dir. No DB, no cloud. One spec =
one recorded workflow.

### Current cueframe create/edit flow (the building blocks)
- **Create (capture-only):** `cli.ts:cmdCapture()` → `capture/capture.ts:capture()`
  (~line 180). Always `chromium.launch()` fresh + anonymous (~line 190).
- **Edit callouts (immutable, re-validated):** `callout/edit.ts` —
  `addCallout()`, `editCallout()`, `removeCallout()`, `reanchorCallout()`,
  `retimeCallout()`, `moveCalloutToFrame()`.
- **Resolvers (deterministic core):** `callout/resolve.ts` — `resolveFrame()`,
  `resolveAnchor()` (NL phrase → box via IDF token scoring), `draftCopy()`. These
  are pure/heuristic library functions with no model call of their own.
- **The intelligence is agent-driven, NOT absent.** Cueframe's conversational acts
  are **Claude Code plugin skills** (`plugin/skills/capture`, `plugin/skills/callout`)
  run on the **local AI LLM**; the agent interprets natural language and calls the
  deterministic core libs above (GOAL.md:13, README:67). So an "LLM that reads
  guidance" already exists — it's the agent host, not embedded HTTP infra. The
  `src/` core stays deterministic and is what the agent orchestrates.
- **No "revise from guidance" verb exists** — only per-callout edits or fresh
  re-capture. BUT the mission already names this: README:18 = *"a demo you can
  re-generate from a description instead of re-recording from scratch,"* and
  GOAL.md:70 carries `meta.notes` = "freeform house-voice guidance." This idea
  extends that, it doesn't invent it.

### What "update a reel from guidance" would touch (in cueframe)
1. **`src/cli.ts`** — new `revise` verb (or `--guidance` flag) = the entry point.
2. **`callout/resolve.ts` + a NEW orchestrator file** — interpret a multi-step
   guidance prompt ("tighten pacing", "replace 2nd callout with the hotel
   shortlist") and dispatch to existing `edit.ts` ops. This orchestrator is the
   main new code. `AddAssistedArgs` (frameRef/targetPhrase/titleHint) already gives
   the NL-assisted add path — half the feature.
3. **`plugin/commands/`** — a higher-level "revise the whole reel" skill (reads
   full spec, interprets guidance, emits revised spec).
4. **`capture/capture.ts:~190`** — ONLY if guidance includes re-shooting frames
   (vs. revising callouts only). Re-capture against claude.ai is blocked (see
   risks); against standalone apps it's simpler.

<a id="prior-art"></a>
### Prior art (read these first)
- `docs/superpowers/specs/2026-06-13-cueframe-live-reel-anchors.md` — plan to
  replace the scripted reel with a real cueframe recording of a live claude.ai +
  folio-board session; maps screenplay beats to `data-cf-anchor` DOM anchors;
  calls for 3 stitched recordings.
- `docs/superpowers/specs/2026-06-14-cueframe-iframe-spike.md` — **blocker spike.**
  Cueframe can't record claude.ai today: (1) no CDP-attach/auth
  (`capture.ts:190` launches fresh+anonymous), (2) no iframe support
  (`digest.ts:~192` top-document `page.locator()` only). Specifies the fix
  locations (Phase 1 CDP-attach at `capture.ts:190`; Phase 2 frame-aware
  `collectBoxes()` at `digest.ts:192-203`). **Neither phase is implemented.**
- `docs/summaries/handoff-2026-06-16-showcase-go-live.md` — orthogonal (the dark
  `/showcase` page) but warns the main clone is stale at `b556180` and to start
  new work from a fresh worktree off `origin/main`.

## Rough approach (proposed, not decided)
Likely sequencing — confirm during brainstorming:
1. **Decide what "guidance" is** (Open Q1) — this gates everything.
2. Build the `revise` flow as a **new agent-driven plugin skill** (sibling to the
   existing `capture`/`callout` skills): read the full spec, interpret a multi-step
   guidance prompt on the local AI LLM, and dispatch to the deterministic
   `callout/edit.ts` ops. The model layer already exists (the agent host); the new
   work is the skill + orchestration + a `revise` CLI verb that exposes the same
   library path non-conversationally.
3. Wire the demo: either keep the bespoke `web/src/` player and treat cueframe as
   an authoring tool that exports to it, OR rebuild the player on `spec.json`
   (bigger). Decide scope (Open Q4).
4. The capture/iframe blockers (iframe spike Phases 1–2) are pre-work IF the
   rebuilt demo records real claude.ai. If the demo records standalone apps or
   reuses existing frames, that pre-work may not block this idea.

## Open questions
1. **What form does "guidance" take?** Free-form NL (interpreted by the
   agent/local AI LLM that already drives cueframe's skills), structured edit
   instructions, or both? — gates the whole design. Note the model layer already
   exists; this is about the prompt/skill contract, not new inference infra.
2. **Update in place or new version?** cueframe edits are immutable (return new
   Spec); workflow could overwrite `spec.json` or emit `spec-v2.json`.
3. **Does guidance ever re-shoot frames,** or only revise callouts/pacing on
   existing frames? Re-shoot pulls in the unbuilt CDP-attach + iframe work.
4. **How coupled is "rebuild the demo" to the cueframe change?** Is the demo being
   rebuilt *on* cueframe's `spec.json` (big `web/src/` rework), or does cueframe
   stay an authoring tool that exports into the existing bespoke player?
5. **Stitched multi-spec reels:** the anchor spec wants 3 stitched recordings;
   cueframe has no stitch primitive. Does "revise from guidance" operate on one
   spec or a stitched set? (design gap)

## Risks / unknowns
- **CDP-attach + iframe support in cueframe is NOT built** (iframe spike Phases
  1–2 open). Blocks any rebuild that records real claude.ai/folio. Recon script
  from the spike was never run — unknown if Playwright can even reach the folio
  iframe across claude.ai's sandbox.
- ~~cueframe has no LLM layer~~ **(corrected)** — cueframe's conversational acts
  are agent-driven Claude Code skills on the **local AI LLM**; the model layer
  exists. The `src/` resolvers are deterministic on purpose. Guided revise is a new
  *skill + orchestration*, not new inference infra.
- **Demo isn't on cueframe's format yet** — current reel is the bespoke screenplay
  DSL; "rebuild" may mean replacing `ReelCallout.tsx`, `lib/recording.ts`,
  `lib/reel-render.ts`, `recordings/registry.ts`.
- **Stale main clone** (`b556180`) — start from a fresh worktree off `origin/main`.
- **`extras-section` anchor (`[data-tg-includes]`)** may only exist on a
  `voygent-lite` branch, not main — confirm before anchoring that beat.

## Notes
Captured via /idea from voygent-lite (cross-repo). Lives in voygent-demo because
the demo rebuild is the home initiative; the cueframe change is the mechanism.
Context gathered 2026-06-16 across `~/dev/voygent-demo` + `~/dev/cueframe`.
To start work: fresh worktree off `origin/main`, then resolve Open Q1 + Q4 before
writing code (likely a brainstorming pass — the design space is wide).
