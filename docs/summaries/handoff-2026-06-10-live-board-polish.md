# Session Handoff: live demo board polish + feedback

**Date:** 2026-06-10 (afternoon)
**Repo:** /home/neil/dev/voygent-demo  (branch `main`, clean + pushed)
**Prod bundle at handoff:** `index-C4FvCoZY.js`. 403 tests green, tsc clean.
**Context:** the live (mode=live) demo now works end-to-end — featured/menu trips replay
(fast, "Sample results" tag), show flight→hotel boards, and step (present-and-wait). This
handoff is the **remaining polish backlog** on the live board experience, all from Neil's
live smoking. Items are independent-ish; do them in any order, ship + let Neil smoke each.

## How we got here (one paragraph)
The public demo was globally FAITHFUL (a flag) → every trip ran live, unorchestrated. We
made faithful **default-off, opt-in via `?faithful=1`** (client sends `faithful` in the
`/chat` body; worker latches turn 1, `worker/session-do.ts` ~line 359). Featured trips now
replay + step + show boards. We also **hide `manage_trip_goal`** (`CHECKLIST_DRIVER_TOOLS`,
tool filter ~line 550 in session-do.ts) on `!faithful && !liveMode` so the model can't
escape the replay flow. Added a `source` honesty event (live vs sample tag). Full blow-by-
blow in `docs/worktree-journal.md` `## Coordination` (newest first, 2026-06-10).

## DONE this session (deployed) — do NOT redo
- Reel R5 + many reel tweaks (orthogonal; `web/src/recordings/`, `ReelExplore.tsx`).
- Faithful default-off + `?faithful=1`; hide `manage_trip_goal`; `source` live/sample tag.
- Mobile callout placement, working-indicator legibility (`.cl-thinking:not(.cl-thinking-live)`).
- Removed mid-reel "build your own" pill, the duplicate "not affiliated" footer disclaimer,
  and the "watch the demo" button (both sites).
- Auto-scroll now keeps an **unresolved chooser board in view** instead of scrolling past it
  to the trailing summary (`ClaudeChatView.tsx` scroll `useEffect`, scrolls to last
  `[data-reel-target^="board-"]` when a board is unresolved).

## THE BACKLOG (todo) — Neil's exact asks

### 1. Flight options: collapsible detail (airline, times, stops, layover, equipment)
"Without enlarging the line items, add as much detail as we can; collapsible per item is OK."
- **Mechanism already exists**: `BoardView.tsx` renders a "Routing & aircraft ▼" expand from
  `BoardCandidate.legs` (FlightLeg[]) — the REEL flights use it. The expand is a SEPARATE
  button from the pick card (good — see #2).
- **The gap**: LIVE flight candidates have no `legs`. The board comes from `worker/agent/boards.ts`
  `flightCandidate()`, which maps the replay/flight_list tool result. The fixture
  `FlightCandidate` (`worker/fixtures/index.ts`) has: `validatingCarrier`/`airlines`, `cabin`,
  `stops`, `durationMinutes`, `route`, `flightNumbers`, `pricePerPerson` — but **NO per-leg
  times / layover airports / aircraft equipment** (not captured).
- **Options:** (a) enrich `flightCandidate()` meta with what's there (duration, flight #s) +
  add a generic collapsible `details: string[]` to `BoardCandidate` for the rest; OR (b)
  AUTHOR realistic `legs` (times/aircraft/layover) into the 5 fixtures (`worker/fixtures/*.json`)
  like the reel — they're labeled "Sample results", so authored detail is honest. (b) gives the
  richest result and reuses the existing `legs` expand. Recommend (b) for featured fixtures +
  (a)'s meta-enrichment for any truly-live (off-menu) flights. Check the replay result shape in
  `worker/mcp/replay.ts` (flightSearch/flightList) — you may need to pass `legs` through there
  too, and confirm `flightCandidate` reads `airline` (fixture field is `validatingCarrier`).

### 2. Flight selector "more forgiving" (expand without locking)
"If I click a flight it's locked in and the demo moves on" — he wants to **explore detail
without committing**. The whole option card is currently the pick button. The reel BoardView
already SEPARATES the expand toggle (`cl-option-expand`, in `cl-option-sub`) from the pick
button — so **once #1 populates detail for live flights, expanding won't lock** (clicking the
card = pick; clicking expand = view). Verify the live board uses the same separated layout.
Likely #1 + this are one change.

### 3. Hotel options: more detail + a "see more / photos" URL
- BoardView already renders `BoardCandidate.detailUrl` as a "details ↗" link. The cpmaxx hotel
  mapping (`cpmaxxHotelCandidate` in boards.ts) sets `detailUrl` from `hotel_sheet_url`. The
  fixture hotels — CHECK `worker/fixtures/*.json` hotel entries for a URL field; if absent, the
  replay/`hotelCandidate` mapping won't have one. Add a URL to the fixture hotels (or map a real
  field) and surface it. Add more detail (board area/stars/review already show; add a collapsible
  with amenities/price-total/etc. if available).

### 4. Hotel board: MULTI-SELECT like the replay
"Hotel should be multi-select like the replay demo." The REEL does `s.advisor.picksMany`
(scripted). For LIVE, `BoardView.tsx` is single-select (click = one pick → message → model
proceeds). Need: hotel board lets the user select MULTIPLE options (checkboxes / toggle), then
a "Send N hotels" / confirm action that sends the combined pick to the model. This is the
biggest item — it changes the live board interaction model (`onPick` → a multi-select submit)
and the phase machine's HOTEL_PICK directive (which currently expects the picked id(s)). The
worker already supports multi-hotel staging (`patch_trip updates { hotels:[{_candidateId},...] }`).
Flights stay single-select. **Design this with Neil before building** (how many, confirm UX).

### 5. Long wait with no feedback during enrichment (daily + dining build)
Screenshot: after hotels, the model says "Let me build the itinerary and search for activities
and dining simultaneously" then a long silent stretch (patch_trip ×N, excursion_search,
tripadvisor_search) with no progress feedback. The `WorkingIndicator` (`ClaudeChatView.tsx`)
only shows when the last item is an EMPTY assistant message; during enrichment the last item is
a tool chip, so gaps between tool batches show nothing. The running tool chips DO have an
elapsed timer + sweep bar (shipped earlier), but if enrichment is replay (instant) the gap is
the MODEL thinking between batches. **Fix idea:** show a lightweight "Voygent is working…"
indicator whenever `busy` and the last item isn't already a running tool chip (i.e., during
model-thinking gaps), not only on the empty-assistant placeholder. Keep it out of the reel.

## Key files
- `web/src/BoardView.tsx` — board rendering + pick + the legs/expand (the heart of #1–#4).
- `web/src/ClaudeChatView.tsx` — chat, WorkingIndicator (#5), scroll, composer.
- `web/src/App.tsx` — `onPick` (live board pick → message), applyEvent, dataSource.
- `worker/agent/boards.ts` — `flightCandidate`/`hotelCandidate`/`cpmaxxHotelCandidate` (board build).
- `worker/fixtures/*.json` + `worker/fixtures/index.ts` — the curated sample data (#1, #3).
- `worker/mcp/replay.ts` — flightSearch/flightList/hotelSearch result shapes (what boards see).
- `shared/events.ts` — `BoardCandidate` (add `details`/extend as needed), `ServerEvent`.
- `worker/agent/phases.ts` — phase machine HOTEL_PICK directive (touch for #4 multi-select).

## Constraints / gotchas
- **Can't headless-test the live model** — these are agent-orchestration + live-data changes;
  ship + Neil smokes. Unit tests cover pure logic (boards.ts, phases.ts have tests).
- Honesty: featured = curated sample (tagged "Sample results"); don't imply live. Authored
  fixture detail is fine because it's labeled sample.
- Copy voice: no em-dashes, plain sentences (memory `feedback-demo-copy-voice-no-em-dash`).
- Deploy: `VITE_API_BASE="" npm run build:web && npx wrangler deploy`; verify bundle hash +
  `/blog`/`/stats` 200; edge can lag ~5s. A `manage_trip_goal`/board/replay change is a WORKER
  change (wrangler deploy required, not asset-only).
- Smoke link: `https://demo.voygent.ai/?mode=live&skin=claude#code=2ebf-azf0-z0qm-txqq`
  (code in repo `.env` `DEMO_ACCESS_CODE`). Menu trip = NYC/Cancún preset. Off-menu = e.g. Lisbon.

## Also pending (separate, bigger)
- **Auth/onboarding redesign** — full handoff already written:
  `docs/summaries/handoff-2026-06-10-auth-redesign.md`. Tabled by Neil; do after this polish.

## First moves
1. Read this + skim `BoardView.tsx`, `worker/agent/boards.ts`, one fixture
   (`worker/fixtures/nyc-weekend.json`), `worker/mcp/replay.ts`.
2. Start with #1+#2 (flight detail + forgiving expand — one change, reuses the legs expand).
   Then #3 (hotel URL), #5 (enrichment feedback). Save #4 (hotel multi-select) for last and
   design the UX with Neil first.
