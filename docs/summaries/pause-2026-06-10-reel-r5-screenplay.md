# Session Handoff: Reel rewrite — R1–R4 shipped, resume at R5 (the screenplay)

**Date:** 2026-06-10 ~10:00
**Repo:** /home/neil/dev/voygent-demo
**Branch:** `main` (`origin/main` = `b876ef1`), clean + pushed
**For:** a fresh session to build **R5**, the final phase of the reel-sequence rewrite.

## One-line state
A 5-phase rewrite of the demo's "collab" reel (Neil-approved) is **4/5 done and deployed**.
R1–R4 built the cast/terminology + every new capability; **R5 is the only thing left**:
author Neil's full ~30-beat screenplay that wires it all together and makes R2 + R4
**visible**. R5 is content-authoring on a finished foundation — no new infra.

## The plan (R1–R5) and status
- **R1 ✅** Terminology purge: user-visible "agent" → **"Voygent"** (assistant). Cast =
  **User/advisor (terracotta), Client/traveler (slate-teal), AI = Voygent**. `s.agent`
  DSL + `Actor` type unchanged (not user-visible).
- **R2 ✅** Multi-select picks + **"includes" chooser** (capability; collab still single-picks).
- **R3 ✅** Folio **"Send to client"** button + email notice repositioned to a top-right popup toast (visible on collab reel now).
- **R4 ✅** **Client-view** = simulated browser window + **live pricing** + book-progress (capability; not yet emitted by the live reel).
- **R5 ⏳ DO THIS** — author the full screenplay; calibrate dwells; **"build your own trip" CTA** ending; rewrite the grounding test. Makes R2 + R4 visible.

## Current prod state (verify first)
- `main`/`origin/main` = `b876ef1`. Worker `voygent-demo` deployed, bundle `index-DDQmK8W1.js`,
  CSS `index-w4eV0Bfp.css`. **401 tests green, tsc clean.**
- Smoke (auto-fill invite link; passcode is `DEMO_ACCESS_CODE` in repo `.env`):
  `https://demo.voygent.ai/?reel=collab#code=2ebf-azf0-z0qm-txqq`
- Playback bar (top-right while playing): pause/play, restart, **draggable scrubber**, 1×/2×, **`#` frame-number toggle** (cite frames with it). Reel is stateful → seek = reset + fast-forward (`replayChat` `opts.seekTo`).

## R5 — Neil's target sequence (author this as the new `dublin-collab.screenplay.ts`)
Cast prose: advisor = "User" requests; Voygent = `s.agent.says/tool/board/folio`; client = traveler.
1. User asks for help planning a trip.
2. Voygent calls the right tool, asks for details.
3. User gives basic info but **forgets a key detail**.
4. Voygent asks for clarification on that detail.
5. User gives it **and adds one more requirement**.
6. Voygent sets goals / creates / builds trip (tool beats: `save_trip`, etc.).
7. Voygent flight_search → **6–8 options** + a brief rec (best value / price / shortest) → **flight board**.
8. User picks a flight (`s.client.picks`).
9. Voygent asks for hotel prefs.
10. User: mid-market, avoid big chains.
11. Voygent hotel search → **hotel board**; **User multi-selects ~3** (`s.advisor.picksMany`) — these become the client's options.
12. Voygent patch_trip etc.
13. Voygent asks about activity prefs.
14. User: client likes history, **avoid strenuous hikes / lots of stairs**.
15. Voygent builds daily itinerary; suggests **revenue excursions**; adds **free things / photo ops / shopping**; recommends **dining**; **validates** trip goal.
16. Voygent shows **folio-board** (FolioArtifact, day-by-day + dining + includes).
17. User makes a few **direct edits** (`s.advisor.edits`) + **one feedback comment** (`s.advisor.comments` or client).
18. Voygent acks, patch_trip, addresses feedback.
19. Voygent shows an **"includes" chooser** (`s.agent.board("includes", …)` → `s.advisor.picksMany`): packing tips, local customs, apps, typical weather, etc.
20. Voygent updates trip → updated folio-board.
21. User types a personal message, clicks **"Send to client"** (folio Send button; fire `s.advisor.sendsToClient({subject, reply?})`).
22. **Switch to CLIENT view** — `s.client.view(snapshot)` opens the simulated browser window.
23. Client views folio with **book-progress** + **live price**; **picks one of the 3 hotels** + toggles add-on(s) → emit consecutive `s.client.view(...)` snapshots so the **total animates**.
24. Client adds a **question/change** (snapshot `.question`), then "sends" → `s.client.view({…open:false})` (close).
25. Back in chat: **email popup** notification of client feedback (the handoff toast / a second `sendsToClient`); User **pastes the abbreviated feedback** = a `s.advisor.says("…")` beat.
26. Voygent acks feedback, tools, **presents a summary of changes**.
27. User confirms.
28. Voygent patch_trip → **final folio-board**.
29. **End on the functional folio + a "build your own trip" CTA** (today the end card's "Try it yourself" — reframe/relabel; the CTA wording Neil wants is "build your own trip").

## Decisions locked (do not re-litigate)
- **Pricing model = hotel choice + optional add-on toggles** (Neil). `computeTripTotal(view)` already implements it.
- **Client view = simulated browser window** (chromed `voygent.app/t/…`), honest "simulated" tag.
- **Honest framing kept**: collab is a scripted walk-through (intro "Built together" + scripted-note; end card "How a trip comes together" + "your own run pulls real live flights and hotels"). Keep `ReelEntry.intro/endCard/recap` honest; dublin-oct stays the real-recording reel.
- **Phased, in order, each shipped + smoked.** Client-only; no worker/secret/D1 change in R2–R5.

## The capabilities R5 calls (all built + tested — just author beats)
| Need | API (in `web/src/lib/screenplay.ts`) |
|---|---|
| Voygent prose / tool / board / folio | `s.agent.says(t)` · `s.agent.tool(name,{summary})` · `s.agent.board("flight"\|"hotel"\|"includes", id, candidates)` · `s.agent.folio(folio)` |
| Single pick (flight) | `s.client.picks(boardId, id, echo, folio)` (emits folio) |
| Multi-select (hotel shortlist, includes) | `s.advisor.picksMany(boardId, ids[], echo, folio?)` (folio optional) |
| Edit a folio line | `s.advisor.edits("days[i].activities[j]", {was, now, tag}, folioAfter)` |
| Comment thread | `s.client.comments("days[i]", text, threadId)` / `s.advisor.comments(...)` |
| Send to client (handoff + folio button flip + email toast) | `s.advisor.sendsToClient({subject, reply?})` |
| Client view (simulated window, snapshots) | `s.client.view(snapshot \| null)` — see `ReelClientSession` in `web/src/lib/recording.ts` |
| Callout/spotlight | `s.spotlight(match, {target, eyebrow, title, body, dwellMs?})`; match by `interactionKind`/`eventType`+`nth` or `beatId`. data-reel-targets: `board-flight`/`board-hotel`/`board-includes`(check), `folio-days`, `folio-day-${i}`, `folio-includes`, `folio-send`, `handoff-notice`, `comment-${threadId}`, `client-view`, `tool-${name}`, `stat:${key}` |

**ReelClientSession** fields (snapshot): `{ open, url, tripTitle, flightsPrice:number, activitiesPrice:number, hotels:[{id,name,price:number,meta?}], pickedHotelId, addons:[{id,label,price:number,on}], question, progress:0..1 }`. Total = `computeTripTotal` (flights + chosen hotel + activities + toggled add-ons). Make the hotel `hotels[]` prices match the hotel-board candidates the advisor shortlisted (consistency).

## R5 build steps
1. `/branch reel-r5-screenplay` off latest `main`; `npm ci` if a worktree (or work in main clone like R1–R4 did — deepdive session is in its OWN worktree, main clone is ours).
2. Rewrite `web/src/recordings/dublin-collab.screenplay.ts` to the sequence above. Keep reel id `collab`. Author flights (6–8), hotels (≥3, prices matching the client-view shortlist), days w/ activities+dining, includes candidates, add-ons.
3. Update `web/src/recordings/registry.ts` collab `recap`/`durationLabel` for the fuller arc (honest framing intact).
4. Reframe the end card CTA to **"build your own trip"** (`ReelEndCard` default or the collab `endCard` — the primary button is `onTryYourself`; relabel copy to "Build your own trip").
5. Rewrite `web/src/recordings/dublin-collab.screenplay.test.ts` (grounding): all interaction kinds incl. ≥1 multi-pick + ≥1 clientview; end-state folio correct; no folio flicker; every spotlight resolves; client-view total math sane.
6. **Dwell calibration**: `clientview` currently uses the default 3500ms (not in `INTERACTION_DWELL`). Consider adding a `clientview` floor in `web/src/lib/pacing.ts` (e.g. 4500–5500ms so the price-recalc reads). Tune by Neil's smoke.
7. `npm run typecheck` + `npx vitest run` green; `VITE_API_BASE="" npm run build:web`.
8. Ship: rebase onto `origin/main` → FF-merge → `npx wrangler deploy` → verify bundle live + `/blog`/`/info`/`/stats` 200 (superset) → journal coord note → **Neil smokes `?reel=collab` end-to-end** (pacing/callout density + the client-view price animation are the things to calibrate).

## Workflow notes (reuse)
- Each phase: branch → build → typecheck+vitest → `VITE_API_BASE="" npm run build:web && npx wrangler deploy` → verify deployed bundle hash + superset 200s → append a `## Coordination` note to `docs/worktree-journal.md` (newest first) → push.
- Edge propagation: the deployed `/` HTML can lag ~4s after `wrangler deploy`; re-check the bundle hash.
- Copy voice: **no em-dashes, plain cadence** (memory `feedback-demo-copy-voice-no-em-dash`).
- Another session (`../voygent-demo-deepdive-voice`) is ACTIVE on `worker/info/*` `-v2` pages — disjoint from `web/src` reel files; rebase onto latest `origin/main` before merging (clean so far).

## Cross-session / hygiene
- Merged branch refs retained for Neil to delete: `reel-frame-counter`, `reel-r1-terminology`, `reel-r2-multiselect`, `reel-r3-send`, `reel-r4-clientview`, `reel-scrubber` (+ older `reel-p1/p2-*/p4` etc.).
- task-observer weekly review is overdue (last 2026-05-31) — optional.
- Earlier-session pending: Neil's live OFF-MENU smoke of the faithful boards fix (the `list_render`→in-chat steer, shipped earlier today) — confirm flight/hotel choosers render in-chat on a real off-menu trip.

## What NOT to re-read
- This handoff + the journal `## Coordination` section (newest entries 2026-06-10) summarize everything. The R1–R4 diffs are shipped; don't re-derive them.
- Spec for the P2 interaction system: `docs/superpowers/specs/2026-06-09-reel-p2-screenplay-interactions-design.md` (foundation, stable) and `…-reel-p4-multiact-collab-design.md` (the prior multi-act content R5 supersedes).
- Read ONLY: the current `dublin-collab.screenplay.ts` (to rewrite it) + `screenplay.ts`/`recording.ts` (the DSL/types table above) + `ReelClientView.tsx` (to match snapshot fields).

## First moves for the next session
1. Confirm `origin/main` = `b876ef1` (or later) and prod bundle `index-DDQmK8W1.js`.
2. Read `web/src/recordings/dublin-collab.screenplay.ts` + skim `web/src/lib/screenplay.ts` (the DSL) + `web/src/lib/recording.ts` `ReelClientSession`.
3. `/branch reel-r5-screenplay`; author the sequence (above); calibrate; test; deploy; Neil smokes.
