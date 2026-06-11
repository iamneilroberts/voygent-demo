import type { ReactNode } from "react";
import type { InsTool, InsTurn, InsSummary, InsSavings, InsFanout, InsValidation, InsOverhead } from "../Inspector";
import { SUPPLIER_CATALOG, SUPPLIER_DISCLAIMER } from "../inspector-data";
import { StoreOpsWidget, type InsStore } from "../StoreOpsWidget";
import { MODEL_LABELS, type ModelId } from "../../../shared/models";
import type { StatsResponse } from "../../../shared/events";

// Everything a drill render fn might need. Inspector is the single computation site;
// the drills are pure presentation — they read these pre-computed values, never recompute.
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
  // Relocated panel detail (was always-visible; now lives behind the tiles):
  tokensIn: number; tokensOut: number; cacheRead: number;
  freshTokens: number; hitRate: number | null; proWindow: number | null;
  routedModels: string[];
  perTurnDelta: number; perTurnTotal: number; templateMax: number; turnsTotal: number;
  overhead?: InsOverhead;
  stores: InsStore[];
  validations: InsValidation[];
  stats: StatsResponse | null;
  exposedToolCount?: number; fullToolCount?: number;
}

export type DrillId = "funnel" | "costSim" | "waterfall" | "fanout" | "stores" | "integrity";
export type DrillTrigger = { kind: "stat"; statKey: string } | { kind: "pipeline" };

export interface Drill {
  id: DrillId;
  title: string;
  trigger: DrillTrigger;
  render: (ctx: DrillContext) => ReactNode;
}

// ---- View 1: Token Elimination Funnel ----

export interface FunnelRow { tool: string; rawTokens: number; slimTokens: number; pct: number }

// A distill row only earns a bar if it eliminated a meaningful share. Some searches
// barely compress (flight candidates carry full per-leg routing the advisor wants, so
// a flight_search payload ~= its raw prod size) — a "−1%" bar reads as a broken mechanism,
// so we hide it. The real wins (hotels, flight_list) sit comfortably above this.
export const MIN_DISTILL_PCT = 20;

/** One row per searchDistill event carrying raw+slim, filtered to meaningful (>= MIN_DISTILL_PCT) wins. */
export function funnelRows(ctx: DrillContext): FunnelRow[] {
  const out: FunnelRow[] = [];
  for (const s of ctx.savings) {
    if (s.mechanism !== "searchDistill") continue;
    if (typeof s.rawTokens !== "number" || typeof s.slimTokens !== "number" || !s.tool) continue;
    const pct = s.rawTokens > 0 ? Math.round((1 - s.slimTokens / s.rawTokens) * 100) : 0;
    if (pct < MIN_DISTILL_PCT) continue;
    out.push({ tool: s.tool, rawTokens: s.rawTokens, slimTokens: s.slimTokens, pct });
  }
  return out;
}

/** Aggregate-scope "kept out" slices (patch / template, etc.), filtered to real savings so a
 *  0-token event never renders a "patch · 0" wart. searchDistill is EXCLUDED here — it's already
 *  shown as the per-search funnel rows above, so listing it again is pure duplication. */
export function funnelAggregateRows(ctx: DrillContext): InsSavings[] {
  return ctx.savings.filter(
    (s) => s.scope === "aggregate" && s.tokensSaved > 0 && s.mechanism !== "searchDistill",
  );
}

function fmtTok(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

// Map a replay-measurement tool name (camelCase) to the client tool-call name (snake_case),
// so a funnel row can find the slim payload the model actually received. Live size-stats
// rows already carry the snake_case tool name, so lookups fall back to the row's own tool.
const MEASURE_TO_TOOLNAME: Record<string, string> = {
  flightSearch: "flight_search", flightList: "flight_list",
  hotelSearch: "hotel_search", hotelList: "hotel_list",
};

function FunnelView({ ctx }: { ctx: DrillContext }) {
  const rows = funnelRows(ctx);
  const aggregate = funnelAggregateRows(ctx);
  if (rows.length === 0 && ctx.savedHeadline <= 0 && aggregate.length === 0) {
    return <p className="ins-note">Context-economics detail appears once the model starts working.</p>;
  }
  return (
    <div className="ins-funnel">
      {rows.length > 0 && (
        <p className="ins-note">
          Each supplier search returns a large raw payload; the model only ever sees the slim,
          distilled version. The eliminated slice never enters context.
        </p>
      )}
      {rows.map((r, i) => {
        const slimFrac = r.rawTokens > 0 ? r.slimTokens / r.rawTokens : 1;
        const slim = ctx.tools.filter((t) => t.name === (MEASURE_TO_TOOLNAME[r.tool] ?? r.tool)).slice(-1)[0];
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
      {/* Aggregate "kept out" total + slices (relocated from the old always-visible ins-saved). */}
      <div className="ins-funnel-agg">
        <div className="ins-funnel-aggtotal">≈ {fmtTok(ctx.savedHeadline)} tokens kept out of context</div>
        <ul>
          {aggregate.map((s, i) => (
            <li key={i}><b>{s.mechanism}</b> · {fmtTok(s.tokensSaved)} — {s.detail}</li>
          ))}
          {ctx.perTurnDelta > 0 && (
            <li><b>toolCatalog</b> · ~{fmtTok(ctx.perTurnDelta)}/turn × {ctx.turnsTotal} turns = {fmtTok(ctx.perTurnTotal)} — fewer tool schemas sent each turn</li>
          )}
        </ul>
        {ctx.templateMax > 0 && (
          <p className="ins-note">Deterministic render estimate — ≈ {fmtTok(ctx.templateMax)} tokens the model never generated (folio is a server-side template render, counterfactual — not summed above).</p>
        )}
        <p className="ins-note ins-funnel-tokens">
          {fmtTok(ctx.tokensIn)} in · {fmtTok(ctx.tokensOut)} out · {fmtTok(ctx.cacheRead)} cache-read
          {ctx.hitRate != null ? ` · cache hit ${Math.round(ctx.hitRate * 100)}%` : ""}
        </p>
      </div>
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
      {ctx.routedModels.length > 1 && (
        <>
          <p className="ins-note">Routed across: {ctx.routedModels.map((m) => `${usd(ctx.actualByModel[m])} ${MODEL_LABELS[m as ModelId] ?? m}`).join(" + ")}.</p>
          <p className="ins-note">Routing splits models, so caches don't carry across the switch — cache writes are re-paid; the actual figure above already reflects that.</p>
        </>
      )}
      {ctx.proWindow != null && ctx.freshTokens > 0 && (
        <p className="ins-note ins-tierline">
          This trip ≈ <b>{((ctx.freshTokens / ctx.proWindow) * 100).toFixed(ctx.freshTokens / ctx.proWindow < 0.01 ? 2 : 0)}%</b> of a Pro 5-hr window (new tokens; cached context not counted) ·{" "}
          <a href="/info/cost-engineering" target="_blank" rel="noreferrer">how this is estimated →</a>
        </p>
      )}
      <CrossSessionBlock stats={ctx.stats} />
    </div>
  );
}

/** Cumulative cross-session aggregates (public). Renders nothing until the demo has history. */
function CrossSessionBlock({ stats }: { stats: StatsResponse | null }) {
  if (!stats || stats.exchanges <= 0) return null;
  const split = (["haiku", "sonnet", "opus"] as const).filter((k) => stats.byModel[k] > 0);
  return (
    <div className="ins-allsessions">
      <h5>Across all sessions</h5>
      <p className="ins-note">Cumulative demo usage — every trip built here. The marginal-cost-≈-$0 flex, in real numbers.</p>
      <div className="ins-scoreboard">
        <div><b>{fmtTok(stats.trips)}</b> trips planned · <b>{fmtTok(stats.sessions)}</b> sessions · <b>{fmtTok(stats.exchanges)}</b> exchanges</div>
        <div>≈ <b>{fmtTok(stats.totalSavedTokens)}</b> tokens kept out of context <span className="ins-note">(estimated)</span></div>
        <div>
          Total inference cost <b>{usd(stats.totalActualCostUsd)}</b>
          {split.length > 1 && (
            <span className="ins-note"> — {split.map((k) => `${usd(stats.byModel[k])} ${k[0].toUpperCase()}${k.slice(1)}`).join(" + ")}</span>
          )}
          {stats.byModel.other > 0 && (
            <span className="ins-note"> · {usd(stats.byModel.other)} other</span>
          )}
        </div>
      </div>
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
  const ov = ctx.overhead;
  return (
    <div className="ins-gantt">
      <div className="ins-gantt-head">{ctx.turnsTotal} turns · {ctx.tools.length} tool calls</div>
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

      {ctx.phases.length > 0 && (
        <div className="ins-workflow">
          <h5>Workflow engine</h5>
          <div className="ins-phase-trail">
            {ctx.phases.map((p, i) => (
              <span key={i} className="ins-phase-step">{p.phase}{i < ctx.phases.length - 1 ? " → " : ""}</span>
            ))}
          </div>
          <p className="ins-note">The server-side phase machine drives each step; the model executes one instruction at a time.</p>
        </div>
      )}

      <div className="ins-overhead">
        <h5>Observer effect — the cost of measuring</h5>
        <div>Added model tokens: <b>0</b> (inspector data is a side channel, never in context)</div>
        {ov && <div>Inspector client payload: <b>{(ov.instrumentationBytes / 1024).toFixed(1)} KB</b></div>}
        <div>Instrumentation CPU: <b>{!ov ? "—" : (ov.instrumentationMs != null ? `${ov.instrumentationMs} ms` : "below timer resolution")}</b></div>
      </div>
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

// ---- View 5: Data-store operations (projected production KV/D1) ----

function StoresView({ ctx }: { ctx: DrillContext }) {
  if (ctx.stores.length === 0) {
    return <p className="ins-note">Projected KV/D1 ops appear once the session mutates a store (a save or a patch).</p>;
  }
  return <StoreOpsWidget stores={ctx.stores} />;
}

// ---- View 6: Trip integrity (server-side validation checks) ----
// Inlined here (not imported from Inspector) to keep the drill module free of a
// runtime cycle back into Inspector.tsx — it's the same ~15-line checks list.

function IntegrityView({ ctx }: { ctx: DrillContext }) {
  const items = ctx.validations;
  if (items.length === 0) {
    return <p className="ins-note">Trip-integrity checks appear once the system validates the trip (after the first build step).</p>;
  }
  const glyph = (s: InsValidation["status"]) => (s === "fail" ? "✗" : s === "repaired" ? "↻" : "✓");
  return (
    <ul className="ins-checks">
      {items.map((v, i) => (
        <li key={i} className={`ins-check ins-check-${v.status}`}>
          <span className="ins-check-glyph" aria-hidden="true">{glyph(v.status)}</span>
          <span className="ins-check-main">
            <span className="ins-check-label">{v.label}</span>
            {v.detail && <span className="ins-check-detail">{v.detail}</span>}
          </span>
          {v.status === "repaired" && <span className="ins-check-tag">repaired</span>}
        </li>
      ))}
    </ul>
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
  { id: "stores", title: "Data-store operations", trigger: { kind: "stat", statKey: "persistedWrites" },
    render: (ctx) => <StoresView ctx={ctx} /> },
  { id: "integrity", title: "Trip integrity", trigger: { kind: "stat", statKey: "validation" },
    render: (ctx) => <IntegrityView ctx={ctx} /> },
];

export function drillForStat(statKey: string): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "stat" && d.trigger.statKey === statKey);
}
export function pipelineDrill(): Drill | undefined {
  return DRILLS.find((d) => d.trigger.kind === "pipeline");
}
