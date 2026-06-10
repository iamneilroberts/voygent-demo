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
