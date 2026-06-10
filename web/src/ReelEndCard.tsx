// web/src/ReelEndCard.tsx
const DEFAULT_RECAP = ["✈ live flights", "🏨 live hotels", "↩ self-corrected", "◇ context cached", "low cost"];
const DEFAULT_EYEBROW = "✓ That was a real session";
const DEFAULT_TITLE = "Now it's your turn";
const DEFAULT_BLURB = "Everything you just watched was a real Voygent run. Nothing in the results was scripted.";

export function ReelEndCard(
  { onTryYourself, onReplay, recap, eyebrow, title, blurb }:
  { onTryYourself: () => void; onReplay: () => void;
    // Per-reel overrides; absent → the "real session" copy (honest for the real
    // dublin-oct recording). The scripted collab reel passes its own honest framing.
    recap?: string[]; eyebrow?: string; title?: string; blurb?: string },
) {
  const chips = recap ?? DEFAULT_RECAP;
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label={eyebrow ?? DEFAULT_EYEBROW}>
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">{eyebrow ?? DEFAULT_EYEBROW}</div>
        <h2 className="cl-reel-h">{title ?? DEFAULT_TITLE}</h2>
        <p className="cl-reel-p">{blurb ?? DEFAULT_BLURB}</p>
        <div className="cl-reel-recap">{chips.map((r) => <span key={r}>{r}</span>)}</div>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={onTryYourself}>Build your own trip →</button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onReplay}>↺ Replay the demo</button>
      </div>
    </div>
  );
}
