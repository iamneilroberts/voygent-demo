import type { ReactNode } from "react";
import type { InsTool, InsTurn, InsSummary, InsSavings, InsFanout } from "../Inspector";
import { SUPPLIER_CATALOG, SUPPLIER_DISCLAIMER } from "../inspector-data";

// Everything a drill render fn might need. Built by Inspector.tsx from the
// derivations it already computes above its render branch (see Task 5).
export interface DrillContext {
  tools: InsTool[];
  turns: InsTurn[];
  summaries: InsSummary[];
  savings: InsSavings[];
  fanout: InsFanout[];
  phases: { phase: string; via: string }[];
  savedHeadline: number;                                   // aggregate "context kept out"
  cost: { haiku: number; sonnet: number; opus: number };   // single-tier counterfactual
  actualCost: number;                                      // measured routed spend
  actualByModel: Record<string, number>;
}

export type DrillId = "funnel" | "costSim" | "waterfall" | "fanout";
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
      {rows.map((r, i) => {
        const slimFrac = r.rawTokens > 0 ? r.slimTokens / r.rawTokens : 1;
        const slim = ctx.tools.filter((t) => t.name === MEASURE_TO_TOOLNAME[r.tool]).slice(-1)[0];
        return (
          <div className="ins-funnel-row" key={`${r.tool}-${i}`}>
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

// ---- View 2: Counterfactual Cost Simulator ----

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

// ---- View 3: Per-Phase Critical-Path Waterfall ----

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

// ---- View 4: Supplier Fan-Out ----

export interface FanoutGroup { tool: string; sources: InsFanout["sources"]; shortlisted: number }

/** One group per consolidated tool call, in order. */
export function fanoutGroups(ctx: DrillContext): FanoutGroup[] {
  return ctx.fanout.map((f) => ({ tool: f.tool, sources: f.sources, shortlisted: f.shortlisted }));
}

/** Distinct supplier ids genuinely queried across all fan-out events. */
export function litSupplierIds(ctx: DrillContext): Set<string> {
  return new Set(ctx.fanout.flatMap((f) => f.sources.map((s) => s.id)));
}

function FanoutView({ ctx }: { ctx: DrillContext }) {
  const groups = fanoutGroups(ctx);
  const lit = litSupplierIds(ctx);
  if (groups.length === 0) {
    return <p className="ins-note">Supplier fan-out appears once a hotel search runs.</p>;
  }
  const dimmed = SUPPLIER_CATALOG.filter((s) => !lit.has(s.id));
  return (
    <div className="ins-fan">
      <p className="ins-note">
        One consolidated call routes through the supplier-consolidation layer to several
        provider adapters, aggregates, then distills. Lit adapters were genuinely queried this
        session (real captured counts); the rest show what the production router can reach.
      </p>
      {groups.map((g, i) => (
        <div className="ins-fan-call" key={i}>
          <div className="ins-fan-tool"><b>{g.tool}</b> <span className="ins-note">→ deduped to {g.shortlisted}</span></div>
          <div className="ins-fan-lit">
            {g.sources.map((s) => (
              <span key={s.id} className={`ins-fan-chip lit ${s.credentialed ? "cred" : ""}`}>
                <b>{s.label}</b> <span className="ins-fan-count">{s.count}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
      {dimmed.length > 0 && (
        <>
          <h5 className="ins-fan-more">Also in the production catalog</h5>
          <div className="ins-fan-catalog">
            {dimmed.map((s) => (
              <details className="ins-fan-chip dim" key={s.id}>
                <summary><b>{s.label}</b> <span className="ins-fan-cat">{s.category}</span></summary>
                <p className="ins-note">{s.coverage}</p>
              </details>
            ))}
          </div>
          <p className="ins-note ins-fan-disc">{SUPPLIER_DISCLAIMER}</p>
        </>
      )}
    </div>
  );
}

export const DRILLS: Drill[] = [
  { id: "funnel", title: "Token elimination funnel", trigger: { kind: "stat", statKey: "contextKeptOut" },
    render: (ctx) => <FunnelView ctx={ctx} /> },
  { id: "costSim", title: "Counterfactual cost simulator", trigger: { kind: "stat", statKey: "observedCost" },
    render: (ctx) => <CostSimView ctx={ctx} /> },
  { id: "waterfall", title: "Per-phase critical path", trigger: { kind: "pipeline" },
    render: (ctx) => <WaterfallView ctx={ctx} /> },
  { id: "fanout", title: "Supplier fan-out", trigger: { kind: "stat", statKey: "suppliersQueried" },
    render: (ctx) => <FanoutView ctx={ctx} /> },
];

export function drillForStat(statKey: string): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "stat" && d.trigger.statKey === statKey);
}
export function pipelineDrill(): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "pipeline");
}
