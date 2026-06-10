# Design: Phase D — expanded-panel drill-down telemetry (v1)

**Date:** 2026-06-10
**Status:** design — awaiting Neil's review before plan
**Surface:** the claude-skin live demo (`mode=live`, `skin=claude`) Engineering Inspector, `open` state
**Builds on:** `2026-06-10-inspector-rail-and-surface-polish-design.md` (Part 6 ranks these views);
Phase C shipped the stat registry (`web/src/lib/inspector-stats.ts`) this extends.
**Mockup (funnel + cost-sim visuals):** https://demo.voygent.ai/mockups/inspector-rail

## Goal

The chat surface wows regular folks; the expanded Engineering panel should wow engineers.
Add three drill-down views, all derivable from telemetry we already emit, all rendered
client-side. **Model-facing tokens stay 0** — telemetry rides out-of-band; the slim-payload
story is untouched.

The three v1 views are codex's top-3 picks (spec Part 6), in wow-per-effort order:

1. **Token Elimination Funnel** — raw supplier tokens → slim model-facing payload, per search.
2. **Counterfactual Cost Simulator** — actual routed spend vs single-tier counterfactuals.
3. **Per-Phase Critical-Path Waterfall** — a tool-call latency gantt colored by orchestration stage.

## Architecture — a drill registry on top of the stat registry

Phase C left a clean stat registry: `buildStats(StatInput) → InspectorStat[]`, consumed by the
rail, the (still-hardcoded) panel tiles, and the deep-dive links. Phase D extends that pattern
rather than bolting on parallel structure.

### The drill registry (`web/src/lib/inspector-drills.tsx`, new)

```
type DrillId = "funnel" | "costSim" | "waterfall";

type DrillTrigger =
  | { kind: "stat"; statKey: string }   // attaches to a summary tile
  | { kind: "pipeline" };               // attaches to the orchestration pipe block

interface Drill {
  id: DrillId;
  title: string;
  trigger: DrillTrigger;
  render: (ctx: DrillContext) => ReactNode;
}

export const DRILLS: Drill[];
export function drillForStat(statKey: string): Drill | undefined;
export function pipelineDrill(): Drill | undefined;
```

`DrillContext` is a typed bag of what the Inspector already derives **above** its render branch
(it was hoisted in Phase C so the rail and panel share it): `turns`, `summaries`, `tools`,
`savings`, `phases`, plus the computed totals (`savedHeadline`, `cost` {haiku,sonnet,opus},
`actualCost`, `actualByModel`, token sums). The render functions are dumb; the **data transforms**
that shape each chart's rows are pure exported functions — that is what we unit-test.

### Stat registry change (`inspector-stats.ts`)

- Add optional `drill?: DrillId` to `InspectorStat`.
- Tag two existing tiles: `contextKeptOut → "funnel"`, `observedCost → "costSim"`.
- No change to `railStats` / `deepDiveLinks`.

### Panel wiring (`Inspector.tsx`) — folds in C5

- **C5 (deferred from Phase C) lands here:** the hardcoded `ins-strip` tiles render from
  `regStats` (the registry) instead of bespoke JSX. A tile whose stat has a `drill` renders as a
  `<button>`; the others stay static.
- **Single-open accordion:** `const [openDrill, setOpenDrill] = useState<DrillId | null>(null)`.
  Clicking a drillable tile toggles its drill; the detail panel renders **below the strip**
  (full panel width, so charts have room) — not squeezed into the tile.
- **Waterfall:** a `view critical path ▾` affordance under the existing `pipe` block toggles the
  `pipeline`-triggered drill in the same `openDrill` slot.
- Charts are **hand-rolled CSS + inline `<svg>`** — no chart library (keeps the bundle lean and
  matches the existing `pipe`/`packet` hand-drawn aesthetic).

## View 1 — Token Elimination Funnel (tile: "context kept out")

**What it shows.** Per-search distill rows — `hotel_search  1,195 → 343 tok  (−71%)` — each a
two-segment bar (slim kept + raw eliminated), followed by the aggregate "context kept out" total
(= `savedHeadline`, already computed) with its labeled dropped slices: raw search, tool catalog,
patch diffs, template render. All slice numbers are already on the client as `savings` events
(`searchDistill` aggregate, `toolCatalog` perTurn, `patch` aggregate, `template` perRender).

**Drill a row →** the raw fixture result vs the slim model-facing payload, side by side (reuses
the `ToolRow` `safeParse` pattern). This is the single most convincing "context kept out" artifact.

**The one worker change.** The `searchDistill` savings event already has both numbers at emit time
(`worker/session-do.ts:540`: `meta.rawTokensEst` and `m.modelFacingTokens`) but ships only the
delta (`tokensSaved`) as a structured field — raw/slim live only in the prose `detail` string. Add
optional structured fields to that event variant:

- `shared/events.ts`: the `searchDistill` savings shape gains `rawTokens?: number`,
  `slimTokens?: number`, `tool?: string`.
- `worker/session-do.ts`: emit those three alongside the existing `tokensSaved`/`detail`.

Additive, backward-compatible (older recordings without the fields fall back to the aggregate-only
funnel — no per-row bars), out-of-band, model-facing tokens unchanged. **Sankey stays deferred**
(Part 6: "distill ledger first, Sankey later").

## View 2 — Counterfactual Cost Simulator (tile: "observed cost")

**What it shows.** Grouped horizontal bars — **Actual (routed)** vs **all-Sonnet** vs **all-Opus**
— each with its USD and a multiplier vs actual (`5.0× all-Opus`), headline
`routed $0.41 vs all-Opus $2.07`. Upgrades the existing text-only `ins-cost` block to bars.

**Data.** All three values are already on the client: `actualCostUsd` (routed) and `costByModel`
{haiku, sonnet, opus} (the single-tier counterfactual), both on `InsSummary`. Zero new plumbing.

**Deferred to a tracked fast-follow (NOT v1).** The `no-cache` and `no-distill` scenarios require
**repricing** this session's usage, and repricing must stay server-side — `worker/inspector.ts:50`
codifies "client never holds pricing." v1 honors that law. The fast-follow emits a small
server-side cost event carrying pre-computed no-cache / no-distill USD, then adds those two bars to
the `costSim` render. (Vestige intention `582538d6` records this; do not silently drop it.)

## View 3 — Per-Phase Critical-Path Waterfall (anchor: pipeline)

**What it shows.** A sequential gantt — one bar per tool call, width ∝ `latencyMs`, colored by
orchestration stage (the `STAGES` / `stageForTool` mapping already in the panel and in
`worker/inspector.ts`), laid out with cumulative start offsets, plus the `overhead` callout
("≈0 added model tokens · instrumentation N ms"). Framing: *the slow part is the MCP upstream,
not our overhead.*

**Honesty constraint (stated in the panel, not just the spec).** We have per-tool *durations*
(`tools[].latencyMs`), not wall-clock start timestamps, so the bars are laid end-to-end as a
cumulative approximation — not a true concurrency-accurate trace. The richer "nested model / MCP /
server / replay spans" from Part 6 is the later version; v1 shows MCP latency bars + the ~0-overhead
truth, and says so in a one-line note.

**Data.** `tools[].latencyMs` + stage mapping + `overhead`. All already on the client. No new event.

## Files touched

| File | Action | What |
|------|--------|------|
| `web/src/lib/inspector-drills.tsx` | **new** | drill registry + 3 `render` fns + pure data-transform helpers |
| `web/src/lib/inspector-charts.tsx` | **new (optional)** | shared CSS/SVG bar + gantt primitives (split if `inspector-drills` grows large) |
| `web/src/lib/inspector-drills.test.ts` | **new** | unit tests for the pure transforms (funnel rows, cost scenarios, gantt layout) |
| `web/src/lib/inspector-stats.ts` | edit | `+ drill?` field; tag `contextKeptOut`/`observedCost` |
| `web/src/lib/inspector-stats.test.ts` | edit | assert drill tags |
| `web/src/Inspector.tsx` | edit | C5 registry-driven tiles + drill accordion + waterfall trigger + build `DrillContext` |
| `shared/events.ts` | edit | `searchDistill` savings `+ rawTokens?/slimTokens?/tool?` |
| `shared/events.test.ts` | edit | new optional fields |
| `worker/session-do.ts` | edit | emit the three new fields at the existing distill emit (`~:543`) |
| `web/src/styles.css` (+ `skin-claude.css` if needed) | edit | `.ins-drill*`, funnel/cost/gantt CSS |

## Testing

- **Pure transforms (`inspector-drills.test.ts`):** funnel-row builder (raw/slim/pct, fallback when
  fields absent), cost-scenario builder (actual + the two counterfactuals, multipliers), gantt-layout
  builder (cumulative offsets, stage colors, width proportions). These return plain data structures;
  the SVG/CSS render is not unit-tested.
- **Registry (`inspector-stats.test.ts`):** the two new `drill` tags present and on the right keys.
- **Event shape (`shared/events.test.ts`):** the `searchDistill` variant accepts and round-trips the
  three optional fields; absence is valid.
- **No headless UI smoke** (env limitation) — Neil smokes the live deploy after each stage.

## Staging (each its own deploy + Neil smoke)

1. **Funnel** — includes the one event-field add (`shared/events.ts` + `session-do.ts`) + the
   registry-driven drillable tiles (C5) + the funnel render. The headline view.
2. **Cost simulator** — pure client; the `costSim` drill on the "observed cost" tile.
3. **Waterfall** — pure client; the `pipeline` drill under the pipe block.

Optional: deploy a throwaway waterfall mockup (`web/public/mockups/inspector-waterfall.html`) before
wiring stage 3, if Neil wants to eyeball the gantt first. Funnel + cost-sim are already visualized in
`/mockups/inspector-rail`.

## Out of scope / non-goals

- No change to what the model sees beyond the existing cheap out-of-band telemetry (the slim-payload
  token story stays intact; the new funnel fields are inspector-channel only).
- No chart library, no Sankey (deferred), no client-side pricing (the no-cache/no-distill scenarios
  stay deferred to a server-emitted cost event — tracked, not dropped).
- No new `/info` deep-dive pages; existing deep-dive links are unchanged.
- The remaining Part 6 views (per-turn token waterfall, model-routing swimlane, fabrication-guard
  ledger, latency breakdown, cache thermodynamics, etc.) land as later registry/drill entries — the
  drill registry this introduces is the seam they slot into.

## Conventions

Plain copy, no em-dashes (`feedback-demo-copy-voice-no-em-dash`). Commission/economics stay
advisor-gated and off the client render path. Don't bloat the model-facing slim payload. Deploy:
`VITE_API_BASE="" npm run build:web && npx wrangler deploy`; `npx vitest run && npx tsc --noEmit`
before every commit.
