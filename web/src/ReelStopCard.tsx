// web/src/ReelStopCard.tsx
// Shown when the viewer hits Stop mid-playback: pause the reel and offer the
// exit ramp into a free trial, without losing their place.
export function ReelStopCard(
  { onTrial, onResume, onReplay }:
  { onTrial: () => void; onResume: () => void; onReplay: () => void },
) {
  return (
    <div className="cl-reel-scrim cl-reel-stop" role="dialog" aria-modal="true" aria-label="Demo stopped">
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">Demo stopped</div>
        <h2 className="cl-reel-h">Ready to try it yourself?</h2>
        <p className="cl-reel-p">Sign up for a free trial and plan a real trip with live flights and hotels. All it takes is an email address.</p>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary cl-reel-btn-big" onClick={onTrial}>
          Start your free trial →
          <span className="cl-reel-btn-meta">live · real flights and hotels · type anything</span>
        </button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onResume}>▶ Keep watching</button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onReplay}>↺ Replay from the start</button>
      </div>
    </div>
  );
}
