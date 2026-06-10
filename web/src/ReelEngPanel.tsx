import type { ReelEngPanel as ReelEngPanelData } from "./lib/recording";

// A brief peek at the engineering view (reel only): a small panel that slides in from
// the right showing the REAL tools the assistant has called so far, so viewers learn
// the interactive demo has an engineering view. Deliberately shows NO cost/token data —
// those would be fabricated on a scripted reel; the footnote points to the live demo
// for the full metrics. Non-interactive; the reel drives it via engpanel snapshots.
export function ReelEngPanel({ view }: { view: ReelEngPanelData }) {
  return (
    <div className="cl-eng-peek" role="dialog" aria-modal="false" aria-label="Engineering view" data-reel-target="eng-panel">
      <div className="cl-eng-peek-head">
        <span className="cl-eng-peek-dot" aria-hidden="true">▌</span>
        <span className="cl-eng-peek-title">Engineering view</span>
        <span className="cl-eng-peek-tag">live</span>
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
      {view.footnote && <div className="cl-eng-peek-foot">{view.footnote}</div>}
    </div>
  );
}
