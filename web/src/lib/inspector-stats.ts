// Inspector stats as DATA, so the rail, the panel tiles, and the deep-dive links all
// derive from one source. Adding a stat later = one registry entry: it shows in the
// panel automatically, in the rail if it has a `rail` priority, and links to its
// /info deep dive if it has a `deepDive` slug. See the design spec Part 2.

export interface InspectorStat {
  key: string;
  value: string;                       // pre-formatted for display
  label: string;
  tone?: "default" | "good";           // "good" = a savings/cost win (rendered green)
  rail?: number;                       // present = eligible for the rail; lower = higher priority
  bar?: number;                        // optional 0..1 fill (e.g. tokens-saved proportion)
  deepDive?: string;                   // /info slug this stat links to
  drill?: "funnel" | "costSim" | "waterfall" | "fanout" | "stores" | "integrity";   // expandable detail view this stat opens
}

// The metrics the Inspector already computes, passed in as plain values so this stays
// pure and unit-testable (the Inspector wires the real numbers in C4/C5).
export interface StatInput {
  mcpToolsExposed: number;
  distinctTools: number;
  persistedWrites: number;
  contextKeptOut: number;              // tokens kept out of the model (savedHeadline)
  observedCostUsd: number;             // measured routed spend
  cacheHitRate: number;                // 0..1
  suppliersQueried: number;            // distinct supplier adapters lit this session (fan-out)
  contextKeptOutBar?: number;          // optional 0..1 proportion for the rail fill bar
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
function fmtUsd(n: number): string {
  return `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
}

// The registry. Order here = panel-tile order and deep-dive-link order.
export function buildStats(i: StatInput): InspectorStat[] {
  return [
    { key: "mcpToolsExposed", value: fmtInt(i.mcpToolsExposed), label: "MCP tools exposed", rail: 3, deepDive: "production-system" },
    { key: "distinctTools", value: fmtInt(i.distinctTools), label: "distinct tools", deepDive: "production-system" },
    { key: "persistedWrites", value: fmtInt(i.persistedWrites), label: "persisted writes", deepDive: "data-stores", drill: "stores" },
    { key: "contextKeptOut", value: `≈${fmtInt(i.contextKeptOut)}`, label: "context kept out", tone: "good", rail: 1, bar: i.contextKeptOutBar, deepDive: "context-economics", drill: "funnel" },
    { key: "observedCost", value: fmtUsd(i.observedCostUsd), label: "observed cost", tone: "good", rail: 2, deepDive: "cost-engineering", drill: "costSim" },
    { key: "cacheHitRate", value: `${Math.round(i.cacheHitRate * 100)}%`, label: "cache hit rate", deepDive: "cost-engineering" },
    { key: "suppliersQueried", value: fmtInt(i.suppliersQueried), label: "suppliers queried", deepDive: "production-system", drill: "fanout" },
  ];
}

/** Rail-eligible stats, sorted by ascending `rail` priority, capped at `slots`. */
export function railStats(stats: InspectorStat[], slots: number): InspectorStat[] {
  return stats
    .filter((s): s is InspectorStat & { rail: number } => typeof s.rail === "number")
    .sort((a, b) => a.rail - b.rail)
    .slice(0, slots);
}

/** Distinct deep-dive slugs in registry order (for the panel's primary "Dig deeper" links). */
export function deepDiveLinks(stats: InspectorStat[]): { slug: string; statLabel: string }[] {
  const seen = new Set<string>();
  const out: { slug: string; statLabel: string }[] = [];
  for (const s of stats) {
    if (s.deepDive && !seen.has(s.deepDive)) {
      seen.add(s.deepDive);
      out.push({ slug: s.deepDive, statLabel: s.label });
    }
  }
  return out;
}
