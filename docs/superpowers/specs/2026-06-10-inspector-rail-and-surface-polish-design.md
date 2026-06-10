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
  panel's `✕ collapse`. **Always start collapsed** (no persistence) — the rail is
  visible and live, so collapsed is not "hidden".
- **First-reveal attention beat:** when the first tool fires and the rail transitions
  `idle → peek`, it plays a one-time draw-attention animation — a brief widen/bump
  (~96px → ~120px → settle), a glow on the live dot, and a one-shot "click to expand ⤢"
  hint that fades after a few seconds (or on first interaction). Respect
  `prefers-reduced-motion` (no bump; show the hint statically, then fade). This makes the
  expand affordance discoverable without stealing the screen.
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

Subjects with no active stat yet (e.g. `bot-defeat`, `subagents`) go under a secondary
**"More on the engineering"** group below the stat-linked primary links (Neil confirmed),
so every deep dive stays reachable while the stat-tied ones lead. A "More stats and
stories land here as the system grows." footnote signals the section grows with the registry.

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

## Part 6 — Expanded-panel drill-down telemetry (wow the engineers)

Goal (Neil): the chat wows regular folks; the expanded engineering panel wows tech
people. Add deep drill-down, favoring views derivable from data we already emit
(tokens, latency, tool calls, models, savings, phases). All new views are stat-registry
entries and/or click-to-expand details — the panel stays extensible.

**Interaction model:** the panel becomes drillable, not just a readout.
- Click a **stat tile** → expands an inline detail (sparkline / breakdown) + its deep-dive link.
- Click a **pipeline node** → filters the tool log to that stage's calls.
- Expand a **tool row** → raw-vs-slim payload + tokens/latency attributable to it.
- Expand a **turn** → that turn's token mix, cost, and model.

### Context economics (the headline wow)
- **Distill ledger (v1)** — per search tool: `raw 1067 tok → slim 283 tok (−73%)` with a
  mini bar. Expanding shows the **raw result vs the slim model-facing payload side by side**
  (the actual JSON the model received vs the full tool output). This is the single most
  convincing "context kept out" artifact. Data: fixture `meta.*.rawTokensEst` + replay
  `measurement.modelFacingTokens`.
- **Per-turn token waterfall (v1)** — stacked bar per turn: cacheRead / input / cacheWrite /
  output. Makes prompt caching visible (huge cacheRead, tiny fresh input). Data: `turns[]`.
- **Context-window occupancy** — a bar of tokens-in-window vs the Pro/1M window, with
  "kept out" shown as the slice that never entered. Data: cost-weighted tokens + `PLAN_TIERS`.

### Cost engineering
- **Cost timeline + counterfactual (v1)** — per-turn cost, with the all-Opus counterfactual
  ghosted above and a cumulative `routed $0.41 vs all-Opus $2.07`. Data: `summaries` costByModel + actualCost.
- **Model-routing timeline (v1)** — one lane per turn showing which model ran
  (Haiku/Sonnet/Opus), so "cheap model for enrichment, Sonnet for search" is legible.
  Data: `turns[].model`.
- **Cache-hit sparkline** — hit rate across turns. Data: `usage`.

### Orchestration
- **Tool-call gantt (v1)** — a latency timeline of every tool call, grouped/colored by
  phase. Shows the orchestration shape and that the slow part is the MCP upstream, not our
  overhead. Data: `tools[].latencyMs` + phase mapping.
- **Phase-machine trail** — the real transitions with their trigger tool
  (`→ HOTEL_PICK via promote_hotels`). Data: `phases[]`.
- **Tool-catalog withheld** — `72 tools exist · 6 used · 66 schemas withheld each turn = N tok/turn`.
  Data: `summary.exposedToolCount/fullToolCount` + the toolCatalog savings event.

### Integrity / trust
- **Fabrication-guard ledger (v1)** — `N candidate ids validated against captured results,
  0 invented accepted`. Makes the record/replay guarantee visible. Needs a small new guard
  event from the replay layer (it already drops unknown ids — just emit the tally).
- **Result provenance** — each flight/hotel tagged "served from fixture, captured 2026-06-05".
  Data: fixture `meta.capturedAt`.
- **Trip-integrity checks** — already present; keep, with self-heal detail.

### Infra projection / latency
- **Latency breakdown (v1)** — wall-clock split: model think vs tool (MCP) vs render/stream,
  plus time-to-first-token; highlights that our own instrumentation overhead is ~0 added model
  tokens. Data: `overhead` (instrumentationMs, addedModelTokens:0) + tool latencies.
- **KV/D1 op projection** — already present (`stores`); could break down by op type.
- **Anti-bot verdict** — "edge challenge passed in N ms" (ties to the bot-defeat deep dive).

### Codex-contributed framings (merged from `/codex-review`)
Codex independently proposed most of the above and sharpened these — adopt the framings:
- **Token Elimination Funnel** (codex top pick) — upgrade the Distill ledger into a
  **Sankey/funnel**: raw supplier tokens → distilled payload → model-visible context →
  rendered folio bytes, with the dropped slices labeled (raw search, tool catalog, patch
  diffs, templates, server-rendered UI). Makes "context kept out" visually undeniable.
- **Counterfactual Cost Simulator** (codex #2) — broaden the cost view beyond all-Opus to a
  grouped bar of scenarios: actual mixed-model vs **all-Sonnet / all-Opus / no-cache /
  no-distill / model-renders-folio**. Turns architecture decisions into visible dollars.
- **Per-Phase Critical Path Waterfall** (codex #3) — the tool-call gantt with **nested spans
  per phase** (model time / MCP time / server compute / replay lookup / integrity), giving
  a real distributed-tracing feel.
- **Cache Thermodynamics panel** — cache write/read tokens, hit rate, avoided cost, cache age
  per turn (a richer cache-hit view).
- **Savings Pareto** — the savings events as a Pareto chart with a cumulative-savings curve
  (ranked optimizations by impact).
- **Context Budget Heatmap** — per-turn window occupancy by category (user request, trip
  state, distilled search, system/dev instructions, withheld catalog/diffs).
- **Replay Provenance Ledger** — audit table: capture id, prod timestamp, candidate ids used,
  fabricated ids rejected (extends the fabrication-guard ledger).

**v1 picks (high wow-per-effort, mostly existing data):** Token Elimination Funnel (distill
ledger first, Sankey later), per-turn token waterfall, Counterfactual Cost Simulator,
model-routing timeline, Per-Phase Critical Path Waterfall (gantt), fabrication-guard ledger,
latency breakdown. The rest land as later registry entries — codex's top-3 match these.

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
