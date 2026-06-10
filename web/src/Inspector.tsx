import { useState, useRef, useEffect, type ReactNode } from "react";
import type { EngState } from "./lib/inspector-state";
import { PLAN_TIERS } from "./inspector-data";
import { costWeightedTokens, cacheHitRate } from "./lib/usage";
import { MODEL_LABELS, PHASES, PHASE_LABELS, type ModelId, type PhaseModelMap, type Phase } from "../../shared/models";
import type { SelectorMode } from "./lib/model";
import type { StatsResponse } from "../../shared/events";
import { StoreOpsWidget, type InsStore } from "./StoreOpsWidget";
import { storeOpsForTool } from "../../worker/storeops";
import { buildStats, railStats, deepDiveLinks } from "./lib/inspector-stats";

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

const STAGES: { key: string; label: string; tools: string[] }[] = [
  { key: "create",  label: "Create",  tools: ["save_trip"] },
  { key: "search",  label: "Search",  tools: ["flight_search", "hotel_search"] },
  { key: "distill", label: "Distill", tools: ["flight_list", "hotel_list"] },
  { key: "stage",   label: "Stage",   tools: ["patch_trip"] },
  { key: "promote", label: "Promote", tools: ["promote_flights", "promote_hotels_to_lodging"] },
  { key: "render",  label: "Render",  tools: [] },
];

function fmt(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function usd(n: number): string { return `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`; }
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

// Trip-Integrity checks. Renders nothing until a validation event fires, so the
// live (non-replay) path never shows an empty/implied-pass panel.
function ValidationSection({ items }: { items: InsValidation[] }) {
  if (items.length === 0) return null;
  const glyph = (s: InsValidation["status"]) => (s === "fail" ? "✗" : s === "repaired" ? "↻" : "✓");
  return (
    <section className="ins-region ins-validation">
      <h3>Trip integrity</h3>
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
    </section>
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
  { state, onToggleCollapse, tools, turns, summaries, savings, overhead, headExtra, routing, stats, stores, validations, phases, busy }:
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
    phases?: { phase: string; via: string }[] },
) {
  const [showCost, setShowCost] = useState(true);  // cost shown by default (Neil 2026-06-07)
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
  // Cost-weighted (reads 0.1x, writes 1.25x) — the raw in+cacheRead sum read
  // 5-10x pessimistic against the sub-window estimate once the moving cache
  // breakpoint landed. See lib/usage.ts.
  const usage = { inputTokens: tokensIn, cacheReadTokens: cacheRead, cacheCreationTokens: cacheWrite };
  const sessionTokens = costWeightedTokens(usage);
  const hitRate = cacheHitRate(usage);
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

  // Registry-driven stats (single source for the rail, the panel, and the deep dives).
  // Named regStats to avoid the cross-session `stats` prop above.
  const regStats = buildStats({
    mcpToolsExposed: latest ? latest.exposedToolCount : 0,
    distinctTools: firedTools.size,
    persistedWrites,
    contextKeptOut: savedHeadline,
    observedCostUsd: actualCost,
    cacheHitRate: hitRate ?? 0,
  });
  // Active phase for the rail: the phase trail's last entry, else the latest lit stage.
  const activePhase = phases && phases.length ? phases[phases.length - 1].phase
    : ([...STAGES].reverse().find(stageActive)?.label ?? "Working");

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

      {/* 10-second read: the whole system at a glance. Detail stays in the sections below. */}
      <section className="ins-region ins-summary" aria-label="Run summary">
        <div className="ins-strip">
          <div className="ins-stat" data-stat="exposedTools">
            <span className="ins-stat-n">{latest ? latest.exposedToolCount : "—"}</span>
            <span className="ins-stat-l">MCP tools exposed</span>
          </div>
          <div className="ins-stat" data-stat="distinctTools">
            <span className="ins-stat-n">{firedTools.size}</span>
            <span className="ins-stat-l">distinct tools</span>
            <span className="ins-stat-sub">{tools.length} call{tools.length === 1 ? "" : "s"}</span>
          </div>
          <div className="ins-stat" data-stat="persistedWrites">
            <span className="ins-stat-n">{persistedWrites}</span>
            <span className="ins-stat-l">persisted writes</span>
          </div>
          <div className="ins-stat" data-stat="contextKeptOut">
            <span className="ins-stat-n">≈{fmt(savedHeadline)}</span>
            <span className="ins-stat-l">context kept out</span>
          </div>
          <div className="ins-stat" data-stat="observedCost">
            <span className="ins-stat-n ins-stat-cost">{usd(actualCost)}</span>
            <span className="ins-stat-l">observed cost</span>
          </div>
          {valTotal > 0 && (
            <div className="ins-stat" data-stat="validation">
              <span className={`ins-stat-n ${valFail ? "ins-stat-warn" : "ins-stat-ok"}`}>{valOk}/{valTotal}</span>
              <span className="ins-stat-l">validation</span>
            </div>
          )}
        </div>
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

        {/* Stats sit directly under the pipe (at the top of the section); the tool
            log scrolls in its own fixed pane below so it never pushes these down. */}
        <div className="ins-scoreboard">
          <div>{turns.length} turns · {tools.length} tool calls</div>
          {latest && <div>{latest.exposedToolCount} of {latest.fullToolCount} tools exposed</div>}
          <div>{fmt(tokensIn)} in · {fmt(tokensOut)} out · {fmt(cacheRead)} cache-read</div>
          {hitRate != null && (
            <div className="ins-hitrate">
              cache hit rate <b>{(hitRate * 100).toFixed(0)}%</b> · ≈{fmt(sessionTokens)} cost-weighted tokens
            </div>
          )}
        </div>

        <div className="ins-timeline" ref={timelineRef}>
          {tools.length === 0 ? <p className="ins-empty">No tool calls yet — start planning a trip.</p>
            : tools.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>

        <div className="ins-cost">
          <button className="ins-toggle" onClick={() => setShowCost((s) => !s)}>
            {showCost ? "hide $" : "show $"}
          </button>
          {showCost && latest && (
            <div className="ins-cost-rows">
              <div className="ins-actualcost">Observed routed cost <b>{usd(actualCost)}</b>{routedModels.length > 1
                ? ` — ${routedModels.map((m) => `${usd(actualByModel[m])} ${MODEL_LABELS[m as ModelId] ?? m}`).join(" + ")}` : ""}</div>
              <div className="ins-note">Counterfactual estimate — same usage priced as one tier: <b>{usd(cost.haiku)}</b> haiku · <b>{usd(cost.sonnet)}</b> sonnet · <b>{usd(cost.opus)}</b> opus</div>
              {routedModels.length > 1 && <div className="ins-note">Routing splits models, so caches don't carry across the switch — cache writes are re-paid; the actual figure above already reflects that.</div>}
            </div>
          )}
          {proWindow != null && sessionTokens > 0 && (
            <div className="ins-tierline">
              This trip ≈ <b>{((sessionTokens / proWindow) * 100).toFixed(sessionTokens / proWindow < 0.01 ? 2 : 0)}%</b> of a Pro 5-hr window (cost-weighted) ·{" "}
              <a href="/info/cost-engineering" target="_blank" rel="noreferrer">how this is estimated →</a>
            </div>
          )}
        </div>

        <div className="ins-saved">
          <h4>Context kept out of the model</h4>
          <div className="ins-saved-total">≈ {fmt(savedHeadline)} tokens kept out of context</div>
          <ul>
            {savings.filter((s) => s.scope === "aggregate").map((s, i) => (
              <li key={i}><b>{s.mechanism}</b> · {fmt(s.tokensSaved)} — {s.detail}</li>
            ))}
            {perTurnDelta > 0 && (
              <li><b>toolCatalog</b> · ~{fmt(perTurnDelta)}/turn × {turnsTotal} turns = {fmt(perTurnTotal)} — fewer tool schemas sent each turn</li>
            )}
          </ul>
          {templateMax > 0 && (
            <div className="ins-note">Deterministic render estimate — ≈ {fmt(templateMax)} tokens the model never generated (folio is a server-side template render, counterfactual — not summed above).</div>
          )}
        </div>

        <div className="ins-overhead">
          <h4>Observer effect — the cost of measuring</h4>
          <div>Added model tokens: <b>0</b> (inspector data is a side channel, never in context)</div>
          {ov && <div>Inspector client payload: <b>{(ov.instrumentationBytes / 1024).toFixed(1)} KB</b></div>}
          <div>Instrumentation CPU: <b>{!ov ? "—" : (ov.instrumentationMs != null ? `${ov.instrumentationMs} ms` : "below timer resolution")}</b></div>
        </div>

        {phases && phases.length > 0 && (
          <div className="ins-workflow">
            <h4>Workflow engine</h4>
            <div className="ins-phase-trail">
              {phases.map((p, i) => (
                <span key={i} className="ins-phase-step">{p.phase}{i < phases.length - 1 ? " → " : ""}</span>
              ))}
            </div>
            <p className="ins-note">The server-side phase machine drives each step; the model executes one instruction at a time.</p>
          </div>
        )}
      </section>

      <ValidationSection items={vals} />

      <StoreOpsWidget stores={stores ?? []} />

      {stats && stats.exchanges > 0 && (() => {
        const split = (["haiku", "sonnet", "opus"] as const).filter((k) => stats.byModel[k] > 0);
        return (
          <section className="ins-region ins-allsessions">
            <h3>Across all sessions</h3>
            <p className="ins-note">Cumulative demo usage — every trip built here. The marginal-cost-≈-$0 flex, in real numbers.</p>
            <div className="ins-scoreboard">
              <div><b>{fmt(stats.trips)}</b> trips planned · <b>{fmt(stats.sessions)}</b> sessions · <b>{fmt(stats.exchanges)}</b> exchanges</div>
              <div>≈ <b>{fmt(stats.totalSavedTokens)}</b> tokens kept out of context <span className="ins-note">(estimated)</span></div>
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
          </section>
        );
      })()}

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
