import { useState, useRef, useEffect, type ReactNode } from "react";
import type { EngState } from "./lib/inspector-state";
import { PLAN_TIERS } from "./inspector-data";
import { cacheHitRate } from "./lib/usage";
import { MODEL_LABELS, PHASES, PHASE_LABELS, type ModelId, type PhaseModelMap, type Phase } from "../../shared/models";
import type { SelectorMode } from "./lib/model";
import type { StatsResponse } from "../../shared/events";
import { type InsStore } from "./StoreOpsWidget";
import { storeOpsForTool } from "../../worker/storeops";
import { buildStats, railStats, deepDiveLinks } from "./lib/inspector-stats";
import { DRILLS, drillForStat, pipelineDrill, type DrillContext, type DrillId } from "./lib/inspector-drills";

// Engineering stories moved out of the panel (task 6c) — the tab keeps live
// stats; the narratives live on worker-served /info pages.
const INFO_LINKS: { slug: string; label: string; blurb: string; comingSoon?: boolean }[] = [
  { slug: "context-economics", label: "Context economics", blurb: "router consolidation, distill-by-id, out-of-context rendering" },
  { slug: "cost-engineering", label: "Cost engineering", blurb: "prompt caching, the budget gate, the MCP $0-marginal-cost case" },
  { slug: "bot-defeat", label: "The bot-defeat saga", blurb: "edge-native anti-bot, with falsifiable verdicts" },
  { slug: "record-replay", label: "Record/replay engineering", blurb: "real data, deterministically, fabrication made impossible" },
  { slug: "trip-integrity", label: "Trip integrity", blurb: "server-side guards + self-heal — the validation checks above, explained" },
  { slug: "phase-machine", label: "Keeping the model on track", blurb: "the server-side phase machine driving the workflow trail above" },
  { slug: "production-system", label: "The system behind the demo", blurb: "119 tools, the commission firewall, AI-evaluates-AI" },
  { slug: "llm-options", label: "Choosing the model", blurb: "LLM-agnostic seam: frontier, cheap DeepSeek, local Ollama" },
  { slug: "data-stores", label: "KV, D1, and a SQL brain", blurb: "the hybrid storage model and the relational-DBA unlearning" },
  { slug: "subagents", label: "Subagents for the drudge work", blurb: "an email/offers agent that proposes and never disposes", comingSoon: true },
];

export interface InsTool {
  type: "inspector"; kind: "tool"; exchangeId: string; turn: number;
  name: string; args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean;
}
export interface InsTurn {
  type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number;
  model?: string;
}
export interface InsSummary {
  type: "inspector"; kind: "summary"; exchangeId: string;
  turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  costByModel: { haiku: number; sonnet: number; opus: number };
  actualCostUsd?: number; actualCostByModel?: Record<string, number>;
}
export interface InsSavings {
  type: "inspector"; kind: "savings"; exchangeId: string;
  mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
  tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string;
  rawTokens?: number; slimTokens?: number; tool?: string;
}
export interface InsOverhead {
  type: "inspector"; kind: "overhead"; exchangeId: string;
  instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
  folioReprojectMs?: number | null; note?: string;
}
export interface InsValidation {
  type: "inspector"; kind: "validation"; exchangeId: string;
  check: string; label: string; status: "pass" | "repaired" | "fail"; detail?: string;
}
export interface InsFanout {
  type: "inspector"; kind: "fanout"; exchangeId: string; tool: string;
  sources: { id: string; label: string; count: number; credentialed: boolean }[];
  shortlisted: number;
}

const STAGES: { key: string; label: string; tools: string[] }[] = [
  { key: "create",  label: "Create",  tools: ["save_trip"] },
  { key: "search",  label: "Search",  tools: ["flight_search", "hotel_search"] },
  { key: "distill", label: "Distill", tools: ["flight_list", "hotel_list"] },
  { key: "stage",   label: "Stage",   tools: ["patch_trip"] },
  { key: "promote", label: "Promote", tools: ["promote_flights", "promote_hotels_to_lodging"] },
  { key: "render",  label: "Render",  tools: [] },
];

function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

function ToolRow({ t }: { t: InsTool }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ins-tool ${t.ok ? "" : "err"}`}>
      <button className="ins-tool-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"} {t.name}</span>
        <span className="ins-lat">{t.latencyMs} ms {t.ok ? "✓" : "✗"}</span>
      </button>
      {open && (
        <pre className="ins-raw">{JSON.stringify({ args: t.args, result: safeParse(t.result) }, null, 2)}</pre>
      )}
    </div>
  );
}

export interface ModelRoutingUi {
  mode: SelectorMode;
  enabledModels: ModelId[];
  smartMap: PhaseModelMap;
  activePhase: Phase;
  onMode: (m: SelectorMode) => void;
  onSmartMap: (map: PhaseModelMap) => void;
}

export function Inspector(
  { state, onToggleCollapse, tools, turns, summaries, savings, overhead, headExtra, routing, stats, stores, validations, phases, fanouts, busy }:
  { state: EngState; onToggleCollapse: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[]; savings: InsSavings[]; overhead: InsOverhead[];
    // True while a turn is actively streaming (live send or reel replay). Drives the
    // "pipeline resting" settle so the packet stops once work actually stops.
    busy?: boolean;
    // Extra controls shown under the head when live — e.g. the palette switcher
    // relocated here in the claude skin (its home header isn't rendered there).
    headExtra?: ReactNode;
    routing?: ModelRoutingUi;
    // Cumulative cross-session aggregates (public). Section hidden when null/empty.
    stats?: StatsResponse | null;
    // Projected production KV/D1 ops for this session (Slice B). Empty until tools fire.
    stores?: InsStore[];
    // Trip-integrity checks the system ran this session. Empty until a validation event fires.
    validations?: InsValidation[];
    // Phase-machine trail: emitted when the server-side phase machine is active (flag-on).
    // Each entry is one phase transition. Absent when the flag is off — the block simply
    // doesn't render (guarded by phases?.length).
    phases?: { phase: string; via: string }[];
    // Supplier fan-out events: which adapters each consolidated hotel call aggregated.
    // Empty until a hotel search runs; drives the Supplier Fan-Out drill.
    fanouts?: InsFanout[] },
) {
  // The tool log is a fixed-height scroll pane (so it never pushes the sections
  // below it down the page). Keep the newest call in view as the stream lands.
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = timelineRef.current; if (el) el.scrollTop = el.scrollHeight; }, [tools.length]);

  // Derivations run for ALL states now: the live "peek" rail needs the same stats +
  // pipeline as the open panel (just rendered compactly). Only the final render branches.
  const firedTools = new Set(tools.map((t) => t.name));
  const hasFolio = tools.some((t) => t.name.startsWith("promote_"));
  // Distill rarely fires a distinct tool (the recording goes search → promote),
  // but it always emits a `searchDistill` savings event — the real signal that
  // candidates were ranked down. Without this the Distill node never lights up.
  const hasDistill = savings.some((s) => s.mechanism === "searchDistill");
  const stageActive = (s: typeof STAGES[number]) =>
    s.key === "render" ? hasFolio
      : s.key === "distill" ? (hasDistill || s.tools.some((n) => firedTools.has(n)))
        : s.tools.some((n) => firedTools.has(n));
  // The pipeline is at rest once the folio exists AND no turn is streaming: settle the
  // nodes to their done (green) state and stop the traveling packet. While work is still
  // flowing (enrichment after the first promote), the packet keeps moving.
  const pipelineDone = hasFolio && !busy;

  const tokensIn = turns.reduce((a, t) => a + t.inputTokens, 0);
  const tokensOut = turns.reduce((a, t) => a + t.outputTokens, 0);
  const cacheRead = turns.reduce((a, t) => a + t.cacheReadTokens, 0);
  const cacheWrite = turns.reduce((a, t) => a + t.cacheCreationTokens, 0);
  const latest = summaries[summaries.length - 1];
  const cost = summaries.reduce(
    (a, s) => ({ haiku: a.haiku + s.costByModel.haiku, sonnet: a.sonnet + s.costByModel.sonnet, opus: a.opus + s.costByModel.opus }),
    { haiku: 0, sonnet: 0, opus: 0 },
  );
  // MEASURED routed spend (sum of per-turn cost at each turn's model) — distinct
  // from the all-tier counterfactual above. Source of truth for "what this cost".
  const actualCost = summaries.reduce((a, s) => a + (s.actualCostUsd ?? 0), 0);
  const actualByModel: Record<string, number> = {};
  for (const s of summaries) for (const [m, c] of Object.entries(s.actualCostByModel ?? {})) actualByModel[m] = (actualByModel[m] ?? 0) + c;
  const routedModels = Object.keys(actualByModel).filter((m) => actualByModel[m] > 0);
  // Which model produced the observed-cost figure — shown as a sublabel under the
  // tile so "observed cost" never reads as attribution-free.
  const costModelLabel = routedModels.length === 1 ? (MODEL_LABELS[routedModels[0]] ?? routedModels[0])
    : routedModels.length > 1 ? "mixed" : undefined;
  // Cost-weighted (reads 0.1x, writes 1.25x) — the raw in+cacheRead sum read
  // 5-10x pessimistic against the sub-window estimate once the moving cache
  // breakpoint landed. See lib/usage.ts.
  const usage = { inputTokens: tokensIn, cacheReadTokens: cacheRead, cacheCreationTokens: cacheWrite };
  const hitRate = cacheHitRate(usage);
  // Fresh tokens = newly-processed input + output, EXCLUDING cached-context re-reads and
  // cache writes. The old cost-weighted figure counted a session's growing cached context
  // re-read every turn, so a single trip read as >100% of a Pro 5-hr window — backwards.
  // Fresh in+out is the honest "new work" figure and lands a trip at a small, sane share.
  const freshTokens = tokensIn + tokensOut;
  const proWindow = PLAN_TIERS.find((p) => p.id === "pro")?.windowTokens ?? null;

  // Honest context-saved model:
  //  - aggregate (patch, searchDistill): one-time savings, summed directly.
  //  - perTurn (toolCatalog): the same schema delta is withheld EVERY turn → one
  //    representative delta × total session turns (NOT summed across the repeated events).
  //  - perRender (template): counterfactual, shown separately as a latest/max, never summed.
  const turnsTotal = turns.length;
  const aggregateSum = savings.filter((s) => s.scope === "aggregate").reduce((a, s) => a + s.tokensSaved, 0);
  const perTurnDelta = savings.filter((s) => s.scope === "perTurn").reduce((m, s) => Math.max(m, s.tokensSaved), 0);
  const perTurnTotal = perTurnDelta * turnsTotal;
  const templateMax = savings.filter((s) => s.scope === "perRender").reduce((m, s) => Math.max(m, s.tokensSaved), 0);
  const savedHeadline = aggregateSum + perTurnTotal;
  const ov = overhead[overhead.length - 1];

  // Summary-strip derivations (10-second read). "Persisted writes" = mutating
  // store ops this session commits (KV put/delete; reads/queries excluded),
  // projected from the fired tools via the SAME production mapping the store-ops
  // widget uses — so it's correct whether or not the recording carries store events.
  const vals = validations ?? [];
  const persistedWrites = tools.reduce(
    (n, t) => n + storeOpsForTool(t.name).filter((o) => o.op === "put" || o.op === "delete").length, 0,
  );
  const valTotal = vals.length;
  const valOk = vals.filter((v) => v.status === "pass" || v.status === "repaired").length;
  const valFail = vals.some((v) => v.status === "fail");

  // Distinct supplier adapters genuinely queried this session (across all fan-out events).
  const fans = fanouts ?? [];
  const suppliersQueried = new Set(fans.flatMap((f) => f.sources.map((s) => s.id))).size;

  // Registry-driven stats (single source for the rail, the panel, and the deep dives).
  // Named regStats to avoid the cross-session `stats` prop above.
  const regStats = buildStats({
    mcpToolsExposed: latest ? latest.exposedToolCount : 0,
    distinctTools: firedTools.size,
    persistedWrites,
    contextKeptOut: savedHeadline,
    observedCostUsd: actualCost,
    cacheHitRate: hitRate ?? 0,
    suppliersQueried,
    costModelLabel,
  });
  // Active phase for the rail: the phase trail's last entry, else the latest lit stage.
  const activePhase = phases && phases.length ? phases[phases.length - 1].phase
    : ([...STAGES].reverse().find(stageActive)?.label ?? "Working");

  // Which drill is expanded in the open panel (single-open accordion). null = none.
  const [openDrill, setOpenDrill] = useState<DrillId | null>(null);
  const drillCtx: DrillContext = {
    tools, turns, summaries, savings, fanout: fans, phases: phases ?? [],
    savedHeadline, cost, actualCost, actualByModel,
    // Relocated detail (was always-visible; now read by the drills):
    tokensIn, tokensOut, cacheRead,
    freshTokens, hitRate, proWindow,
    routedModels,
    perTurnDelta, perTurnTotal, templateMax, turnsTotal,
    overhead: ov,
    stores: stores ?? [],
    validations: vals,
    stats: stats ?? null,
    exposedToolCount: latest?.exposedToolCount, fullToolCount: latest?.fullToolCount,
  };

  // ---- Resting states: idle (dim, pre-trip) and peek (LIVE skinny rail) ----
  if (state !== "open") {
    if (state === "idle") {
      return (
        <aside className="inspector term crt collapsed" role="complementary" aria-label="Engineering inspector">
          <div className="ins-rail" aria-hidden="true"><span className="ins-rail-label">Engineering</span></div>
        </aside>
      );
    }
    // peek: clickable live rail — phase, pipeline dots, top stats. Never auto-expands.
    return (
      <aside className="inspector term crt ins-peek" role="complementary" aria-label="Engineering inspector">
        <button className="ins-peekbtn" onClick={onToggleCollapse} aria-label="Expand engineering inspector">
          <span className="ins-peek-hint" aria-hidden="true">click to expand ⤢</span>
          <span className="ins-peek-label">Engineering</span>
          <span className="ins-peek-live"><span className="ins-peek-dot" aria-hidden="true" /> live</span>
          <span className="ins-peek-phase">{activePhase}</span>
          <span className="ins-peek-dots" aria-hidden="true">
            {STAGES.map((s) => (
              <span key={s.key} className={`ins-peek-pip ${stageActive(s) ? (pipelineDone ? "done" : "cur") : ""}`} />
            ))}
          </span>
          <span className="ins-peek-metrics">
            {railStats(regStats, 3).map((st) => (
              <span key={st.key} className="ins-peek-m">
                <span className={`ins-peek-v ${st.tone === "good" ? "good" : ""}`}>{st.value}</span>
                <span className="ins-peek-k">{st.label}</span>
              </span>
            ))}
          </span>
          <span className="ins-peek-grow" aria-hidden="true">⤢</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="inspector term crt" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong><span className="prompt">▌</span> Engineering Inspector</strong>
        <button className="ins-collapse" onClick={onToggleCollapse} aria-label="Collapse inspector">▾</button>
      </div>
      {headExtra && <div className="ins-extra">{headExtra}</div>}

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
                {st.sublabel && <span className="ins-stat-sub">{st.sublabel}</span>}
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
          {valTotal > 0 && (() => {
            // The validation tile is a special (non-registry) stat — its value/tone come
            // from the validations prop, not buildStats — but it drills into the integrity
            // view like any other tile.
            const drill = drillForStat("validation");
            const active = drill && openDrill === drill.id;
            const body = (
              <>
                <span className={`ins-stat-n ${valFail ? "ins-stat-warn" : "ins-stat-ok"}`}>{valOk}/{valTotal}</span>
                <span className="ins-stat-l">validation</span>
              </>
            );
            return drill ? (
              <button
                className={`ins-stat ins-stat-drill ${active ? "active" : ""}`}
                data-stat="validation"
                aria-expanded={active}
                onClick={() => setOpenDrill(active ? null : drill.id)}
              >
                {body}
                <span className="ins-stat-caret" aria-hidden="true">{active ? "▾" : "▸"}</span>
              </button>
            ) : (
              <div className="ins-stat" data-stat="validation">{body}</div>
            );
          })()}
        </div>
        {openDrill && (() => {
          // Only stat-triggered drills render here; pipeline drills (the waterfall) have their
          // own block under the pipe, so don't double-render them in the tile accordion.
          const d = DRILLS.find((x) => x.id === openDrill && x.trigger.kind === "stat");
          return d ? (
            <div className="ins-drill" role="region" aria-label={d.title}>
              <h4 className="ins-drill-title">{d.title}</h4>
              {d.render(drillCtx)}
            </div>
          ) : null;
        })()}
      </section>

      {routing && (
        <section className="ins-region ins-routing">
          <h3>Model routing</h3>
          {routing.mode === "smart" ? (
            <>
              <p className="ins-note">A model per phase. Active: <b>{PHASE_LABELS[routing.activePhase]}</b>.</p>
              <div className="ins-phases">
                {PHASES.map((ph) => (
                  <label key={ph} className={`ins-phase ${routing.activePhase === ph ? "active" : ""}`}>
                    <span className="ins-phase-name">{PHASE_LABELS[ph]}{routing.activePhase === ph ? " ←" : ""}</span>
                    <select
                      value={routing.smartMap[ph]}
                      onChange={(e) => routing.onSmartMap({ ...routing.smartMap, [ph]: e.target.value as ModelId })}
                    >
                      {routing.enabledModels.map((m) => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="ins-note"><b>{MODEL_LABELS[routing.mode as ModelId] ?? routing.mode}</b> drives every turn. Switch to <i>Smart</i> to route per phase.</p>
          )}
        </section>
      )}

      <section className="ins-region">
        <h3>Live this session</h3>

        <div className="pipe">
          {STAGES.some(stageActive) && !pipelineDone && <span className="packet" aria-hidden="true" />}
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`node ${stageActive(s) ? (pipelineDone ? "done" : "active") : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="arr">→</span> : null}
            </span>
          ))}
        </div>

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

        {/* The tool-call log is the only always-on detail under the pipe; all other
            session telemetry (cost, savings, overhead, phase trail, stores, integrity,
            cross-session) now lives behind the summary tiles as drill content. */}
        <div className="ins-timeline" ref={timelineRef}>
          {tools.length === 0 ? <p className="ins-empty">No tool calls yet — start planning a trip.</p>
            : tools.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>
      </section>

      {(() => {
        // Primary: deep dives tied to the stats actually shown this session (registry
        // order). Secondary: every other story, so nothing's unreachable.
        const primary = deepDiveLinks(regStats);
        const primarySlugs = new Set(primary.map((p) => p.slug));
        const bySlug = Object.fromEntries(INFO_LINKS.map((l) => [l.slug, l]));
        const secondary = INFO_LINKS.filter((l) => !primarySlugs.has(l.slug));
        return (
          <section className="ins-region ins-dig">
            <h3>Dig deeper</h3>
            <ul className="ins-links ins-links-stat">
              {primary.map((p) => {
                const info = bySlug[p.slug];
                return (
                  <li key={p.slug}>
                    <span className="ins-dig-stat">{p.statLabel}</span>
                    <a href={`/info/${p.slug}`} target="_blank" rel="noreferrer">{info?.blurb ?? info?.label ?? p.slug} →</a>
                  </li>
                );
              })}
            </ul>
            <h4 className="ins-dig-more">More on the engineering</h4>
            <ul className="ins-links">
              {secondary.map((l) => (
                <li key={l.slug}><a href={`/info/${l.slug}`} target="_blank" rel="noreferrer">{l.label} →</a>{l.comingSoon && <span className="ins-soon">soon</span>} <span className="ins-note">{l.blurb}</span></li>
              ))}
            </ul>
            <p className="ins-note ins-dig-foot">More stats and stories land here as the system grows.</p>
          </section>
        );
      })()}
    </aside>
  );
}
