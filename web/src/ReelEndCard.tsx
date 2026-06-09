// web/src/ReelEndCard.tsx
const RECAP = ["✈ live flights", "🏨 live hotels", "↩ self-corrected", "◇ context cached", "low cost"];

export function ReelEndCard(
  { onTryYourself, onReplay }: { onTryYourself: () => void; onReplay: () => void },
) {
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label="That was a real session">
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">✓ That was a real session</div>
        <h2 className="cl-reel-h">Now it&#39;s your turn</h2>
        <p className="cl-reel-p">Everything you just watched was a real Voygent run. Nothing in the results was scripted.</p>
        <div className="cl-reel-recap">{RECAP.map((r) => <span key={r}>{r}</span>)}</div>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={onTryYourself}>Try it yourself →</button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onReplay}>↺ Replay the demo</button>
      </div>
    </div>
  );
}
