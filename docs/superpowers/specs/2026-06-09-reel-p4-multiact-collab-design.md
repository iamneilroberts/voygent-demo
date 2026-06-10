# Reel P4 — Multi-act collaboration screenplay ("Dublin, built together")

**Date:** 2026-06-09
**Status:** approved (brainstormed with Neil)
**Predecessor:** P2 complete (screenplay DSL + all four interaction renderings shipped).
**Branch:** `reel-p4-multiact`

## Goal

Expand the short proof collab reel into the full multi-act Dublin collaboration story
the P2 format was built for. Replaces the current 1-arc `dublin-collab` (same reel id
`collab`, stays in rotation). Scripted, with honest "scripted walk-through" framing
(kept from P2.4). Target run ~3-4 min.

## Decisions (locked with Neil)

- **Expand, not add:** rewrite `dublin-collab.screenplay.ts`; keep reel id `collab`.
- **Cast/picks:** traveler (client, slate-teal) picks BOTH flight and hotel; advisor
  (terracotta) curates (edit) and routes (send-to-client). Agent narrates.
- **Narration:** rich — one spotlight callout per act (7), each bound unambiguously.
- **Honest framing:** keep the scripted intro + end card; update recap chips to the
  fuller arc. No "real fare" claims (it is authored content).
- **Content-only:** hotel boards, hotel picks, multi-day folios, edits, comments, and
  the send-notice ALL already render (P1/P2). No new components, CSS, or DSL changes.
- **Dwells:** unchanged (pick 3.5 / edit 3.2 / comment 4.2 / handoff 5.2s); timing
  calibrated by Neil's smoke (no headless browser in this env).

## Acts

| Act | Beats | Folio left behind |
|-----|-------|-------------------|
| 1 · Intake   | advisor states the brief → agent confirms → `save_trip` tool | title only (not rendered) |
| 2 · Flights  | `flight_search` → flight board (3 candidates) → client picks Aer Lingus | + flight |
| 3 · Hotels   | `hotel_search` → hotel board (3 candidates) → client picks The Dean | + hotel |
| 4 · Itinerary| agent assembles the week → folio with day-by-day + dining | + days |
| 5 · Refine   | advisor edits Day 3 ("Free morning in Temple Bar" → "Cliffs of Moher day trip") | day 3 changed |
| 6 · Review   | advisor sends to client; reply routes back (email notices + chip) | unchanged |
| 7 · Finalize | client comments on Day 6 (food tour) → advisor replies → agent adds it | + food tour |

Then the (honest, scripted) end card.

## Callouts (one per act)

| Act | match | target |
|-----|-------|--------|
| 1 | `{eventType:"tool", nth:1}` (save_trip) | `tool-save_trip` |
| 2 | `{interactionKind:"pick", nth:1}` | `board-flight` |
| 3 | `{interactionKind:"pick", nth:2}` | `board-hotel` |
| 4 | `{eventType:"folio", nth:3}` (the day-by-day build) | `folio-days` |
| 5 | `{interactionKind:"edit", nth:1}` | `folio-day-2` (Day 3) |
| 6 | `{interactionKind:"handoff", nth:1}` | `handoff-notice` |
| 7 | `{interactionKind:"comment", nth:1}` | `comment-thread-day6` |

`nth` matching is brittle to re-ordering by design; the grounding test asserts every
callout resolves, so a re-order is caught immediately.

## Folio progression (nth order, for the act-4 callout)

withFlight (1) → withHotel (2) → **withDays (3)** → edited (4) → withFinal (5).
`folio-days`/`folio-day-*` targets only exist from withDays onward, which is why the
itinerary callout binds to folio nth:3.

## Trip content

- Flights MOB→DUB (Oct 4-11), 3 candidates; client picks Aer Lingus $3,180.
- Hotels Dublin, 3 candidates; client picks The Dean $168/night.
- Days (5 representative): Day 1 Arrive · Day 2 City · Day 3 Day trip (edit target) ·
  Day 4 Coast · Day 6 Temple Bar (comment + food tour). Activities + dining for substance.

## Registry copy (honest, scripted)

- title "A trip, built together" (unchanged), blurb unchanged.
- intro: "▶ Built together" + "The collaboration here is a scripted walk-through of the workflow."
- endCard: "✓ Built together" / "How a trip comes together" / honest blurb.
- recap: ["👥 advisor + traveler", "✦ picked flights + hotel", "🗓 day-by-day", "✎ advisor refines", "✉ sent to client", "💬 client shaped it"].

## Testing

Rewrite `dublin-collab.screenplay.test.ts` (grounding): two picks present, all four
interaction kinds, end-state folio has both picks + days + food tour, no folio flicker
(once flights non-empty they stay), all 7 callouts resolve. Registry honesty guards
stay. `tsc` clean, full `vitest` green.

## Out of scope

- New interaction kinds / rendering / DSL changes.
- Touching the real `dublin-oct` reel.
- A literal "publish" surface (the send-notice + end card cover "done").
