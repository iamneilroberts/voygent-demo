# Session Handoff: 3-up hotel multi-select (cpmaxx wiring step 7)

**Date:** 2026-06-10 (evening)
**Repo:** /home/neil/dev/voygent-demo (branch `main`, clean + pushed)
**Prod bundle at handoff:** `index-BLCqyX_j.js` (commit `ba89174`). 414 tests, tsc clean.
**Memory:** `project-credentialed-search-capture` (steps 1-6 marked shipped).

## What's DONE (this session, do NOT redo) — steps 1-6 of the wiring
Committed `ba89174`, deployed, live verified (bundle `index-BLCqyX_j.js`, `/blog//stats` 200):
- `worker/fixtures/index.ts`: `CpmaxxHotel` type; `cpmaxxHotels?` + `promotedCpmaxxLodgingById?`
  on `Fixture`; `cpmaxxHotelsFor(fixture)` = price-sanity-filtered list (single source of
  truth); `cpmaxxHotelById(id)` = cross-route lookup (for out-of-band board enrichment).
- Price-sanity filter: drops a hotel whose pricePerNight is BOTH >4× the route median AND
  >$3000 (NYC Royalton $8,499/nt dropped; nothing else). Applied everywhere via `cpmaxxHotelsFor`.
- `worker/mcp/replay.ts`: `hotelSearch`/`hotelList` serve cpmaxx (`source:"cpmaxx"`, slim
  `slimCpmaxxHotel`) for featured routes instead of serp; `promoteHotels` synthesizes folio
  lodging cards (`synthCpmaxxLodging`) from staged cpmaxx ids — **already loops staged ids, so
  it promotes 1..N cards today**. Serp path kept as fallback for any route w/o cpmaxx.
- `worker/agent/boards.ts`: `cpmaxxHotelCandidate` reads camelCase (replay-slim) AND snake_case
  (live); enriches photo/sheet/photoCount out-of-band from fixture by id; cpmaxx detected via
  `body.source === "cpmaxx" || toolName === "hotel_search_and_rank"`.
- `shared/events.ts`: `BoardCandidate` += `clientPrice, otaFrom, image, photoCount`;
  `FolioHotel` += `image, quoteUrl`.
- `web/src/BoardView.tsx`: hotel option renders photo thumb + 📷 N + advisor-gated price
  ladder (public OTA/nt → client price); commission chip already advisor-gated.
- `web/src/FolioPanel.tsx`: lodging card shows photo + "view rooms ↗" quote-sheet link.
- CSS: `.cl-option-thumb/-photos/-ladder` (skin-claude.css), `.card-thumb/.card-link` (styles.css).

## THE WORK (step 7) — 3-up hotel multi-select (UI only)
The WORKER already supports multi-promote. The gap is the BoardView interaction, which is
single-highlight + single `onPick`. Make HOTEL boards multi-select (Neil: "3 is sufficient"):

1. **`web/src/BoardView.tsx`**: for `board.kind === "hotel"` in interactive (non-reel) mode,
   replace the single `highlighted: string | null` with a `Set<string>` (cap 3 — ignore/replace
   oldest or just block the 4th with a hint). Each row toggles membership. The confirm button
   reads **"Present 3 to client →"** (or "Present N…") and must send ALL highlighted candidates.
   Flights + includes stay single (keep current path). Reel path untouched (`reelMode` → legacy).
2. **`onPick` signature**: currently `(board, candidate)`. Either (a) add a sibling
   `onPickMany(board, candidates[])` threaded ClaudeChatView → App → sse send, or (b) widen onPick
   to accept an array. Trace `onPick` from `BoardView` → `ClaudeChatView.tsx:339` → `App.tsx` to
   where the pick is turned into the user-message sent to the model. The model must receive all 3
   ids so it stages all 3 (`patch_trip {hotels:[{_candidateId},{_candidateId},{_candidateId}]}`)
   then `promote_hotels_to_lodging` → 3 lodging cards (worker already handles this).
3. **The send copy**: when 3 are presented, the message echoed to the model should read like the
   advisor curating a shortlist ("Present these 3 to the client: <names>"), so the model's reply
   + folio show all 3 as options. Confirm the phase machine (HOTEL_PICK present-and-wait) is happy
   with a multi-id stage (it should be — it gates on lodging landing, not count).
4. **Folio**: 3 synthesized lodging cards already flow through `tripToFolio` → 3 `HotelCard`s.
   Verify the right rail shows all 3 with photos + quote links + (advisor) commissions, and the
   trip-commission total sums them (it sums `folio.hotels[].commission` already).

## Honesty / gating (unchanged)
- Featured trips stay "Sample results". Commission + price ladder show ONLY in advisor mode.

## Test + deploy
- `npx vitest run` (414 green now) + `npx tsc --noEmit`. Add a BoardView multi-select test if
  feasible (or a timeline/send test). The worker multi-promote is already covered in
  `worker/mcp/replay.test.ts` ("synthesizes … up to 3").
- Deploy: `VITE_API_BASE="" npm run build:web && npx wrangler deploy` (verify bundle hash +
  `/blog//stats` 200; edge lags ~5s). This is a client-only change unless you touch the worker.
- No headless smoke — Neil opens `https://demo.voygent.ai/?mode=live&skin=claude#code=<DEMO_ACCESS_CODE>`
  (NYC/Cancún menu trip) and confirms 3-up.

## After step 7 (roadmap, Neil confirmed)
Flights credentialed (gmt, commission-protected, same merge pattern) → cruise demo (new product)
→ car (`car_rental_search source=cpmaxx`, no commission) → gated "live advisor" auth tier.

## First move
Read this + `project-credentialed-search-capture` memory. Trace `onPick` (BoardView →
ClaudeChatView → App → send). Then do step 7 in BoardView + the send path, deploy, Neil smokes.
