import type { ReelEngPanel as ReelEngPanelData } from "./lib/recording";

// A brief peek at the engineering view (reel only): a small panel that slides in from
// the right showing the REAL tools the assistant has called so far, plus (QA4) a
// representative telemetry block — cost, tokens in/out, cache savings — sized like a
// real run and labelled "representative". The live demo's Inspector carries the real
// numbers. Non-interactive; the reel drives it via engpanel snapshots.
export function ReelEngPanel({ view }: { view: ReelEngPanelData }) {
  return (
    <div className="cl-eng-peek" role="dialog" aria-modal="false" aria-label="Engineering view" data-reel-target="eng-panel">
      <div className="cl-eng-peek-head">
        <span className="cl-eng-peek-dot" aria-hidden="true">▌</span>
        <span className="cl-eng-peek-title">Engineering view</span>
        <span className="cl-eng-peek-tag">{view.metrics ? "representative" : "live"}</span>
      </div>
      <div className="cl-eng-peek-sub">{view.tools.length} tool calls so far</div>
      <ul className="cl-eng-peek-list">
        {view.tools.map((t, i) => (
          <li key={i} className={`cl-eng-peek-row ${t.status}`}>
            <span className="cl-eng-peek-mark" aria-hidden="true">{t.status === "running" ? "⟳" : "✓"}</span>
            <code>{t.name}</code>
          </li>
        ))}
      </ul>
      {view.metrics && view.metrics.length > 0 && (
        <dl className="cl-eng-peek-metrics">
          {view.metrics.map((m) => (
            <div key={m.label} className={`cl-eng-peek-metric${m.accent ? " accent" : ""}`}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {view.footnote && <div className="cl-eng-peek-foot">{view.footnote}</div>}
    </div>
  );
}
