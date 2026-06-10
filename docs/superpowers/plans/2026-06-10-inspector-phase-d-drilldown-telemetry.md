# Inspector Phase D — Drill-Down Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three drillable telemetry views (Token Elimination Funnel, Counterfactual Cost Simulator, Per-Phase Critical-Path Waterfall) to the expanded Engineering Inspector, all client-rendered from data we already emit, model-facing tokens unchanged at 0.

**Architecture:** Introduce a drill registry (`web/src/lib/inspector-drills.tsx`) that sits on top of the Phase C stat registry. Each drill is a pure data-transform + a render fn, triggered from a summary stat tile or the pipeline block. The expanded panel's summary tiles become registry-driven and clickable (folds in the deferred C5 refactor); clicking a drillable tile toggles a full-width detail panel below the strip. Only the funnel needs a worker change (one additive `searchDistill` event field); cost-sim and waterfall are pure client.

**Tech Stack:** TypeScript, React (Vite), Vitest. Hand-rolled CSS + inline SVG for charts (no chart library). Cloudflare Worker (`worker/`) emits the inspector event stream; the web client (`web/src/`) renders it.

**Reference spec:** `docs/superpowers/specs/2026-06-10-inspector-phase-d-drilldown-telemetry-design.md`

**Deploy command (each stage):** `VITE_API_BASE="" npm run build:web && npx wrangler deploy`
**Pre-commit gate (every commit):** `npx vitest run && npx tsc --noEmit`
**Bundle verify:** `curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `shared/events.ts` | `searchDistill` savings event gains optional `rawTokens` / `slimTokens` / `tool` |
| `worker/session-do.ts` | emit those three fields at the existing distill emit site |
| `web/src/lib/inspector-drills.tsx` | **new** — drill registry, `DrillContext`, the three pure transforms + render fns, stage table |
| `web/src/lib/inspector-drills.test.ts` | **new** — unit tests for the three pure transforms |
| `web/src/lib/inspector-stats.ts` | `InspectorStat` gains `drill?`; tag `contextKeptOut`/`observedCost` |
| `web/src/lib/inspector-stats.test.ts` | assert the two drill tags |
| `web/src/Inspector.tsx` | C5 registry-driven tiles + drill accordion + waterfall trigger + build `DrillContext`; export `InsSavings` etc. (already exported) |
| `shared/events.test.ts` | round-trip the new optional `searchDistill` fields |
| `web/src/styles.css` | `.ins-drill*`, funnel/cost/gantt CSS |

**Type-import note:** `inspector-drills.tsx` imports the `Ins*` interfaces from `../Inspector` with `import type` (types are erased at compile, so no runtime import cycle even though `Inspector.tsx` imports the drill registry back).

---

# STAGE 1 — Token Elimination Funnel

Delivers: the `searchDistill` event fields, the drill registry scaffold, C5 (registry-driven drillable tiles), and the funnel view on the "context kept out" tile.

---

### Task 1: Add structured fields to the `searchDistill` savings event

**Files:**
- Modify: `shared/events.ts` (the `kind: "savings"` variant of `InspectorEvent`)
- Modify: `web/src/Inspector.tsx:43-47` (the client `InsSavings` interface — must mirror the shared shape)
- Test: `shared/events.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `shared/events.test.ts` inside the top-level `describe("encodeSse", ...)` block:

```typescript
  it("round-trips a searchDistill savings event with raw/slim token fields", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "savings", exchangeId: "x1", mechanism: "searchDistill",
      tokensSaved: 852, basis: "chars/4", scope: "aggregate",
      detail: "prod hotelSearch returned ~1195 tok → model saw ~343 tok",
      rawTokens: 1195, slimTokens: 343, tool: "hotelSearch",
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });

  it("still accepts a savings event without the optional raw/slim fields", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "savings", exchangeId: "x1", mechanism: "patch",
      tokensSaved: 120, basis: "chars/4", scope: "aggregate", detail: "patch diff",
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/events.test.ts`
Expected: FAIL — `tsc`/type error or assertion mismatch because `rawTokens`/`slimTokens`/`tool` are not on the savings type.

- [ ] **Step 3: Add the optional fields to the shared event type**

In `shared/events.ts`, change the `kind: "savings"` variant to:

```typescript
  | { type: "inspector"; kind: "savings"; exchangeId: string;
      mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
      tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string;
      // searchDistill only: the raw prod payload size vs the slim model-facing size, as
      // structured numbers so the Token Elimination Funnel can draw per-search bars.
      // Optional + additive: older recordings without them fall back to the aggregate-only funnel.
      rawTokens?: number; slimTokens?: number; tool?: string }
```

- [ ] **Step 4: Mirror the fields on the client `InsSavings` interface**

In `web/src/Inspector.tsx`, change the `InsSavings` interface (currently lines ~43-47) to:

```typescript
export interface InsSavings {
  type: "inspector"; kind: "savings"; exchangeId: string;
  mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
  tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string;
  rawTokens?: number; slimTokens?: number; tool?: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run shared/events.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add shared/events.ts shared/events.test.ts web/src/Inspector.tsx
git commit -m "feat(events): searchDistill savings carries structured raw/slim token fields"
```

---

### Task 2: Emit the new fields from the worker

**Files:**
- Modify: `worker/session-do.ts` (the `searchDistill` emit, currently ~lines 541-548)

- [ ] **Step 1: Add the fields to the emit**

In `worker/session-do.ts`, the existing emit block reads:

```typescript
        if (m && meta && saved > 0) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "searchDistill",
            tokensSaved: saved,
            basis: "chars/4", scope: "aggregate",
            detail: `prod ${m.tool} returned ~${meta.rawTokensEst} tok → model saw ~${m.modelFacingTokens} tok`,
          });
        }
```

Change it to also carry the structured numbers already in hand (`meta.rawTokensEst`, `m.modelFacingTokens`, `m.tool`):

```typescript
        if (m && meta && saved > 0) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "searchDistill",
            tokensSaved: saved,
            basis: "chars/4", scope: "aggregate",
            detail: `prod ${m.tool} returned ~${meta.rawTokensEst} tok → model saw ~${m.modelFacingTokens} tok`,
            rawTokens: meta.rawTokensEst, slimTokens: m.modelFacingTokens, tool: m.tool,
          });
        }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no other call sites construct this event).

- [ ] **Step 3: Run the worker tests that touch session-do / replay**

Run: `npx vitest run worker/`
Expected: PASS — existing tests unaffected (additive fields).

- [ ] **Step 4: Commit**

```bash
git add worker/session-do.ts
git commit -m "feat(worker): emit raw/slim tokens + tool on the searchDistill savings event"
```

---

### Task 3: Drill registry scaffold + funnel transform

**Files:**
- Create: `web/src/lib/inspector-drills.tsx`
- Create: `web/src/lib/inspector-drills.test.ts`

- [ ] **Step 1: Write the failing test for the funnel transform**

Create `web/src/lib/inspector-drills.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { funnelRows, type DrillContext } from "./inspector-drills";
import type { InsSavings } from "../Inspector";

function savings(partial: Partial<InsSavings>): InsSavings {
  return {
    type: "inspector", kind: "savings", exchangeId: "x", mechanism: "searchDistill",
    tokensSaved: 0, basis: "chars/4", scope: "aggregate", detail: "", ...partial,
  };
}

describe("funnelRows", () => {
  it("returns one row per searchDistill event that carries raw+slim, with pct kept out", () => {
    const ctx = { savings: [
      savings({ tool: "hotelSearch", rawTokens: 1195, slimTokens: 343, tokensSaved: 852 }),
      savings({ tool: "flightList", rawTokens: 699, slimTokens: 283, tokensSaved: 416 }),
    ] } as unknown as DrillContext;
    const rows = funnelRows(ctx);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tool: "hotelSearch", rawTokens: 1195, slimTokens: 343, pct: 71 });
    expect(rows[1].pct).toBe(60); // 1 - 283/699 = 0.595 -> 60
  });

  it("ignores savings of other mechanisms and rows missing raw/slim", () => {
    const ctx = { savings: [
      savings({ mechanism: "patch", rawTokens: 100, slimTokens: 10 }),
      savings({ mechanism: "searchDistill", tool: "x" }), // no raw/slim
    ] } as unknown as DrillContext;
    expect(funnelRows(ctx)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts`
Expected: FAIL — module `./inspector-drills` does not exist.

- [ ] **Step 3: Create the registry scaffold + funnel transform**

Create `web/src/lib/inspector-drills.tsx`:

```tsx
import type { ReactNode } from "react";
import type { InsTool, InsTurn, InsSummary, InsSavings } from "../Inspector";

// Everything a drill render fn might need. Built by Inspector.tsx from the
// derivations it already computes above its render branch (see Task 5).
export interface DrillContext {
  tools: InsTool[];
  turns: InsTurn[];
  summaries: InsSummary[];
  savings: InsSavings[];
  phases: { phase: string; via: string }[];
  savedHeadline: number;                                   // aggregate "context kept out"
  cost: { haiku: number; sonnet: number; opus: number };   // single-tier counterfactual
  actualCost: number;                                      // measured routed spend
  actualByModel: Record<string, number>;
}

export type DrillId = "funnel" | "costSim" | "waterfall";
export type DrillTrigger = { kind: "stat"; statKey: string } | { kind: "pipeline" };

export interface Drill {
  id: DrillId;
  title: string;
  trigger: DrillTrigger;
  render: (ctx: DrillContext) => ReactNode;
}

// ---- View 1: Token Elimination Funnel ----

export interface FunnelRow { tool: string; rawTokens: number; slimTokens: number; pct: number }

/** One row per searchDistill event carrying both raw and slim token counts. */
export function funnelRows(ctx: DrillContext): FunnelRow[] {
  const out: FunnelRow[] = [];
  for (const s of ctx.savings) {
    if (s.mechanism !== "searchDistill") continue;
    if (typeof s.rawTokens !== "number" || typeof s.slimTokens !== "number" || !s.tool) continue;
    const pct = s.rawTokens > 0 ? Math.round((1 - s.slimTokens / s.rawTokens) * 100) : 0;
    out.push({ tool: s.tool, rawTokens: s.rawTokens, slimTokens: s.slimTokens, pct });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-drills.tsx web/src/lib/inspector-drills.test.ts
git commit -m "feat(inspector): drill registry scaffold + funnel-row transform"
```

---

### Task 4: Tag stat tiles with their drill

**Files:**
- Modify: `web/src/lib/inspector-stats.ts`
- Test: `web/src/lib/inspector-stats.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/inspector-stats.test.ts` inside `describe("buildStats", ...)`:

```typescript
  it("tags the funnel and cost-sim tiles with their drill id", () => {
    const byKey = Object.fromEntries(buildStats(input).map((s) => [s.key, s]));
    expect(byKey.contextKeptOut.drill).toBe("funnel");
    expect(byKey.observedCost.drill).toBe("costSim");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/inspector-stats.test.ts`
Expected: FAIL — `drill` is undefined (and a tsc error on the unknown property in the test).

- [ ] **Step 3: Add the `drill` field and tag two tiles**

In `web/src/lib/inspector-stats.ts`, add to the `InspectorStat` interface (after `deepDive?`):

```typescript
  drill?: "funnel" | "costSim" | "waterfall";   // expandable detail view this stat opens
```

Then in `buildStats`, add `drill` to the two relevant entries:

```typescript
    { key: "contextKeptOut", value: fmtInt(i.contextKeptOut), label: "context kept out", tone: "good", rail: 1, bar: i.contextKeptOutBar, deepDive: "context-economics", drill: "funnel" },
    { key: "observedCost", value: fmtUsd(i.observedCostUsd), label: "observed cost", tone: "good", rail: 2, deepDive: "cost-engineering", drill: "costSim" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/inspector-stats.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-stats.ts web/src/lib/inspector-stats.test.ts
git commit -m "feat(inspector): tag context-kept-out + observed-cost tiles with their drill"
```

---

### Task 5: Add the funnel render fn + register it

**Files:**
- Modify: `web/src/lib/inspector-drills.tsx`

- [ ] **Step 1: Add the funnel render fn + the DRILLS registry**

Append to `web/src/lib/inspector-drills.tsx`:

```tsx
function fmtTok(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

// Map a replay-measurement tool name (camelCase) to the client tool-call name (snake_case),
// so a funnel row can find the slim payload the model actually received.
const MEASURE_TO_TOOLNAME: Record<string, string> = {
  flightSearch: "flight_search", flightList: "flight_list",
  hotelSearch: "hotel_search", hotelList: "hotel_list",
};

function FunnelView({ ctx }: { ctx: DrillContext }) {
  const rows = funnelRows(ctx);
  if (rows.length === 0) {
    return <p className="ins-note">Per-search distill detail appears once a credentialed search runs.</p>;
  }
  return (
    <div className="ins-funnel">
      <p className="ins-note">
        Each supplier search returns a large raw payload; the model only ever sees the slim,
        distilled version. The eliminated slice never enters context.
      </p>
      {rows.map((r) => {
        const slimFrac = r.rawTokens > 0 ? r.slimTokens / r.rawTokens : 1;
        const slim = ctx.tools.filter((t) => t.name === MEASURE_TO_TOOLNAME[r.tool]).slice(-1)[0];
        return (
          <div className="ins-funnel-row" key={r.tool}>
            <div className="ins-funnel-head">
              <b>{r.tool}</b>
              <span>{fmtTok(r.rawTokens)} → {fmtTok(r.slimTokens)} tok <span className="good">(−{r.pct}%)</span></span>
            </div>
            <div className="ins-funnel-bar" aria-hidden="true">
              <span className="ins-funnel-slim" style={{ width: `${Math.max(2, slimFrac * 100)}%` }} />
            </div>
            {slim && (
              <details className="ins-funnel-payload">
                <summary>what the model actually saw ({fmtTok(r.slimTokens)} tok)</summary>
                <pre className="ins-raw">{slim.result}</pre>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const DRILLS: Drill[] = [
  { id: "funnel", title: "Token elimination funnel", trigger: { kind: "stat", statKey: "contextKeptOut" },
    render: (ctx) => <FunnelView ctx={ctx} /> },
];

export function drillForStat(statKey: string): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "stat" && d.trigger.statKey === statKey);
}
export function pipelineDrill(): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "pipeline");
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/inspector-drills.tsx
git commit -m "feat(inspector): funnel render fn + DRILLS registry + lookup helpers"
```

---

### Task 6: Wire the registry-driven drillable tiles into the panel (C5)

**Files:**
- Modify: `web/src/Inspector.tsx`

- [ ] **Step 1: Import the drill registry**

At the top of `web/src/Inspector.tsx`, add to the existing import block:

```typescript
import { DRILLS, drillForStat, pipelineDrill, type DrillContext, type DrillId } from "./lib/inspector-drills";
```

- [ ] **Step 2: Add drill state + build the DrillContext**

Inside the `Inspector` component, just before the `if (state !== "open")` resting branch (after `activePhase` is computed, ~line 223), add:

```typescript
  // Which drill is expanded in the open panel (single-open accordion). null = none.
  const [openDrill, setOpenDrill] = useState<DrillId | null>(null);
  const drillCtx: DrillContext = {
    tools, turns, summaries, savings, phases: phases ?? [],
    savedHeadline, cost, actualCost, actualByModel,
  };
```

(`useState` is already imported on line 1.)

- [ ] **Step 3: Replace the hardcoded summary strip with registry-driven tiles**

In the open-panel return, replace the entire `<section className="ins-region ins-summary" ...>...</section>` block (currently ~lines 270-300) with:

```tsx
      {/* 10-second read: registry-driven tiles. A tile whose stat has a drill is a button
          that toggles its detail panel below the strip (single-open accordion). */}
      <section className="ins-region ins-summary" aria-label="Run summary">
        <div className="ins-strip">
          {regStats.map((st) => {
            const drill = st.drill ? drillForStat(st.key) : undefined;
            const active = drill && openDrill === drill.id;
            const body = (
              <>
                <span className={`ins-stat-n ${st.tone === "good" ? "ins-stat-cost" : ""}`}>{st.value}</span>
                <span className="ins-stat-l">{st.label}</span>
              </>
            );
            return drill ? (
              <button
                key={st.key}
                className={`ins-stat ins-stat-drill ${active ? "active" : ""}`}
                data-stat={st.key}
                aria-expanded={active}
                onClick={() => setOpenDrill(active ? null : drill.id)}
              >
                {body}
                <span className="ins-stat-caret" aria-hidden="true">{active ? "▾" : "▸"}</span>
              </button>
            ) : (
              <div key={st.key} className="ins-stat" data-stat={st.key}>{body}</div>
            );
          })}
          {valTotal > 0 && (
            <div className="ins-stat" data-stat="validation">
              <span className={`ins-stat-n ${valFail ? "ins-stat-warn" : "ins-stat-ok"}`}>{valOk}/{valTotal}</span>
              <span className="ins-stat-l">validation</span>
            </div>
          )}
        </div>
        {openDrill && (() => {
          const d = DRILLS.find((x) => x.id === openDrill);
          return d ? (
            <div className="ins-drill" role="region" aria-label={d.title}>
              <h4 className="ins-drill-title">{d.title}</h4>
              {d.render(drillCtx)}
            </div>
          ) : null;
        })()}
      </section>
```

Note: this drops the per-tile `ins-stat-sub` "N calls" line that the old `distinctTools` tile showed. That detail moves into the funnel/waterfall drills; the strip stays a clean 10-second read.

- [ ] **Step 4: Build the web client to catch render/type errors**

Run: `VITE_API_BASE="" npm run build:web`
Expected: build succeeds, no TS errors.

- [ ] **Step 5: Run the full client test suite + tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS (existing tests unaffected; the strip still renders the same stats, now from the registry).

- [ ] **Step 6: Commit**

```bash
git add web/src/Inspector.tsx
git commit -m "feat(inspector): registry-driven drillable summary tiles (C5) + funnel drill"
```

---

### Task 7: Funnel + drill-panel CSS

**Files:**
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add the CSS**

Append to `web/src/styles.css`:

```css
/* Phase D — drillable tiles + drill detail panel */
.ins-stat-drill { cursor: pointer; background: none; border: none; text-align: left;
  font: inherit; color: inherit; position: relative; padding-right: 16px; }
.ins-stat-drill:hover { background: var(--term-line, rgba(255,255,255,.04)); border-radius: 6px; }
.ins-stat-drill.active { background: var(--term-line, rgba(255,255,255,.06)); border-radius: 6px; }
.ins-stat-caret { position: absolute; top: 2px; right: 4px; font-size: 9px; opacity: .6; }
.ins-drill { margin-top: 10px; padding: 12px; border: 1px solid var(--term-line, #2a2a2a);
  border-radius: 8px; background: rgba(0,0,0,.18); }
.ins-drill-title { margin: 0 0 8px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; opacity: .8; }

/* Funnel */
.ins-funnel-row { margin: 10px 0; }
.ins-funnel-head { display: flex; justify-content: space-between; font-size: 12px; gap: 8px; }
.ins-funnel-bar { height: 12px; border-radius: 3px; background: var(--term-line, #2a2a2a);
  overflow: hidden; margin-top: 4px; }
.ins-funnel-slim { display: block; height: 100%; background: var(--term-green, #7fb069); }
.ins-funnel-payload { margin-top: 5px; }
.ins-funnel-payload summary { font-size: 11px; opacity: .75; cursor: pointer; }
```

- [ ] **Step 2: Build + deploy Stage 1**

Run: `VITE_API_BASE="" npm run build:web && npx wrangler deploy`
Expected: deploy `ok ✓`. If wrangler exits 1 transiently, re-run it.

- [ ] **Step 3: Verify the new bundle is live**

Run: `curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'`
Expected: a NEW hash (not `index-D4HAjykg.js`). Edge may lag ~5s.

- [ ] **Step 4: Commit**

```bash
git add web/src/styles.css
git commit -m "style(inspector): funnel + drill-panel CSS; deploy Stage 1 (funnel)"
```

- [ ] **Step 5: Neil smoke**

Hand Neil the smoke link and ask him to: open a featured trip, expand the Inspector, click the "context kept out" tile, confirm the funnel rows + per-search bars + the "what the model actually saw" payload expander render. No headless smoke in this env.

---

# STAGE 2 — Counterfactual Cost Simulator

Delivers: the cost-scenario transform + the `costSim` drill on the "observed cost" tile. Pure client.

---

### Task 8: Cost-scenario transform

**Files:**
- Modify: `web/src/lib/inspector-drills.tsx`
- Test: `web/src/lib/inspector-drills.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/inspector-drills.test.ts`:

```typescript
import { costScenarios } from "./inspector-drills";

describe("costScenarios", () => {
  const ctx = {
    actualCost: 0.41,
    cost: { haiku: 0.12, sonnet: 0.83, opus: 2.07 },
  } as unknown as DrillContext;

  it("returns actual + all-Sonnet + all-Opus with multipliers vs actual", () => {
    const rows = costScenarios(ctx);
    expect(rows.map((r) => r.label)).toEqual(["Actual (routed)", "All Sonnet", "All Opus"]);
    expect(rows[0]).toMatchObject({ usd: 0.41, mult: 1, actual: true });
    expect(rows[2].usd).toBe(2.07);
    expect(rows[2].mult).toBeCloseTo(5.05, 1); // 2.07 / 0.41
  });

  it("guards divide-by-zero when actual cost is 0", () => {
    const rows = costScenarios({ actualCost: 0, cost: { haiku: 0, sonnet: 0.1, opus: 0.2 } } as unknown as DrillContext);
    expect(rows.every((r) => Number.isFinite(r.mult))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts`
Expected: FAIL — `costScenarios` is not exported.

- [ ] **Step 3: Add the transform**

Add to `web/src/lib/inspector-drills.tsx` (above the `DRILLS` array, after `FunnelView`):

```tsx
export interface CostScenario { label: string; usd: number; mult: number; actual?: boolean }

/** Actual routed spend vs the single-tier counterfactuals already on the client.
 *  no-cache / no-distill scenarios are deferred (need server-side repricing). */
export function costScenarios(ctx: DrillContext): CostScenario[] {
  const base = ctx.actualCost > 0 ? ctx.actualCost : 1;
  return [
    { label: "Actual (routed)", usd: ctx.actualCost, mult: 1, actual: true },
    { label: "All Sonnet", usd: ctx.cost.sonnet, mult: ctx.cost.sonnet / base },
    { label: "All Opus", usd: ctx.cost.opus, mult: ctx.cost.opus / base },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-drills.tsx web/src/lib/inspector-drills.test.ts
git commit -m "feat(inspector): cost-scenario transform (actual vs all-Sonnet vs all-Opus)"
```

---

### Task 9: Cost-sim render + register it + CSS + deploy Stage 2

**Files:**
- Modify: `web/src/lib/inspector-drills.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add the render fn and register the drill**

In `web/src/lib/inspector-drills.tsx`, add a `CostSimView` component (after `costScenarios`):

```tsx
function usd(n: number): string { return `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`; }

function CostSimView({ ctx }: { ctx: DrillContext }) {
  const rows = costScenarios(ctx);
  const max = Math.max(...rows.map((r) => r.usd), 0.0001);
  if (ctx.actualCost <= 0) {
    return <p className="ins-note">Cost scenarios appear once the first priced turn completes.</p>;
  }
  return (
    <div className="ins-costsim">
      <p className="ins-note">
        What this exact session would have cost under one model for every turn, vs the routed
        actual. Cache-disabled and distill-disabled scenarios are coming (they need server-side
        repricing, kept off the client).
      </p>
      {rows.map((r) => (
        <div className={`ins-costsim-row ${r.actual ? "actual" : ""}`} key={r.label}>
          <span className="ins-costsim-label">{r.label}</span>
          <span className="ins-costsim-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(2, (r.usd / max) * 100)}%` }} />
          </span>
          <span className="ins-costsim-usd">{usd(r.usd)}{!r.actual && r.mult > 1 ? ` · ${r.mult.toFixed(1)}×` : ""}</span>
        </div>
      ))}
    </div>
  );
}
```

Then add to the `DRILLS` array:

```tsx
  { id: "costSim", title: "Counterfactual cost simulator", trigger: { kind: "stat", statKey: "observedCost" },
    render: (ctx) => <CostSimView ctx={ctx} /> },
```

- [ ] **Step 2: Add the CSS**

Append to `web/src/styles.css`:

```css
/* Cost simulator */
.ins-costsim-row { display: grid; grid-template-columns: 78px 1fr auto; align-items: center;
  gap: 8px; margin: 6px 0; font-size: 12px; }
.ins-costsim-row.actual .ins-costsim-label { color: var(--term-green, #7fb069); font-weight: 700; }
.ins-costsim-bar { height: 10px; background: var(--term-line, #2a2a2a); border-radius: 3px; overflow: hidden; }
.ins-costsim-bar span { display: block; height: 100%; background: var(--term-amber, #d6a35c); }
.ins-costsim-row.actual .ins-costsim-bar span { background: var(--term-green, #7fb069); }
.ins-costsim-usd { font-variant-numeric: tabular-nums; white-space: nowrap; }
```

- [ ] **Step 3: Run tests + tsc + build**

Run: `npx vitest run && npx tsc --noEmit && VITE_API_BASE="" npm run build:web`
Expected: PASS, build succeeds.

- [ ] **Step 4: Deploy Stage 2 + verify bundle**

Run: `npx wrangler deploy && curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'`
Expected: deploy `ok ✓`; a NEW bundle hash.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-drills.tsx web/src/styles.css
git commit -m "feat(inspector): counterfactual cost simulator drill; deploy Stage 2"
```

- [ ] **Step 6: Neil smoke**

Ask Neil to click the "observed cost" tile and confirm the three-bar cost simulator renders with the actual bar highlighted and the multipliers.

---

# STAGE 3 — Per-Phase Critical-Path Waterfall

Delivers: the gantt-layout transform + the `waterfall` drill anchored to the pipeline block. Pure client.

---

### Task 10: Gantt-layout transform + stage table

**Files:**
- Modify: `web/src/lib/inspector-drills.tsx`
- Test: `web/src/lib/inspector-drills.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/inspector-drills.test.ts`:

```typescript
import { ganttBars } from "./inspector-drills";
import type { InsTool } from "../Inspector";

function tool(name: string, latencyMs: number): InsTool {
  return { type: "inspector", kind: "tool", exchangeId: "x", turn: 0, name, args: {}, result: "", latencyMs, ok: true };
}

describe("ganttBars", () => {
  it("lays tool calls end-to-end with cumulative offsets and a stage per call", () => {
    const ctx = { tools: [tool("hotel_search", 400), tool("hotel_list", 100), tool("patch_trip", 50)] } as unknown as DrillContext;
    const bars = ganttBars(ctx);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({ name: "hotel_search", stage: "search", offsetPct: 0 });
    // second bar starts after the first (400 / 550 total)
    expect(bars[1].offsetPct).toBeCloseTo((400 / 550) * 100, 1);
    expect(bars[1].stage).toBe("distill");
    expect(bars[2].stage).toBe("stage");
  });

  it("returns [] for no tools", () => {
    expect(ganttBars({ tools: [] } as unknown as DrillContext)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts`
Expected: FAIL — `ganttBars` not exported.

- [ ] **Step 3: Add the stage table + transform**

Add to `web/src/lib/inspector-drills.tsx`:

```tsx
export type GanttStage = "create" | "search" | "distill" | "stage" | "promote" | "render" | "other";

// Self-contained stage mapping (mirrors STAGES in Inspector.tsx + stageForTool in
// worker/inspector.ts) so the drill module pulls in no server code.
function stageForToolName(name: string): GanttStage {
  if (name === "save_trip") return "create";
  if (name === "flight_search" || name === "hotel_search") return "search";
  if (name === "flight_list" || name === "hotel_list") return "distill";
  if (name === "patch_trip") return "stage";
  if (name === "promote_flights" || name === "promote_hotels_to_lodging") return "promote";
  return "other";
}

export interface GanttBar { name: string; stage: GanttStage; latencyMs: number; offsetPct: number; widthPct: number }

/** Cumulative end-to-end layout of every tool call (we have durations, not wall-clock
 *  timestamps — so this is a sequential approximation, labeled as such in the view). */
export function ganttBars(ctx: DrillContext): GanttBar[] {
  const total = ctx.tools.reduce((a, t) => a + t.latencyMs, 0);
  if (total <= 0) return [];
  let acc = 0;
  return ctx.tools.map((t) => {
    const bar: GanttBar = {
      name: t.name, stage: stageForToolName(t.name), latencyMs: t.latencyMs,
      offsetPct: (acc / total) * 100, widthPct: (t.latencyMs / total) * 100,
    };
    acc += t.latencyMs;
    return bar;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/inspector-drills.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inspector-drills.tsx web/src/lib/inspector-drills.test.ts
git commit -m "feat(inspector): critical-path gantt-layout transform + stage table"
```

---

### Task 11: Waterfall render + pipeline trigger + CSS + deploy Stage 3

**Files:**
- Modify: `web/src/lib/inspector-drills.tsx`
- Modify: `web/src/Inspector.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add the waterfall render fn + register as a pipeline drill**

In `web/src/lib/inspector-drills.tsx`, add a `WaterfallView` (after `ganttBars`):

```tsx
const STAGE_COLOR: Record<GanttStage, string> = {
  create: "#6b8cce", search: "#d6a35c", distill: "#7fb069", stage: "#b07fb0",
  promote: "#5cc6c6", render: "#c96442", other: "#888",
};

function ms(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n} ms`; }

function WaterfallView({ ctx }: { ctx: DrillContext }) {
  const bars = ganttBars(ctx);
  const total = ctx.tools.reduce((a, t) => a + t.latencyMs, 0);
  if (bars.length === 0) {
    return <p className="ins-note">The critical path appears once tool calls run.</p>;
  }
  return (
    <div className="ins-gantt">
      <p className="ins-note">
        Every tool call on this run, laid end-to-end and colored by orchestration stage. We
        record per-call durations (not wall-clock timestamps), so this is a sequential view —
        the slow part is the supplier (MCP) upstream, not our instrumentation (≈0 added model tokens).
      </p>
      {bars.map((b, i) => (
        <div className="ins-gantt-row" key={i}>
          <span className="ins-gantt-name">{b.name}</span>
          <span className="ins-gantt-track" aria-hidden="true">
            <span className="ins-gantt-bar"
              style={{ marginLeft: `${b.offsetPct}%`, width: `${Math.max(1, b.widthPct)}%`, background: STAGE_COLOR[b.stage] }} />
          </span>
          <span className="ins-gantt-ms">{ms(b.latencyMs)}</span>
        </div>
      ))}
      <div className="ins-gantt-total">total tool time <b>{ms(total)}</b></div>
    </div>
  );
}
```

Then add to the `DRILLS` array:

```tsx
  { id: "waterfall", title: "Per-phase critical path", trigger: { kind: "pipeline" },
    render: (ctx) => <WaterfallView ctx={ctx} /> },
```

- [ ] **Step 2: Add the pipeline trigger affordance in the panel**

In `web/src/Inspector.tsx`, locate the `<div className="pipe">...</div>` block (~lines 331-339). Immediately AFTER that closing `</div>`, add a toggle button + the inline waterfall render:

```tsx
        {(() => {
          const wf = pipelineDrill();
          if (!wf) return null;
          const active = openDrill === wf.id;
          return (
            <>
              <button className="ins-pipe-drill" aria-expanded={active}
                onClick={() => setOpenDrill(active ? null : wf.id)}>
                {active ? "▾" : "▸"} view critical path
              </button>
              {active && (
                <div className="ins-drill" role="region" aria-label={wf.title}>
                  <h4 className="ins-drill-title">{wf.title}</h4>
                  {wf.render(drillCtx)}
                </div>
              )}
            </>
          );
        })()}
```

(`pipelineDrill` is already imported in Task 6; `openDrill`/`setOpenDrill`/`drillCtx` already in scope. The pipeline waterfall and the tile drills share the single `openDrill` slot, so opening one closes another.)

- [ ] **Step 3: Add the CSS**

Append to `web/src/styles.css`:

```css
/* Critical-path waterfall */
.ins-pipe-drill { margin-top: 8px; background: none; border: none; color: var(--term-dim, #888);
  font: inherit; font-size: 11px; cursor: pointer; padding: 2px 0; }
.ins-pipe-drill:hover { color: var(--term-amber, #d6a35c); }
.ins-gantt-row { display: grid; grid-template-columns: 120px 1fr 56px; align-items: center;
  gap: 8px; margin: 4px 0; font-size: 11px; }
.ins-gantt-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ins-gantt-track { background: var(--term-line, #2a2a2a); border-radius: 3px; height: 10px; }
.ins-gantt-bar { display: block; height: 100%; border-radius: 3px; }
.ins-gantt-ms { text-align: right; font-variant-numeric: tabular-nums; opacity: .8; }
.ins-gantt-total { margin-top: 8px; font-size: 11px; opacity: .85; }
```

- [ ] **Step 4: Run tests + tsc + build**

Run: `npx vitest run && npx tsc --noEmit && VITE_API_BASE="" npm run build:web`
Expected: PASS, build succeeds.

- [ ] **Step 5: Deploy Stage 3 + verify bundle**

Run: `npx wrangler deploy && curl -s https://demo.voygent.ai/ | grep -o 'index-[A-Za-z0-9_]*\.js'`
Expected: deploy `ok ✓`; a NEW bundle hash.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/inspector-drills.tsx web/src/Inspector.tsx web/src/styles.css
git commit -m "feat(inspector): per-phase critical-path waterfall drill; deploy Stage 3 — Phase D v1 complete"
```

- [ ] **Step 7: Neil smoke + memory/handoff**

Ask Neil to click "view critical path" under the pipeline and confirm the gantt renders with stage colors + total. Then update the `project-reel-p1-demo-chrome` neighbor memory or write a Phase-D-complete handoff, and update the worktree journal coord note.

---

# STAGE 4 — Supplier Fan-Out

Delivers: the `fanout` replay event + `SUPPLIER_CATALOG` reference data + a `suppliersQueried`
drillable tile whose drill shows, per consolidated call, which provider adapters were genuinely
queried (lit, with counts) plus the rest of the production catalog (dimmed). Hotels-first; real
multi-source from the existing serp+cpmaxx fixture data. Model payload unchanged.

### Task 12: `fanout` inspector event (shared + client mirror)

**Files:** `shared/events.ts`, `shared/events.test.ts`, `web/src/Inspector.tsx` (`InsFanout`)

- [ ] Test (events.test.ts): round-trip a `fanout` event.
- [ ] `shared/events.ts` add variant:
  `| { type: "inspector"; kind: "fanout"; exchangeId: string; tool: string; sources: { id: string; label: string; count: number; credentialed: boolean }[]; shortlisted: number }`
- [ ] `Inspector.tsx` add `InsFanout` interface mirroring it.
- [ ] `npx vitest run shared/events.test.ts && npx tsc --noEmit`; commit.

### Task 13: replay records fan-out + worker emits

**Files:** `worker/mcp/replay.ts`, `worker/session-do.ts`

- [ ] `replay.ts`: add `private fanout: { tool: string; sources: {id;label;count;credentialed}[]; shortlisted: number } | null = null;`,
  a `lastFanout()` getter, reset it where `measurement` resets (~:337). In `hotelSearch`/`hotelList`,
  cpmaxx branch → `sources: [cpmaxx (count, credentialed:true), serp fixture.hotels.length]`,
  serp branch → `sources: [serp only]`; `shortlisted = candidates.length`.
- [ ] `session-do.ts`: after the searchDistill block, `if (this.replay.isIntercepted(name)) { const fo = this.replay.lastFanout(); if (fo?.sources.length) emit({ type:"inspector", kind:"fanout", exchangeId, ...fo }); }`.
- [ ] `npx vitest run worker/ && npx tsc --noEmit`; commit.

### Task 14: App.tsx accumulates fanout + passes prop

**Files:** `web/src/App.tsx`

- [ ] Mirror `savings`: `insFanouts` state, `else if (e.kind === "fanout") setInsFanouts(...)`, reset, `fanouts={insFanouts}` prop, import `InsFanout`.
- [ ] `npx tsc --noEmit`; commit.

### Task 15: SUPPLIER_CATALOG reference data

**Files:** `web/src/inspector-data.ts`

- [ ] Add `SUPPLIER_CATALOG: { id; label; category; credentialed; coverage }[]` — real production adapters
  (cpmaxx, serp, expedia, kiwi, lastminute, viator, toursbylocals, tripadvisor, viking, onesource,
  vacationstogo, carrental), `id` matching the fanout source ids (`cpmaxx`,`serp`) for the lit ones,
  + a `SUPPLIER_DISCLAIMER` in the BTS register.
- [ ] commit.

### Task 16: `suppliersQueried` drillable tile

**Files:** `web/src/lib/inspector-stats.ts`, `web/src/lib/inspector-stats.test.ts`

- [ ] Test: `byKey.suppliersQueried.drill === "fanout"`.
- [ ] `StatInput += suppliersQueried: number`; new stat entry `{ key:"suppliersQueried", value: fmtInt, label:"suppliers queried", deepDive:"production-system", drill:"fanout" }` (no `rail`).
- [ ] vitest + tsc; commit.

### Task 17: `fanoutGroups` transform

**Files:** `web/src/lib/inspector-drills.tsx`, `web/src/lib/inspector-drills.test.ts`

- [ ] `DrillContext += fanout: InsFanout[]`.
- [ ] Test `fanoutGroups(ctx)`: one group per fanout event {tool, sources, shortlisted}; `litIds` = distinct source ids.
- [ ] Implement `fanoutGroups` + `litSupplierIds`.
- [ ] vitest + tsc; commit.

### Task 18: FanoutView + registry entry + Inspector wiring

**Files:** `web/src/lib/inspector-drills.tsx`, `web/src/Inspector.tsx`

- [ ] `FanoutView`: per group → `tool → [lit provider tiles w/ counts] → deduped to N`; then dimmed
  `SUPPLIER_CATALOG` (minus lit) with `<details>` depth/breadth popups.
- [ ] DRILLS += `{ id:"fanout", title:"Supplier fan-out", trigger:{kind:"stat",statKey:"suppliersQueried"}, render }`.
- [ ] `Inspector.tsx`: new `fanouts?: InsFanout[]` prop (default []), include in `drillCtx`, compute
  `suppliersQueried` (distinct lit ids) into the `buildStats` input.
- [ ] build + vitest + tsc; commit.

### Task 19: CSS + deploy Stage 4

**Files:** `web/src/styles.css`

- [ ] Provider tile + dimmed + popup CSS (`.ins-fan*`).
- [ ] `npx vitest run && npx tsc --noEmit && VITE_API_BASE="" npm run build:web && npx wrangler deploy`; verify new bundle; commit; Neil smoke.

---

## Self-Review

**Spec coverage:**
- Drill registry on top of stat registry → Tasks 3, 5 (registry + helpers). ✓
- Drillable tiles fold in C5 → Task 6. ✓
- Token Elimination Funnel + the one event field → Tasks 1, 2, 3, 5, 7. ✓
- Counterfactual Cost Simulator (actual/all-Sonnet/all-Opus; no-cache/no-distill deferred) → Tasks 8, 9. ✓ (deferred scenarios called out in the `CostSimView` copy + tracked via Vestige intention.)
- Per-Phase Critical-Path Waterfall (sequential approximation, honesty note) → Tasks 10, 11. ✓ (caveat in `WaterfallView` copy.)
- Each view its own deploy + Neil smoke → Stage boundaries (Tasks 7, 9, 11). ✓
- Model-facing tokens stay 0 → no change to model payload; only the inspector side-channel event gains fields. ✓
- Tests are pure-transform unit tests; no headless UI smoke → Tasks 3, 8, 10. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The deferred no-cache/no-distill scenarios are explicitly out of v1 scope (spec + intention `582538d6`), not a placeholder.

**Type consistency:** `DrillContext` / `DrillId` / `Drill` defined in Task 3 and used unchanged in Tasks 5, 6, 8–11. `funnelRows`/`costScenarios`/`ganttBars` signatures match their tests. `InspectorStat.drill` union (`"funnel"|"costSim"|"waterfall"`) matches the `DrillId` type and the registered `id`s. `MEASURE_TO_TOOLNAME` keys match the `m.tool` values emitted in Task 2 (`flightSearch`/`flightList`/`hotelSearch`/`hotelList` per `worker/mcp/replay.ts`).

**One known divergence from the spec (intentional):** the spec's funnel drill says "raw result vs slim payload side by side." The raw payload bytes are not shipped to the client (only `rawTokens`), so v1 shows the actual slim payload the model received + the raw token magnitude. Full raw-bytes side-by-side would need a `rawPreview` field on the event — a cheap fast-follow if Neil wants it. Flagged here so it is not a silent gap.

---

## Execution Handoff

Plan complete. Two execution options — see the skill's handoff prompt.
