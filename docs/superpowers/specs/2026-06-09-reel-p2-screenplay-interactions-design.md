# Reel Replay — P2: Screenplay Format + Advisor↔Client Interaction Events — Design

**Date:** 2026-06-09
**Repo:** `~/dev/voygent-demo` (branches off reconciled `main`; P1 shipped at `c1554ec`, deployed to `demo.voygent.ai`)
**Status:** Brainstorm complete; interaction renderings approved by Neil via mockup
(`demo.voygent.ai/mockups/reel-p2-interactions`). → spec review → writing-plans
**Skin:** all P2 UI is **claude-skin native** (`:root[data-skin="claude"]`, `--cl-*` tokens). Adds two actor
accents: **advisor = terracotta** `#c96442` (the existing accent), **client = slate-teal** `#2f7d8c`.

## Goal

Give the reel a vocabulary for **collaboration**. Today the reel is a passive, single-actor replay: the agent
builds a trip while one "user" watches. P2 makes a reel able to depict the real Voygent loop between three
actors — **agent**, **advisor** (the person running Voygent), and **client** (the traveler) — on **one shared
timeline**, and gives us a **humane authoring format** (a typed "screenplay") to write such reels instead of
hand-editing frame arrays.

P2 delivers two halves as **one capability**:
1. **Screenplay format** — a typed TS authoring DSL that compiles down to the existing runtime.
2. **Interaction events + rendering** — four advisor↔client moments (pick, edit, comment, send-to-client),
   each with an on-screen treatment.

This sub-project **absorbs what was previously scoped as P3** (the interaction surfaces). P3 dissolves. The
remaining sub-project is **P4** — authoring the full multi-act Dublin screenplay using this format. P2 ships
**one short proof screenplay** exercising all four interactions; it does not re-author Dublin.

## Context (verified against the codebase)

- **Runtime is client-side replay.** `Recording = { skin:"claude"; trip:string; frames:Frame[] }`
  (`web/src/lib/recording.ts`). `Frame = {delayMs,kind:"user",text} | {delayMs,kind:"event",event:ServerEvent}
  | {delayMs,kind:"turn-end"}`. `replayChat(rec, handlers, opts)` walks frames, applying each `event` through
  the **shared `applyEvent` reducer** the live app uses; `opts` already carries `{ pacing via computeDelay,
  speed, highlights, signal }` and an `onHighlight` paused callback.
- **Events** are the `ServerEvent` union in `shared/events.ts`: `text | tool | folio | board | turn-complete |
  error | inspector`. `BoardCandidate.id` is always a **real fixture candidate id** (e.g. `serp:70wngy`), so a
  pick references something the live `promote_*` guard would accept.
- **Highlights** (`web/src/lib/highlights.ts`): a sidecar `Highlight = { match, target, eyebrow, title, body,
  dwellMs? }`. `match` (event-matcher) pins to a frame; `target` is a DOM key resolved by `ReelCallout`
  (`web/src/ReelCallout.tsx` `findTarget`): `stat:<key>` → `[data-stat]`, else `[data-reel-target]`.
  `ReelCallout` does `scrollIntoView` + `getBoundingClientRect`, spotlights the target (or centers a fallback
  card), and **auto-resumes after `dwellMs`** with a **"Continue ▶"** button. Reduced-motion = instant.
- **Registry** (`web/src/recordings/registry.ts`): `ReelEntry = { id, title, blurb, durationLabel, recording,
  highlights }`; `REELS[]`; `selectReel(search)` does `?reel=<id>` override else round-robin via `localStorage`
  (`voygent-demo-reel-rot`). Adding a reel = one entry. Ships one Dublin reel today.
- **Orchestration:** `web/src/App.tsx` runs the reel in `mode === "auto"` (claude skin forced), drives the
  intro modal → playback → end bookend, and renders `ReelCallout` on `onHighlight`. The welcome/greeting lives
  in `web/src/ClaudeChatView.tsx`. Reel-targetable elements already tag themselves with `data-reel-target`
  (boards, folio sections, tool chips) and `data-stat` (Inspector cards).
- **No worker / MCP / faithful path is involved in any reel work** — P1 changed none of it, and **P2 changes
  none of it**. The "client" is a simulated persona rendered client-side; there is no real email or backend.

## Architecture: screenplay compiles to the proven runtime

```
screenplay(meta, s => { ...beats... })            ← authoring DSL (web/src/lib/screenplay.ts)
        │  compile (pure, build/load time)
        ▼
{ recording: Recording, highlights: HighlightTrack }   ← interaction frames live INSIDE recording.frames
        │  registered as a ReelEntry (registry.ts) — existing { recording, highlights } shape, UNCHANGED
        ▼
replayChat(recording, handlers, { pacing, speed, highlights, signal })   ← opts shape unchanged
        │  frame loop (existing kinds unchanged)
        ├─ kind:"event"        → handlers.applyEvent       (shared reducer; real ServerEvents)
        ├─ kind:"interaction"  → handlers.applyInteraction  (NEW reel-only handler; view-state)
        │      └─ component scrolls focal to center → flash → pacing dwell-floor → (optional spotlight)
        └─ kind:"user"/"turn-end" → unchanged
```

The screenplay is an **authoring layer**, not a new runtime. It lowers to the existing `Recording` (with
interaction frames inline in `frames[]`) plus the existing highlights sidecar, so the P1 player, pacing, speed
control, spotlight, **registry, and rotation consume it unchanged** — `ReelEntry` keeps its current
`{ recording, highlights }` shape. The live `ServerEvent` union and the worker contract are **untouched** —
interactions are a **reel-only `Frame` kind** carried in `recording.frames`, never a `ServerEvent`. The only
runtime additions are the new `Frame` kind, one new `ReplayHandlers.applyInteraction` handler, and per-kind
pacing dwell floors.

### Actor attribution

Add an optional `actor?: "agent" | "advisor" | "client"` to the frames that carry one. Legacy `user` frames
default to `advisor`; assistant prose is `agent`. Attribution renders as a **solid filled tag** (advisor
terracotta, client slate-teal) plus the focal flash in the actor color, so who-did-what reads at replay speed
without a caption (Neil's note: subtle tints were too weak; bolder boxes + motion fix it).

### New frame kind + interaction reducer

Extend the `Frame` union with a **reel-only** kind:

```ts
type ReelInteraction =
  | { kind:"pick";    actor:Actor; boardId:string; candidateId:string; echo:string }
  | { kind:"edit";    actor:Actor; path:string; was:string; now:string; tag:string }
  | { kind:"comment"; actor:Actor; anchor:string; text:string; threadId:string }
  | { kind:"handoff"; actor:Actor; channel:"email"; subject:string; reply?:string };

type Frame = /* existing three */ | { delayMs:number; kind:"interaction"; actor:Actor; interaction:ReelInteraction };
```

A new **`ReplayHandlers.applyInteraction(i, actor)`** handler (backed by a pure reducer over **reel view-state**:
selected candidate, folio edit markers, comment threads, sent/routed-back state) is bound in `App.tsx` alongside
the existing `applyEvent`. The interaction component scrolls itself to center and plays its actor-colored flash
on render; the **pacing dwell floor** holds the beat before the loop advances. The existing `applyEvent` keeps
owning real `ServerEvent`s. A compound DSL call lowers to a **small sequence** the compiler emits — e.g.
`client.picks(...)` → an `interaction(pick)` frame (renders the attributed selection + selected board state)
**then** the existing `folio` event frame (the agent writes it in). Authors think in intent; the compiler owns
the expansion.

### The authoring DSL (`web/src/lib/screenplay.ts`)

```ts
export default screenplay({ trip:"Dublin · Oct", skin:"claude" }, (s) => {
  s.advisor.says("Plan a week in Dublin in October, two people, mid-range.");
  s.agent.tool("flight_search", { summary:"MOB→DUB · Oct 4–11" });
  s.agent.board("flight", flightCandidates);
  s.client.picks("flight", "serp:70wngy");                 // → interaction(pick) + folio event
  s.agent.folio(draftFolio);
  s.advisor.edits("days[2].activities[0]", { was:"Free morning in Temple Bar", now:"Cliffs of Moher day trip" });
  s.advisor.sendsToClient({ subject:"Your Dublin trip is ready to review" });
  s.client.comments("days[5]", "Can we add a food tour this day?");          // Gmail reply routed back
  s.advisor.comments("days[5]", "Done, added the Temple Bar tasting.");
  s.agent.folio(finalFolio);
  s.spotlight("client-pick", { target:"board-flight", title:"…", body:"…" }); // optional P1 callout, inline
});
```

`screenplay()` returns `{ recording, highlights }` (interaction beats compiled inline into `recording.frames`).
Builder helpers are typed against the existing `BoardCandidate` / `FolioData` shapes so candidate ids and folio
paths are checked at author time.

## Interaction renderings (approved via mockup)

Reference: `web/public/mockups/reel-p2-interactions.html`. All four render **inline on the shared chat/folio
views**, reusing existing components where possible, with a **bolder + animated** treatment.

1. **Pick** — the chosen `BoardView` candidate gets an actor-colored **selected state** (ring pulse) and a solid
   "✓ Client chose this" pill replacing the price; an attributed chip pops in below echoing the pick; the agent
   confirms in prose. Advisor picks identical in terracotta. (Reuses `BoardView`; adds selected-state styling.)
2. **Edit** — the changed folio line shows **before→after** (struck old value, new value **flashes** the actor
   color then settles into a quiet highlight) with an "Advisor edited" tag on the day. (Reuses `FolioArtifact`.)
3. **Comment** — a **collapsible** thread: a collapsed pin with a count badge that **pulses** when a comment
   lands; in the reel it **auto-expands for the dwell, then collapses** so the folio stays clean. Avatars colored
   per actor; client question → advisor reply.
4. **Send to client + reply routed back** — a **Gmail-style notification** (no email body): notif 1 = trip sent
   (client notified by email), notif 2 = client replied, then an explicit **"client's note → routed back to the
   agent"** chip, and the agent picks it up in prose. A brief **"viewing as client" ribbon** may flip the frame.
   Conveys the email channel **and** the round-trip into the LLM. Fully simulated client-side.

### Motion + attribution language

- Entrance animations (`flashIn` ~1.1s, `ringPulse` ~1.4s, `popIn` ~0.45s) fire when the beat lands; the focal
  item is **scrolled to center first** so it is never off-screen.
- `prefers-reduced-motion` collapses the flash to an instant state change but **keeps the dwell**.

## Pacing, spotlight, end-card integration

- **Dwell floors** per interaction kind in `web/src/lib/pacing.ts` (new constants, tuned in a short calibration
  pass like P1). Proposed starting values from the mockup: **pick 3.5s, edit 3.2s, comment 4.2s, send 5.2s** —
  each = flash duration + a read buffer. `speed` still divides the base; `reducedMotion` keeps the dwell.
- The player **scrolls the focal element to center** before firing (reusing `ReelCallout`'s
  `scrollIntoView`/`getBoundingClientRect`), directly fixing the "beat off-screen" problem.
- Interactions are **valid spotlight targets**: a P1 callout can fire on a pick/edit/comment, reusing existing
  `target` keys (`board-flight`, `folio-days`, …) plus **new** `data-reel-target` hooks for the comment pin and
  the Gmail notification. Same **auto-resume + "Continue ▶"** affordance.
- The **end-card recap** (P1 C4) grows interaction chips ("client picked", "client commented") reflecting what
  the current reel actually shows.

## Copy voice

All crafted strings: **no em-dashes, plain cadence** (memory `feedback-demo-copy-voice-no-em-dash`).

## Testing (logic over DOM, matching the repo convention)

- `web/src/lib/screenplay.test.ts` (new): DSL → `{recording, highlights}` with interaction frames inline; actor
  attribution correct; compound calls expand correctly (`client.picks` → `interaction(pick)` then `folio` event);
  picks reference **real fixture candidate ids**.
- `applyInteraction` tests: pick sets selected candidate; edit yields before→after marker; comment appends to
  thread; handoff sets sent + routed-back state. Pure-function over view-state.
- `pacing.test.ts` (extend): per-kind interaction dwell floors; reduced-motion keeps dwell, drops flash; speed
  scaling.
- Grounding test for the new collab reel (mirrors `dublin-oct.highlights.test.ts`): screenplay compiles, every
  interaction + callout resolves, ascending order, end-state folio matches expected.
- Regression: existing Dublin JSON reel drives the reducer to the **same** end-state; default `/` (board skin,
  no auto) byte-identical; `npx tsc --noEmit` clean; full `npx vitest run` green.

## Internal phasing (one spec, one plan; each step independently shippable)

- **P2.1 — spine:** `screenplay.ts` DSL + compiler + `interaction` frame kind + `actor` attribution +
  `applyInteraction` skeleton + registry wiring. Reachable via `?reel=collab` only; not yet in rotation.
- **P2.2 — pick + edit:** render the two folio/board-native interactions (reuse `BoardView` / `FolioArtifact`).
- **P2.3 — comment + send:** collapsible comment thread; Gmail-notification send + "routed back to agent" chip +
  "viewing as client" ribbon.
- **P2.4 — integration + content:** pacing dwell floors, spotlight targets, end-card recap chips; author the one
  short collaboration screenplay exercising all four interactions; register it into rotation.

## Decisions locked

- Architecture = **screenplay DSL compiles to the existing `Recording` + sidecar tracks** (Approach A);
  interactions are a **reel-only `Frame` kind**, the live `ServerEvent` union and worker contract untouched.
- Cast = **three actors (agent, advisor, client) on one shared, attributed timeline.**
- Interactions in scope = **pick, edit, comment, send-to-client** — all four.
- Attribution = **solid filled actor tags + actor-colored focal flash/pulse** (advisor terracotta, client
  slate-teal); subtle tints rejected as too weak for replay speed.
- Comment thread = **collapsible** (auto-expands for the dwell, then collapses).
- Send-to-client = **Gmail-style notification** (no email body), showing **client notified + reply routed back
  to the agent**. Client is **simulated client-side**; no backend.
- Pacing = **per-kind dwell floors** + **scroll-focal-to-center** before the flash; reduced-motion keeps dwell.
- P3 **dissolves into P2**; P4 (full multi-act Dublin screenplay) stays separate; P2 ships **one proof reel**.
- All P2 work is **client-only, claude-skin native**; worker / MCP / faithful / fixtures / access-control
  untouched.

## Soft defaults (set at wire/calibration time, not guessed in the plan)

- Exact dwell-floor constants per interaction kind (calibration pass against the authored collab reel).
- Final copy for the proof screenplay's beats and callouts (authored in P2.4).
- Whether the "viewing as client" ribbon is always-on for client beats or only across the send handoff.

## Out of scope (P2)

- Re-authoring or re-capturing the Dublin recording content (**P4** — the full multi-act screenplay).
- Any real email, real client account, or backend — the client persona is simulated client-side.
- Worker, MCP, faithful-mode, fixtures, access-control changes.
- A general visual screenplay editor / GUI — authoring is the typed TS DSL.
