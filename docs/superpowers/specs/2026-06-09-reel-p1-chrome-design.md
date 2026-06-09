# Reel Replay — P1: Intro, Pacing, Highlight Callouts, End CTA — Design

**Date:** 2026-06-09
**Repo:** `~/dev/voygent-demo` (HEAD `aa64078`, in sync with `origin/main`)
**Status:** Brainstorm complete; mockups approved by Neil (intro A, T1 callouts, end CTA + greeting). → spec review → writing-plans
**Skin:** all P1 UI is **claude-skin native** (`:root[data-skin="claude"]`, `--cl-*` tokens, `cl-*` classes). No amber-CRT reskin except one optional small `2×` flip accent (dropped per Neil's "may fall back to subdued").

## Goal

Turn the existing "▶ Watch the demo" reel from a bare autoplay into a **framed, watchable, self-explaining
marketing experience**: pause before it starts and let the visitor choose; play at a readable pace with a
viewer speed control; spotlight the engineered moments (recovery, context/token savings, cost, real supplier
data) by pausing and explaining them; and end with a prominent "Try it yourself" that drops the visitor into
live mode with a helpful greeting.

This is **sub-project P1** of a larger reel effort. P1 deliberately drifts from strict faithfulness for a more
compelling demo while staying grounded in how Voygent actually works, and it works on the **existing Dublin
recording with no recording-format change**. Deferred to later sub-projects (own specs):
- **P2** — screenplay format + advisor↔client interaction events (choices, annotations/edits, comments).
- **P3** — new simulated surfaces (advisor folio-board inline edit, threaded comments, Gmail popup, "Send to client").
- **P4** — author the full multi-act Dublin screenplay using P1–P3.

## Context (verified against the codebase)

- The reel is **client-side replay** of `web/src/recordings/dublin-oct.json` via `replayChat()`
  (`web/src/lib/recording.ts`). Frames are delta-timed: `{delayMs, kind:"user"|"event"|"turn-end"}`; events are
  the shared `ServerEvent` union (`text`, `tool`, `board`, `folio`, `inspector`, `turn-complete`) fed through
  the same `applyEvent` reducer the live app uses.
- Pacing today is **whatever the live capture happened to be**: `await wait(delayMs * scale)` with
  `scale = reducedMotion ? 0.2 : 1` (`recording.ts:39`). No real speed concept. This is the "too fast for 2×" cause.
- Reel runs in `mode === "auto"` (`web/src/App.tsx:115-129`), claude skin forced. Toggle button: "▶ watch the
  demo" / "● build your own" (`App.tsx:255-265`). The existing welcome screen ("✳ Where to next?" + preset
  trip buttons) lives in `ClaudeChatView.tsx:128-146`.
- Search results during a reel are server-side fixtures (`worker/mcp/replay.ts`); **P1 changes none of the
  worker, MCP, or faithful path** — it is purely the web player + client UI.
- Mode axis persistence: `web/src/lib/mode.ts`.

## Components

P1 is five client-only components (C1–C5). They share the reel player and the claude-skin chrome; none touch the worker.

### C1 — Intro modal (Direction A: calm centered card)

A claude-skin modal shown at the **start of reel mode, before the first frame plays** ("pause before launching
into the demo"). Centered card over a dimmed chat backdrop:
- Eyebrow "▶ Watch a real session"; heading "See Voygent plan a real trip"; one honest line.
- Primary button **"▶ Watch the 2× replay"** (meta: "Dublin · Oct · ~2 min") → dismiss, begin playback.
- Secondary button **"Plan your own trip instead"** (meta: "live · type anything") → switch to live mode
  (`mode.ts` → "live"), no playback.
- Dismiss/choice may be remembered for the session (soft; not required).

**Landing (confirmed 2026-06-09):** the intro modal is **reel-entry-only** — it appears when reel mode is
entered, NOT on first visit. The public default landing stays **faithful live** (unchanged).

Mockup: `https://demo.voygent.ai/mockups/reel-intro` (Direction A).

### C2 — Pacing: semantic re-timing + viewer speed control

Stop trusting raw captured `delayMs` for pacing. New module `web/src/lib/pacing.ts`:
`computeDelay(frame, prev, ctx) → ms` derives a **readable** delay from event semantics, then a speed multiplier
divides it. Rules (tunable constants, set during a calibration pass):
- **text delta** → typing cadence (~ chars × msPerChar, with min/max clamp) rather than the captured token rate.
- **board appears** → floor dwell (~2.5s) so the options are readable before the next beat.
- **folio update** → floor dwell so the growing itinerary is visible.
- **tool start→done dead air** → cap (~1.5s) so long real latencies don't stall the reel.
- **user turn** → small pre-beat so a new question registers.
- `reducedMotion` collapses all dwells to a small floor (keeps the existing accessibility behavior).

**Speed control:** a small `1× / 2×` toggle in the player chrome, **default 2×**. `final = base / speed`.
"2×" is calibrated so total runtime ≈ **half the real session's wall-clock** (honest "2×" label, matches Neil's
honesty thesis). `replayChat` is modified to take `{ pacing, speed }` and replace the raw `delayMs * scale`.

### C3 — Highlight callouts (Treatment 1: spotlight + anchored card, auto-resume)

A **sidecar highlight track** keyed to the existing recording (no recording-format change): e.g.
`web/src/recordings/dublin-oct.highlights.json`, an ordered list of
`{ marker, kind, anchor, eyebrow, title, body, dwellMs? }` where `marker` pins to a frame (index or a stable
event match) and `anchor` names where the card points (`"chat"`, `"board"`, or a tagged element).

When playback reaches a marked frame: **freeze the reel**, dim everything except the beat (spotlight ring),
render an anchored callout card (eyebrow + plain-language title + 1–2 sentence body), then **auto-resume after
`dwellMs` (default ~4s)** with a **"Continue ▶"** affordance to skip the wait. New component(s): `ReelCallout`
+ a spotlight overlay. Anchoring locates the just-rendered target (chip / board / inspector row) via data
attributes the overlay queries.

**Spotlighted moments (4):**
1. **Auto-recovery** (anchor: chat) — a supplier timed out; the agent retried another source, trip intact, no error shown.
2. **Context / token saved** (anchor: board) — cached catalog/context reused instead of resent.
3. **Cost** (anchor: board) — running spend stays tiny.
4. **Real supplier data** (anchor: chat/folio) — fires on a flight promotion: the option written to the folio is real fixture-grounded supplier data, not invented.

Mockup: `https://demo.voygent.ai/mockups/reel-callouts` (Treatment 1).

### C5 — Reel registry + rotation (multi-reel ready)

Neil plans to build **several reels** that each highlight a different aspect of Voygent and **rotate** which
one is offered. P1 makes the player **registry-driven** instead of importing one hardcoded recording:
- `web/src/recordings/registry.ts` — a list of reel entries: `{ id, title, blurb, recording, highlights }`
  (each pairs a recording JSON with its sidecar highlight track + display metadata).
- A **rotation selector** picks which reel is active when reel mode is entered: round-robin across visits
  (persisted counter in `mode.ts`/localStorage) by default, with `?reel=<id>` to force a specific one for
  sharing/QA. (Round-robin chosen over random so QA/demos are reproducible; swappable.)
- The intro card (C1), player (C2/C3), and end bookend (C4) all read from the **selected reel entry**, not a
  global import. `App.tsx`'s `dublinRecording` import is replaced by `selectReel()`.

**P1 ships with the single existing Dublin reel** registered. **Authoring additional reels is incremental
content follow-on** (each = one capture/author pass + a registry entry + a highlight track), not blocked by P1.

### C4 — End CTA (bookend) + live-mode greeting

On reel completion (`replayChat` resolves), show an **end bookend card** (claude-skin modal mirroring C1):
- Eyebrow "✓ That was a real session"; heading "Now it's your turn"; honest recap chips reflecting **what the
  current reel actually shows** (live flights, live hotels, auto-recovered, context cached, total cost). Recap
  chips grow when P4's advisor/client acts land.
- Primary **"Try it yourself →"** → live mode. Secondary **"↺ Replay the demo"** → restart playback.

Entering live mode renders a **live greeting**: a **crafted static opener** as the assistant's first message
(not a model turn — reliable, $0), three example-prompt chips that send real prompts, the geo line reusing the
existing detection, and the ribbon flips to **"Live · you're driving now · real model, real supplier data"** so
the mode switch is unmistakable. Reuses/extends the existing welcome screen (`ClaudeChatView.tsx:128-146`).

Mockup: `https://demo.voygent.ai/mockups/reel-cta`.

## Copy voice (applies to all C1–C4 strings)

Avoid em-dashes (or use sparingly) and the over-polished "authored-by-AI" cadence; prefer plain sentences.
(Memory: `feedback-demo-copy-voice-no-em-dash`.) Approved greeting/ribbon copy:
- Ribbon: `Live · you're driving now · real model, real supplier data`
- Greeting: "You're driving now. Tell me where you'd like to go and roughly when, and I'll pull real flights and
  hotels and build it the way you just watched. A rough idea is plenty; I'll ask if I need anything else."

## Architecture / data flow

```
mode=auto (reel) ─► C5 selectReel() (round-robin, or ?reel=<id>) ─► { recording, highlights, meta }
  └─ C1 intro modal ──[Watch]──► begin playback        ──[Plan your own]──► mode=live (no playback)
                                   │
        replayChat(recording, { applyEvent, pushUser, setBusy }, { pacing, speed, highlights, signal })
                                   │  C2: computeDelay(frame) / speed  ► paced frames ► applyEvent ► items/folio/inspector
                                   │  C3: at marked frame ► freeze ► spotlight + ReelCallout ► auto-resume(dwell)
                                   ▼
        replayChat resolves ─► C4 end bookend ──[Try it]──► mode=live + crafted greeting (ribbon: "Live · you're driving now")
                                              └─[Replay]──► restart playback
```

Only contact points with existing code: `replayChat` signature (+`pacing`,`speed`,`highlights`), the
`applyEvent` reducer (unchanged), `App.tsx` mode orchestration, `mode.ts`, and the claude-skin welcome screen.
No worker / MCP / faithful changes.

## Testing

- `web/src/lib/pacing.test.ts` (new): `computeDelay` per event type — typing cadence clamp, board/folio dwell
  floors, tool dead-air cap, speed scaling (2× ≈ half of 1×), reducedMotion collapse.
- `web/src/lib/recording.test.ts` (extend): highlight-track schema; a tiny replay with a marked frame
  pauses then resumes after dwell and reaches the same end-state (logic-level, no DOM stack added).
- State-transition tests: intro "Plan your own" → mode=live; end "Try it yourself" → mode=live + greeting
  present; "Replay" restarts. (Logic over the mode/setters, matching the repo's "test logic not DOM" convention.)
- Regression: existing reel still drives the reducer to the same `items`/`folio` end-state; default `/`
  (board skin, no auto) byte-identical; `npx tsc --noEmit` clean; full `npx vitest run` green.

## Decisions locked

- Intro = **Direction A** (calm centered card; replay primary, "plan your own" secondary).
- Pacing = **semantic re-timing** (`pacing.ts`) + **viewer 1×/2× control**, default **2×** ≈ half real wall-clock.
- Callouts = **Treatment 1** (spotlight + anchored card), **auto-resume ~4s** with a "Continue" skip; authored as
  a **sidecar highlight track** (no recording-format change). Moments: recovery · context-saved · cost · real-supplier-data-on-promotion.
- End = **bookend card** (honest recap of current reel) → **live mode** + **crafted static greeting** + ribbon flip.
- Copy: **no em-dashes / plain cadence** across all crafted strings.
- Intro is **reel-entry-only**; faithful-live stays the public default landing.
- Player is **registry-driven** with **round-robin rotation** (`?reel=<id>` override); P1 ships one Dublin reel,
  more reels are incremental content follow-on.
- All P1 work is **client-only, claude-skin native**; worker/MCP/faithful untouched.

## Soft defaults (set at wire/calibration time, not guessed in the plan)

- Exact pacing constants (msPerChar, dwell floors, dead-air cap) — set in a short calibration pass against the
  real recording.

## Out of scope (P1)

- Any recording-format / screenplay schema change (P2).
- Advisor↔client interaction content, annotations/edits, comments, Gmail popup, "Send to client" (P2–P4).
- Re-capturing or re-authoring the Dublin recording content (P4).
- Worker, MCP, faithful-mode, fixtures, access-control changes.
