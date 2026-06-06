import { useState } from "react";
import { PLAN_TIERS, TIER_DISCLAIMER, TIER_SOURCES } from "./inspector-data";

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

export function Inspector(
  { open, onClose, tools, turns, summaries }:
  { open: boolean; onClose: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[] },
) {
  const [showCost, setShowCost] = useState(false);
  if (!open) return null;

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

  return (
    <aside className="inspector" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong>Engineering Inspector</strong>
        <button className="ins-close" onClick={onClose} aria-label="Close inspector">×</button>
      </div>

      <section className="ins-region">
        <h3>Live this session</h3>

        <div className="ins-graph">
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`ins-node ${stageActive(s) ? "on" : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="ins-arrow">→</span> : null}
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
      </section>
    </aside>
  );
}
