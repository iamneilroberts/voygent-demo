# Session Handoff: wire captured cpmaxx hotels into the demo (+ 3-up multi-select)

**Date:** 2026-06-10 (evening)
**Repo:** /home/neil/dev/voygent-demo (branch `main`, clean + pushed)
**Prod bundle at handoff:** `index-Cz9v2fdQ.js` (flight-lock fix). 405 tests, tsc clean.
**Memory:** see `project-credentialed-search-capture` (the access model + direction).

## Context: what's DONE (committed, do NOT redo)
This session shipped+deployed (live on demo.voygent.ai):
- Flight board legs (real captured segments), hotel review-scale + stay-total + "search ↗",
  enrichment progress indicator (commit `e6ac9e3`).
- **Flight/hotel boards highlight-then-confirm** (commit `0f711b6`): in live mode a click
  HIGHLIGHTS + opens detail; nothing commits until an explicit "Confirm flight →" /
  "Choose this hotel →" button. Reel path untouched (reelMode→non-interactive). `onPick`
  unchanged (still optimistic-locks + sends). **Neil still needs to smoke this.**
- **cpmaxx hotel capture** (commits `e78caeb` tooling, `4636a01` data): `scripts/capture-fixtures.mjs
  --cpmaxx` non-destructive merge mode added `cpmaxxHotels[]` + `promotedCpmaxxLodgingById{}`
  to ALL 5 fixtures. 8 hotels each, all with `hotelSheetUrl` + `commission` (13-30%), most
  with `image`. `scripts/probe-cpmaxx.mjs` is the probe tool.

Also verified (memory has detail): data isolation is per-`sid` (safe, not shared); cpmaxx is
reached via `hotel_search source=cpmaxx` (NOT `hotel_search_and_rank`, which 404s on prod MCP).

## The captured data shape (slim `cpmaxxHotels[]` per fixture)
camelCase (NOT prod snake_case): `id, source:"cpmaxx", name, stars, area, pricePerNight,
priceTotal, nights, currency, commission, commissionPct, clientPrice, marginPct, profitScore,
hotelSheetUrl, image, marketingBlurb, pictureCount, otaPrices:[{name,pricePerNight}]`.
`promotedCpmaxxLodgingById` is EMPTY ({}): prod `promote_hotels_to_lodging` rejects cpmaxx ids
(its fabrication guard only knows hotel_list/serp candidates). So SYNTHESIZE the folio lodging
card from `cpmaxxHotels` in the replay layer — we control it.

## THE WIRING (todo) — make featured hotels show the credentialed cards
1. **`worker/fixtures/index.ts`**: add `CpmaxxHotel` interface + `cpmaxxHotels?: CpmaxxHotel[]`
   and `promotedCpmaxxLodgingById?: Record<string,...>` to `Fixture`.
2. **`worker/mcp/replay.ts`**: featured trips should serve cpmaxx hotels. In `hotelSearch`/
   `hotelList`, when the fixture has `cpmaxxHotels`, return THOSE (slim → model-facing payload)
   instead of (or alongside) serp `hotels`. On `promoteHotels`, SYNTHESIZE lodging cards from the
   staged cpmaxx ids (build {name, location, nights, total, pricePerNight, stars, image, url:
   hotelSheetUrl, quoteUrl, description: marketingBlurb, commissionPct, _candidateId}). Keep serp
   as fallback for any route lacking cpmaxx. Decide: does the model call source=serp (prompt) and
   replay swaps in cpmaxx? Simplest = replay ignores source and serves cpmaxx when present.
3. **`worker/agent/boards.ts`**: new mapper `cpmaxxSlimHotelCandidate()` for the camelCase slim
   shape (the existing `cpmaxxHotelCandidate` reads prod snake_case — different). Map →
   BoardCandidate with: title=name, price=`$X/night`, meta=area(cleaned)+stars+`$Total total`,
   commission/commissionPct, NEW image + photoCount, detailUrl=hotelSheetUrl (label "view rooms ↗"),
   and a price-ladder (otaPrices cheapest → clientPrice → net/commission). **Add a price-sanity
   filter**: drop/flag implausible pricePerNight (NYC Royalton parsed $8,499/nt — outlier).
4. **`shared/events.ts`** `BoardCandidate`: add `image?`, `photoCount?`, and price-ladder fields
   (e.g. `otaFrom?`, `clientPrice?`) as needed.
5. **`web/src/BoardView.tsx` + `skin-claude.css`**: render the hotel card with a photo thumbnail,
   "📷 N", the commission (advisor-gated, already `advisor &&`), and the price ladder. The
   highlight-then-confirm interaction is already in place.
6. **Folio lodging**: the synthesized cards (step 2) flow through `tripToFolio`; verify the lodging
   section shows image + quote-sheet link.
7. **3-up HOTEL MULTI-SELECT** (the original backlog #4): hotels = select up to 3 (Neil: "3 is
   sufficient"), then "Present 3 to client →". The highlight-then-confirm shell is built for SINGLE
   select; extend BoardView hotel boards to multi (Set of highlighted ids, cap 3, confirm sends all
   3 ids → model stages+promotes all 3 → 3 lodging options). Worker already supports multi-hotel
   staging. Flights stay single.

## Honesty / gating
- Featured trips stay "Sample results" (cpmaxx data is real-captured but static/replayed).
- Commission shows ONLY in advisor mode (`advisor` prop already gates it). Randos see client view
  (no commission). Good — the commission "wow" is an advisor-mode feature.

## Roadmap AFTER hotels (Neil confirmed all of these eventually)
- Flights credentialed (GMT native, commission-protected) — re-capture, same merge pattern.
- Cruise demo (NEW product: public lines carnival/viking + `onesource` GDS; new fixture + board).
- Car (`car_rental_search source=cpmaxx`, no commission) + Excursions (already Viator).
- **Gated "live advisor" auth tier** (admin-page minting): Neil-granted codes w/ expiration + hard
  per-session/per-day caps for LIVE credentialed search of obscure destinations (the live wow).
  Distinct from the automated rando code route (replay-only). Credentialed demos NEVER shared.

## Deploy / smoke
- `VITE_API_BASE="" npm run build:web && npx wrangler deploy` (this is a WORKER change — replay).
  Verify bundle hash + /blog//stats 200; edge lags ~5s.
- Can't headless-test the live model; Neil smokes at
  `https://demo.voygent.ai/?mode=live&skin=claude#code=2ebf-azf0-z0qm-txqq` (NYC/Cancún menu trip).
- Re-capture a route's cpmaxx: `VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' ~/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs --cpmaxx --only=<routeId>`

## First move for the wiring session
Read this + `project-credentialed-search-capture` memory. Skim `worker/mcp/replay.ts`
(hotelSearch/hotelList/promoteHotels), `worker/agent/boards.ts` (cpmaxxHotelCandidate),
one fixture's `cpmaxxHotels[0]`. Start steps 1-3 (type + replay + board mapper), deploy, let Neil
smoke the cards, THEN do multi-select (step 7).
