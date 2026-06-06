import { useState, type ReactNode } from "react";
import type { EngState } from "./lib/inspector-state";
import { PLAN_TIERS, TIER_DISCLAIMER, TIER_SOURCES, BTS_CARDS, BTS_DISCLAIMER, VOYGENT_PRICE_POINTS, USAGE_SCENARIOS, BIZ_ASSUMPTION } from "./inspector-data";

export interface InsTool {
  type: "inspector"; kind: "tool"; exchangeId: string; turn: number;
  name: string; args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean;
}
export interface InsTurn {
  type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number;
}
export interface InsSummary {
  type: "inspector"; kind: "summary"; exchangeId: string;
  turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  costByModel: { haiku: number; sonnet: number; opus: number };
}
export interface InsSavings {
  type: "inspector"; kind: "savings"; exchangeId: string;
  mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
  tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string;
}
export interface InsOverhead {
  type: "inspector"; kind: "overhead"; exchangeId: string;
  instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
  folioReprojectMs?: number | null; note?: string;
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

function Card({ c }: { c: { title: string; claim: string; detail: string; source: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ins-card">
      <button className="ins-card-head" onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} {c.title}</button>
      {open && <div className="ins-card-body"><p>{c.claim}</p><p className="ins-note">{c.detail}</p><code className="ins-src">{c.source}</code></div>}
    </div>
  );
}

export function Inspector(
  { state, onToggleCollapse, tools, turns, summaries, savings, overhead, headExtra }:
  { state: EngState; onToggleCollapse: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[]; savings: InsSavings[]; overhead: InsOverhead[];
    // Extra controls shown under the head when live — e.g. the palette switcher
    // relocated here in the claude skin (its home header isn't rendered there).
    headExtra?: ReactNode },
) {
  const [showCost, setShowCost] = useState(false);

  // Quiet rail: idle (pre-trip) or manually collapsed → render a thin vertical
  // affordance instead of the full panel. Idle renders nothing interactive; the
  // heavy body (and its focusable controls) is not in the tab order until live.
  if (state !== "live") {
    return (
      <aside className="inspector term crt collapsed" role="complementary" aria-label="Engineering inspector">
        {state === "idle" ? (
          <div className="ins-rail" aria-hidden="true">
            <span className="ins-rail-label">Engineering</span>
          </div>
        ) : (
          <button className="ins-rail" onClick={onToggleCollapse} aria-label="Expand engineering inspector">
            <span className="ins-rail-label">Engineering</span>
            <span className="ins-rail-caret" aria-hidden="true">▸</span>
          </button>
        )}
      </aside>
    );
  }

  const firedTools = new Set(tools.map((t) => t.name));
  const hasFolio = tools.some((t) => t.name.startsWith("promote_"));
  const stageActive = (s: typeof STAGES[number]) =>
    s.key === "render" ? hasFolio : s.tools.some((n) => firedTools.has(n));

  const tokensIn = turns.reduce((a, t) => a + t.inputTokens, 0);
  const tokensOut = turns.reduce((a, t) => a + t.outputTokens, 0);
  const cacheRead = turns.reduce((a, t) => a + t.cacheReadTokens, 0);
  const latest = summaries[summaries.length - 1];
  const cost = summaries.reduce(
    (a, s) => ({ haiku: a.haiku + s.costByModel.haiku, sonnet: a.sonnet + s.costByModel.sonnet, opus: a.opus + s.costByModel.opus }),
    { haiku: 0, sonnet: 0, opus: 0 },
  );
  const sessionTokens = tokensIn + cacheRead;

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

  return (
    <aside className="inspector term crt" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong><span className="prompt">▌</span> Engineering Inspector</strong>
        <button className="ins-collapse" onClick={onToggleCollapse} aria-label="Collapse inspector">▾</button>
      </div>
      {headExtra && <div className="ins-extra">{headExtra}</div>}

      <section className="ins-region">
        <h3>Live this session</h3>

        <div className="pipe">
          {STAGES.some(stageActive) && <span className="packet" aria-hidden="true" />}
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`node ${stageActive(s) ? "active" : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="arr">→</span> : null}
            </span>
          ))}
        </div>

        <div className="ins-timeline">
          {tools.length === 0 ? <p className="ins-empty">No tool calls yet — start planning a trip.</p>
            : tools.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>

        <div className="ins-scoreboard">
          <div>{turns.length} turns · {tools.length} tool calls</div>
          {latest && <div>{latest.exposedToolCount} of {latest.fullToolCount} tools exposed</div>}
          <div>{fmt(tokensIn)} in · {fmt(tokensOut)} out · {fmt(cacheRead)} cache-read</div>
        </div>

        <div className="ins-cost">
          <button className="ins-toggle" onClick={() => setShowCost((s) => !s)}>
            {showCost ? "hide $" : "show $"}
          </button>
          {showCost && latest && (
            <div className="ins-cost-rows">
              <div>This session, API-equivalent: <b>{usd(cost.haiku)}</b> haiku · <b>{usd(cost.sonnet)}</b> sonnet · <b>{usd(cost.opus)}</b> opus</div>
            </div>
          )}
          <table className="ins-tiers">
            <thead><tr><th>Plan</th><th>$/mo</th><th>~tok / 5-hr window</th></tr></thead>
            <tbody>
              {PLAN_TIERS.map((p) => {
                const pct = p.windowTokens ? Math.min(100, (sessionTokens / p.windowTokens) * 100) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>${p.priceMo}</td>
                    <td>{p.windowTokens ? `~${fmt(p.windowTokens)}${pct != null ? ` · this trip ≈ ${pct.toFixed(pct < 1 ? 2 : 0)}%` : ""}` : p.windowNote}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="ins-note">{TIER_DISCLAIMER}</p>
          <details className="ins-sources">
            <summary>how we estimate</summary>
            <p>Monthly estimate = window tokens × 1 fresh window/day × 30. Sources:</p>
            <ul>{TIER_SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
          </details>
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
            <div className="ins-note">Folio render: ≈ {fmt(templateMax)} tokens the model never generated (deterministic template, counterfactual — not summed above).</div>
          )}
        </div>

        <div className="ins-overhead">
          <h4>Observer effect — the cost of measuring</h4>
          <div>Added model tokens: <b>0</b> (inspector data is a side channel, never in context)</div>
          {ov && <div>Inspector client payload: <b>{(ov.instrumentationBytes / 1024).toFixed(1)} KB</b></div>}
          <div>Instrumentation CPU: <b>{!ov ? "—" : (ov.instrumentationMs != null ? `${ov.instrumentationMs} ms` : "below timer resolution")}</b></div>
        </div>
      </section>

      <section className="ins-region">
        <h3>Behind the scenes</h3>
        <p className="ins-note">{BTS_DISCLAIMER}</p>
        {BTS_CARDS.map((c) => <Card key={c.title} c={c} />)}
      </section>

      <section className="ins-region">
        <h3>The business case</h3>
        <p>Under the MCP model, Voygent's marginal inference cost is <b>$0</b> — your flat Claude subscription already paid for the tokens. You get frontier-model reasoning at a flat rate; a standalone app must meter, mark up, and bear billing/abuse/infra liability, and that cost compounds with volume and model tier.</p>
        {latest ? (
          <table className="ins-tiers">
            <thead><tr><th>Per month</th>{USAGE_SCENARIOS.map((s) => <th key={s.label}>{s.label} ({s.tripsMo})</th>)}</tr></thead>
            <tbody>
              {(["haiku", "sonnet", "opus"] as const).map((m) => (
                <tr key={m}>
                  <td>App (API, {m})</td>
                  {USAGE_SCENARIOS.map((s) => <td key={s.label}>{usd(cost[m] * s.tripsMo)}</td>)}
                </tr>
              ))}
              {VOYGENT_PRICE_POINTS.map((v) => (
                <tr key={v}><td>Voygent ${v} + your Claude sub</td>{USAGE_SCENARIOS.map((s) => <td key={s.label}>${v} + $0 inference</td>)}</tr>
              ))}
            </tbody>
          </table>
        ) : <p className="ins-note">Build a trip to populate the live cost basis.</p>}
        <p className="ins-note">{BIZ_ASSUMPTION}</p>
      </section>
    </aside>
  );
}
