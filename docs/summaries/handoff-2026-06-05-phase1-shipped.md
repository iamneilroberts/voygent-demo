# Session Handoff: voygent-demo — Phase 1 (Real Results, Zero Fabrication) SHIPPED

**Date:** 2026-06-05
**Repo:** `/home/neil/dev/voygent-demo` (branch `main`, no remote)
**Live URL:** https://voygent-demo.somotravel.workers.dev
**Builds on:** `handoff-2026-06-05-real-results-and-full-path.md` (the full-path plan). Phase 1 there is now DONE.

---

## TL;DR

The demo's fatal flaw is fixed and deployed. The agent no longer fabricates travel data — every
flight/hotel/price in the folio is a **real Voygent search result** captured from prod, replayed
deterministically at **$0 supplier cost per visit**. Off-menu routes honestly return "no results."
Verified end-to-end against the **live public Worker**. Commit `6629a1c`. 34 vitest green, typecheck clean.

## What shipped (decision B + A, prose-only chat)

- **Fixtures (`worker/fixtures/`):** real prod `serp` results for 5 featured routes, captured once by
  `scripts/capture-fixtures.mjs` against `VOYGENT_MCP_URL_NEIL`. Each fixture holds the candidate
  arrays AND the **per-candidate prod-promoted** `trip.flights`/`lodging` objects, so the demo replays
  prod-identical promoted data (no porting of promote logic).
  - Routes: dublin-oct (MOB→DUB), cancun-beach (ATL→CUN), tokyo-blossom (SFO→HND), rome-amalfi
    (JFK→FCO), nyc-weekend (ORD→JFK). **Dates pushed to future** (SERP rejects past dates; today is
    2026-06-05) — cancun/tokyo/nyc are 2027. These double as the Phase-2b preset chips.
- **Replay layer (`worker/mcp/replay.ts`):** intercepts `flight_search`, `hotel_search`,
  `flight_list`, `hotel_list`, `promote_flights`, `promote_hotels_to_lodging`. Trip-state tools
  (`save_trip`/`patch_trip`/`read_trip`) still run **live against staging** — real trip engine; only
  the supplier round-trip is replayed.
  - **Fabrication is structurally impossible:** promote writes ONLY the captured object keyed by a real
    candidate id. A staged `_candidateId` with no fixture match is rejected (flights →
    `candidate_not_found`) or dropped (hotels). The model authors only the *id*, never the data.
  - Retains `lastPromoted()` so the folio is built from tool-truth, sidestepping KV eventual-consistency
    races on a just-written array.
- **`session-do.ts`:** routes `callTool` through the replay; new `SYSTEM_HINT` (anti-fabrication,
  prose-only chat, real search→stage→promote pipeline, featured-route steering, no plumbing leaks).
- **`folio-sync.ts`:** maps the promoted `{outbound,return}` flights object; prefers canonical
  `lodging[]` over the emptied staging `hotels[]` (this ordering bug was masking lodging).

## Verified (the Phase-1 gate)

- Dublin end-to-end on the LIVE worker → folio = real Delta flight ($3,426, a genuine captured
  candidate) + 3 real hotels ($1,308 / $959 / $1,020), matching tool results item-for-item.
- Paris (no fixture) → `count:0`, agent says "I couldn't pull live results" and offers featured routes,
  folio empty — **no fabrication, no "SerpAPI key" leak.**
- All `demo-*` capture/test trips deleted from prod + staging.

## ⚠️ Money / exposure (Neil flagged cost; Phase 4 NOT done)

The public `/chat` spends **Anthropic tokens per visit, uncapped** (per-conversation caps exist:
12 turns / 24 tools in `loop.ts`; there is NO global/daily cap yet). Supplier cost is now $0 (fixtures).
**Before sharing the URL widely**, do Phase 4: global daily $ + tool-call ceiling, per-IP rate limit,
input caps. Kill switch is live: `wrangler secret put DEMO_DISABLED` (enter `1`) to pause instantly.

## Phase 2 — DONE (2026-06-05, commit `bdb317a`, deployed)

Polished honest agent UX:
- Chat renders light prose markdown (bold/italic/bullets) via `web/src/prose.tsx` (safe, no
  `dangerouslySetInnerHTML`) + a typing indicator; `**bold**` no longer shows literal asterisks.
- Folio cards enriched: flights show route · carrier · date · stops · cabin + emphasized price;
  hotels show area · stars · nights + per-night/total. `folio-sync` filters bare staging stubs
  (`{_candidateId}`) so the folio shows only promoted items (no "Hotel"/"Flight" placeholder flash).
- Mechanism leaks closed: neutral no-result notes + hardened SYSTEM_HINT (no "captured/demo/fixture").
- Verified live via Playwright screenshot (real Delta flight + 3 real hotels, full detail).

## Next (from the full-path plan)

1. **Phase 2b onboarding** — preset chips (the 5 routes above) + CF IP-geo origin prefill +
   interview-first. The natural next step in plan order.
2. **Phase 3 Engineering Inspector** — the résumé payload; all real tool telemetry already flows through
   the hand-rolled host.
3. **Phase 4 budget caps + housekeeping** — global daily $/tool ceiling, per-IP rate limit, input caps.
   **Note:** every public visit writes a `demo-*` trip to **staging KV** (by design — the demo uses the
   real trip engine). These accumulate; add a TTL/cleanup sweep here.

(Cost posture per Neil 2026-06-05: not gating on cost while he monitors — Phase 4 caps are no longer
the forced next step; proceed in plan order 2b → 3 → 4.)

## Don't
- Don't point the PUBLIC demo at live prod creds (decision B keeps it on staging + fixtures = $0/visit).
- Don't trust a populated folio without checking the raw tool result (still good hygiene).
- `scripts/_fixtures-raw/` is gitignored (raw prod dumps) — don't commit it.
- To re-capture fixtures: `VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs` (URL never logged).
