# Design: skinny live Inspector rail + demo surface polish

**Date:** 2026-06-10
**Status:** design — awaiting Neil's review before plan
**Surface:** the claude-skin live demo (`mode=live`, `skin=claude`) chat surface
**Mockup:** https://demo.voygent.ai/mockups/inspector-rail (resting/expanded toggle)
**Codex second opinion:** consulted; converged on the skinny-rail direction independently.

## Problem

Three issues on the same chat surface, raised together:

1. **The Engineering Inspector eats ~half the screen.** Its `engState` machine
   (`web/src/lib/inspector-state.ts`) goes `idle` → **auto-expands to `live` (a
   `1.15fr 1fr` split ≈ 46% width) on the first tool call** → stays there. The
   telemetry permanently dominates the moment work starts. We want it compact and
   live by default, expandable on demand.
2. **Tool chips are uninformative.** Every chip reads `Using Voygent patch_trip`
   (raw tool name). Eight stacked `patch_trip` chips say nothing about what's happening.
3. **Prices read as alarmingly high.** Hotels are 7-night all-inclusive resort totals
   for 2 travelers; flights are 2-traveler round-trip totals; nothing says so. The
   advisor "price ladder" also mixed a per-night number next to a stay-total.

This is one cohesive "demo surface polish" effort. Implementation may stage as three
plans (prices → chips → rail, easiest first), but they share this spec.

---

## Part 1 — Skinny live Inspector rail (the main change)

### Resting behavior (the core flip)

The Inspector **never auto-expands**. On the first tool call it becomes a **live but
narrow rail** (~96px), not the big split. Expansion is a deliberate click.

New state machine (`inspector-state.ts`):

```
type EngState = "idle" | "peek" | "open";
engState(toolCount, expanded):
  toolCount === 0  -> "idle"        // pre-trip: dim, non-interactive, narrow
  expanded         -> "open"        // user clicked: full 1.15fr/1fr two-pane
  else             -> "peek"        // live: narrow ~96px rail, clickable
```

- `expanded` is App state, default `false`, toggled by clicking the rail or the
  panel's `✕ collapse`. Persist last choice in `localStorage`
  (`voygent-demo-eng-open`) so a technical viewer who expands stays expanded across
  turns this session; default collapsed on a fresh load.
- The old `collapsed` boolean is replaced by `expanded` (inverted). The old `live`
  CSS state is renamed `open`; `peek` reuses the narrow-grid column but with live content.

### Grid (CSS)

- `.stage[data-eng="open"]` → `1.15fr 1fr` (unchanged split, now click-gated).
- `.stage[data-eng="idle"|"peek"]` → `1fr 96px` (was `1fr 46px`; widen to fit live content).
- The 0.4s grid-template transition stays — the rail→panel grow is the existing animation.

### Rail contents (`peek`)

Terminal-skin narrow column, top→bottom:

- `Engineering` micro-label.
- A **live dot + active phase** ("◉ live · Enrichment"). Phase from the phase trail
  (`phases[]` last entry) or derived from fired tools.
- **Pipeline dots** — the 6 `STAGES` (Create·Search·Distill·Stage·Promote·Render) as
  dots: done = green, current = amber pulse, pending = dim. (Reuses the existing
  `stageActive` logic.)
- **Top-N metric stack** (see stat registry) — the highest-priority stats, value over
  micro-label, with the tokens-saved metric carrying a thin fill bar.
- An `⤢` expand affordance; the whole rail is the click target.

`idle` keeps today's behavior: a dim non-interactive "Engineering" label, nothing live.

### Panel contents (`open`)

The current full Inspector, with a `✕ collapse` control in its header that sets
`expanded=false`. **Bottom section reserved for contextual deep-dive links** (Part 3).

### Mobile

Mobile already overlays `.engineering` via `mobileView`. Keep that mechanism. The
live indicator on mobile is a compact button in the chat toolbar showing the top metric
("◉ 12 · $0.41") that opens the overlay. No floating rail on mobile.

---

## Part 2 — Extensible stat registry (Neil: "plan for more stats later")

Today's stats are computed inline in `Inspector.tsx` and hardcoded into the tile
header and rail. To add a stat later without layout surgery, model stats as data.

```ts
interface InspectorStat {
  key: string;            // "contextKeptOut"
  value: string;          // "230"  (pre-formatted)
  label: string;          // "context kept out"
  tone?: "default" | "good";   // green for savings/cost wins
  rail?: number;          // priority; present = eligible for the rail, lower = higher
  bar?: number;           // 0..1 optional fill bar (e.g. tokens-saved proportion)
  deepDive?: string;      // /info slug this stat links to (Part 3)
}
```

- A `buildStats(...)` function in `Inspector.tsx` (or `lib/inspector-stats.ts`) returns
  `InspectorStat[]` from the live data (tools, distinct, persisted writes,
  context-kept-out, observed cost, cache-hit-rate, …).
- **Rail** renders stats with a `rail` priority, sorted, capped at `RAIL_SLOTS` (3–4).
- **Panel** renders all stats as the tile grid (grid already `repeat(auto-fit, …)`, so
  more tiles flow naturally).
- Adding a stat = push one registry entry. It appears in the panel automatically, in the
  rail if it has a `rail` priority, and links to its deep-dive if it has a slug.

Initial registry (maps the stats already shown): `mcpToolsExposed` (→ production-system),
`distinctTools` (→ production-system), `persistedWrites` (→ data-stores),
`contextKeptOut` (rail, good, bar; → context-economics), `observedCost`
(rail, good; → cost-engineering), `cacheHitRate` (→ cost-engineering).

---

## Part 3 — Contextual deep-dive links (the reserved bottom section)

The `/info/<slug>` deep dives already exist (`INFO_LINKS` in `Inspector.tsx`). Instead
of a static list of all 10, the panel's **bottom "Dig deeper" section renders only the
subjects tied to the stats currently in play** — derived from the `deepDive` slugs on the
live registry (deduped, in registry order). Each link reads
`<STAT> — <subject blurb> ↗` so the relevance is explicit
(e.g. `230 KEPT OUT — How context economics keeps tokens out of the model ↗`).

A "More stats and stories land here as the system grows." footnote signals the section
will grow with the registry. Subjects with no active stat (e.g. `bot-defeat`,
`subagents`) can still be listed under a secondary "More on the engineering" group, or
deferred — decide in the plan. Primary requirement: the bottom links track the stats.

---

## Part 4 — Self-describing tool chips

Replace the raw `Using Voygent <tool>` headline with a human, present-tense label
derived from `tool name + args`, keeping a small mono `<tool>` tag for engineering
honesty (Neil kept the tag in the approved mockup).

Shared resolver `shared/tool-chip-title.ts`: `toolChipTitle(name, args) -> string`.

| tool (+ args) | label |
|---|---|
| `save_trip` | Starting your trip |
| `flight_search` | Searching flights (+ "to {dest}" if arg present) |
| `flight_list` | Ranking the flights |
| `hotel_search` | Searching hotels in {city} |
| `hotel_list` | Ranking the hotels |
| `patch_trip` `{flights}` | Saving your flight pick |
| `patch_trip` `{hotels}` | Shortlisting hotels |
| `patch_trip` `{lodging}` | Locking in the hotel |
| `patch_trip` `{itinerary}` | Building the day-by-day |
| `patch_trip` (other) | Updating the trip |
| `promote_flights` | Locking in the flight |
| `promote_hotels_to_lodging` | Locking in the hotel(s) |
| `excursion_search` | Finding things to do |
| `tripadvisor_search` | Finding places to eat |
| `apply_gap_tour_picks` | Adding activities to your days |
| `resolve` / `resolve_destination` | Looking up {place} |
| `list_render` | Updating your folio |
| fallback | Title-cased tool name |

- **Wiring:** the worker has the args at call time — compute `title` and add it to the
  chat tool event (`{type:"tool", tool, phase, title?}` in `shared/events.ts`) and to the
  `ToolChipItem`. The reel path builds chips from recordings; the timeline builder calls
  the same shared resolver over the recording's name+args (fallback to the name label if a
  recording lacks args). One resolver, both paths.
- **Optional detail (phase 2):** append a short result count ("· 3 resorts") from the
  done-event result (reuse `summarizeToolResult`'s count extraction). Not required for v1.
- `ClaudeToolChip.tsx` renders `<title>` as the headline + the mono `<tool>` tag; the
  expand still shows the friendly `summary`.

---

## Part 5 — Price display fixes

Captured prices are real, but lack context and the ladder mixed units.

**Hotels** (`boards.ts` cpmaxx + serp mappers, `BoardView.tsx`, `FolioPanel.tsx`,
`folio-sync.ts`):
- **Headline the client price** (`clientPrice` when present, else `priceTotal`) as the
  stay total, with a per-night sub derived from the headline (`headline / nights`), not
  the raw `pricePerNight`, so total and per-night always reconcile.
- **Context chip** "All-inclusive · {nights} nts · {travelers} travelers". Derive
  `allInclusive` from the marketing blurb (contains "all-inclusive", case-insensitive);
  `nights` from the hotel; `travelers` from `route.adults`.
- **Ladder fix:** show a "below public {OTA total}" savings line **only when the client
  total is materially below the public OTA total** (compare like-for-like:
  `otaFrom × nights` vs `clientPrice`, threshold ~5%). For the current Cancún data the
  OTA ≈ the cpmaxx rate, so the ladder is dropped (no fake savings). Never put a per-night
  figure beside a stay-total.
- Commission stays advisor-gated.

**Flights** (`boards.ts` flight mapper, `BoardView.tsx`, `FolioPanel.tsx`):
- The captured `price` is the total for `route.adults` travelers. Show
  "round trip · {travelers} travelers" in the meta and "${perPerson} each" sub
  (`pricePerPerson` exists in the fixture).

**New `BoardCandidate`/`FolioHotel`/`FolioFlight` fields** as needed: `nights?`,
`travelers?`, `allInclusive?`, `clientPrice?` (already added), `perPerson?`/`pricePerPerson?`.
Keep the model-facing slim payload unchanged where possible (travelers/nights are cheap
ints; `allInclusive` is a bool); the heavy enrichment stays out-of-band as today.

---

## Out of scope / non-goals

- No change to what the model sees beyond cheap context ints/bools (the slim-payload
  token story stays intact).
- No new deep-dive `/info` pages (Part 3 links to existing slugs only).
- The 3-up hotel multi-select (separate handoff `handoff-2026-06-10-cpmaxx-multiselect.md`)
  is unaffected and proceeds independently.

## Testing

- `inspector-state.ts`: unit-test the new `idle/peek/open` transitions + persistence default.
- `tool-chip-title.ts`: unit-test the resolver table (incl. `patch_trip` arg branches + fallback).
- `boards.ts`: extend the existing cpmaxx/serp/flight mapper tests for client-price headline,
  per-night reconciliation, context fields, and the ladder-only-when-real-savings rule.
- Stat registry: unit-test `buildStats` (rail priority cap, deep-dive dedup).
- No headless UI smoke (env limitation); Neil smokes the rail/expand + chips + prices live.

## Staging

1. **Prices** (smallest, highest "looks wrong" payoff) — Part 5.
2. **Tool chips** — Part 4.
3. **Inspector rail + stat registry + deep-dive links** — Parts 1–3 (the big one).
