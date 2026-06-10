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
