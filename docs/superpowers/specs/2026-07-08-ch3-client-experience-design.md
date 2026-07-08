# Ch3 "Their trip, their window" — client-experience reel chapter (C10-ch3)

**Date:** 2026-07-08 · **Lane:** demo-design worktree · **Status:** approved by Neil (brainstorm 2026-07-08)
**Source items:** C10-ch3 (new chapter), C9 (end on the folio — satisfied for ch3 by construction), C11 (production-look folio — this build creates the shared surface; the FolioArtifact swap is a follow-up step in this lane).

## Decisions (Neil, binding)

1. **POV: client as the main stage.** The viewer watches the Millers' own folio window for the whole chapter; the advisor surface appears only as brief framing/cutaway. (Chose A over split-screen and extended-overlay options.)
2. **Slice: fresh pre-trip story.** Proposal arrives → explore → customize → 2-way update → Final. Does NOT replay ch2's whiskey-walk beat. (Chose B over "same moment, their screen" and during-trip.)
3. **Surface: one new production-faithful component** (`ReelFolioView`), styled to the alaska-warm warm-editorial contract — not an extension of the `ReelClientView` pricing widget, not an iframe of captured production HTML. It becomes the shared folio surface for ch3, reel end-states, and C11's FolioArtifact replacement. (Chose B; borrow from C the discipline of a staging screenshot as the visual contract.)
4. **One surface, two modes (2026-07-08 spec review).** `ReelFolioView` is mode-aware from day one: `scripted` (screenplay-driven, user input disabled — ch3 playback) and `interactive` (the viewer drives the same toggles/picks/live total — end-states, C11). Beats 3/4 already require programmatically drivable state, so interactive mode is the same state machine wired to user events. Consequence: **ReelExplore is eventually retired** in favor of ReelFolioView interactive mode (needs a `ReelClientSession` → `ReelFolioSession` adapter or fixture upgrade for ch1/ch2). That swap is a follow-up in this lane alongside C11 — OUT of the ch3 implementation plan.
5. **Beat 2 scroll fallback (pre-approved, 2026-07-08).** If continuous scripted scrolling proves disproportionately expensive, cutting between anchored sections (folio-hero → folio-day-N → includes) is an acceptable fallback — the implementation plan may take it without another design gate.

## Chapter registration

- `id: "client"`, `chapter: 3`, title **"Chapter 3 · Their trip, their window"**, `durationLabel: "~2 min"`.
- `run` gains `next: "client"` — the A10 CTA chain (ch1 → ch2 → ch3) extends automatically; the intro-card chapter list picks it up with no further work.
- Blurb (intro card): client-POV framing, honest about scripting (see Honesty rules).

## Beat sheet (~2 min at 2×, four beats mirroring ch2's shape)

**Beat 1 — The proposal arrives.** One framing line on the advisor surface ("Sending the Millers their folio"), then full-screen transition to the Millers' window: the folio opens — warm editorial, the Dublin week, Aer Lingus flight, The Dean, day cards, live total. Spotlight: "This is what lands in your client's inbox. No PDF, no attachment — a living page."

**Beat 2 — They explore.** Scripted scroll through the days; day 5 expands; the includes surface (October weather, Leap Card, tipping). The proposal visibly carries optional add-ons the advisor pre-loaded on the day cards ("recommended — add it if it fits"), each with its price. Spotlight: "The advisor sends one recommended plan already packed with options to consider — not a week of back-and-forth emails."

**Beat 3 — They make it theirs.** Julie toggles the Kilmainham Gaol tour on → trip total recalculates live. She flips a second optional add-on (from the same fixture lineage) on, watches the total move, flips it back off — the price is live, not a quote she has to ask for. She leaves a note on day 2: "Mark's ankle — can we keep this day light on walking?" Spotlight: "The client tweaks the trip themselves and sees the price change instantly. They're in control — and the advisor never has to make the upsell call; the folio already made it."

**Beat 4 — The 2-way moment.** "Advisor is updating…" indicator → day 2 visibly changes in their window (EPIC museum swapped for a step-free alternative, one-line advisor reply attached) → folio settles to **Final**. Spotlight: "The advisor's answer lands in the same window — and the trip comes back ready to book. That's the loop." End state: the finished folio itself (no separate end card) with the standard CTA row (next-chapter slot empty until a ch4 exists; "Build your own trip" + replay).

**Positioning spine (anchor for all spotlight copy):** the client self-serving add-ons in the folio replaces the advisor↔client back-and-forth. Three advantages the beats must land, in order: (beat 2/3) the client feels in control; (beat 3) the advisor doesn't have to upsell — the pre-loaded options and live total do it; (beat 4) the advisor gets the trip back ready to book.

## Honesty rules

- Intro note + end blurb follow the ch1/ch2 pattern: "This walk-through is scripted. A real Voygent folio is a live page your clients open, change, and annotate."
- Beat 4 copy stays capability-true: the product ships folio→advisor updates (M7 folio-board→model hint, server-side, shipped 2026-07-06). The demo's animation of the relay is a scripted rendering of that flow; no copy claims the demo itself is live.
- Trip data continuity: same Millers Dublin trip, same prices as ch1/ch2 fixtures (soldFolio lineage). No invented capabilities, no invented prices.

## Build shape

1. **Visual contract first:** screenshot a real alaska-warm folio from staging (`preview_folio` output for a comparable trip) into `docs/reference/` (or the spec dir) before styling. "Looks like production" is checked against that artifact, not memory.
2. **`ReelFolioView`** (new component, `web/src/ReelFolioView.tsx` + styles): full-screen client-folio surface. Data-driven from a new `ReelFolioSession` fixture type (extends folio/pricing shapes in `shared/events` and `lib/reel-pricing`). Carries `data-reel-target` anchors (folio-hero, folio-days, folio-day-N, folio-total, folio-note, folio-status) so `reel-targets.guard.test.ts` covers it by construction. Scriptable states: scroll position/expanded day, addon toggles, note thread, advisor-updating indicator, Draft→Final status. Mode-aware per Decision 4 (`scripted` | `interactive`); ch3 uses `scripted` only, but the state API must not assume a screenplay is the only driver.
3. **`dublin-client.screenplay.ts`**: new screenplay reusing ch2's fixture lineage (soldFolio/finalFolio values) plus per-beat `ReelFolioSession` states. New screenplay DSL verb only if strictly needed (prefer driving via existing `s.client.view`-style events extended for the folio session; exact DSL shape decided in the implementation plan).
4. **Registry entry** + `run.next = "client"` (see Chapter registration).
5. **C11 follow-up (separate step, same lane, after ch3 ships):** swap the curated demo's hand-rolled FolioArtifact (`ClaudeChatView.tsx:97-250`) to render via `ReelFolioView`, retiring the third folio copy. Out of scope for the ch3 implementation plan itself.

## Testing

- Screenplay unit test mirroring `dublin-run.screenplay.test.ts` (frames exist, interaction kinds present, honest framing strings).
- `reel-targets.guard.test.ts` extends automatically via the `data-reel-target` scan.
- Registry tests: chapter 3 registered, `run.next` resolves, CHAPTERS order `[collab, run, client]`, no-param default still ch1.
- Playwright seek-to-end pass (A10 pattern): chapter plays through, ends on the folio surface, ch2's end surface now shows "Watch Chapter 3 …" CTA.

## Out of scope

- C9 for ch1/ch2 (mid-chapter folio pop-ups in the older chapters) — separate item.
- A2 mobile reel scroll, B6 fixtures — separate items.
- Any change to the live/production folio renderer in voygent-lite.
