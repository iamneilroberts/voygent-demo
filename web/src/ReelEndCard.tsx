// web/src/ReelEndCard.tsx
// The next-chapter CTA shape shared by both end surfaces (ReelEndCard, ReelExplore).
export interface NextChapterCta { label: string; onClick: () => void }

const DEFAULT_RECAP = ["✈ live flights", "🏨 live hotels", "↩ self-corrected", "◇ context cached", "low cost"];
const DEFAULT_EYEBROW = "✓ That was a real session";
const DEFAULT_TITLE = "Now it's your turn";
const DEFAULT_BLURB = "Everything you just watched was a real Voygent run. Nothing in the results was scripted.";

export function ReelEndCard(
  { onTryYourself, onReplay, recap, eyebrow, title, blurb, nextChapter }:
  { onTryYourself: () => void; onReplay: () => void;
    // Per-reel overrides; absent → the "real session" copy (honest for the real
    // dublin-oct recording). The scripted collab reel passes its own honest framing.
    recap?: string[]; eyebrow?: string; title?: string; blurb?: string;
    // When the reel has a next chapter, it becomes the primary CTA.
    nextChapter?: NextChapterCta },
) {
  const chips = recap ?? DEFAULT_RECAP;
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label={eyebrow ?? DEFAULT_EYEBROW}>
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">{eyebrow ?? DEFAULT_EYEBROW}</div>
        <h2 className="cl-reel-h">{title ?? DEFAULT_TITLE}</h2>
        <p className="cl-reel-p">{blurb ?? DEFAULT_BLURB}</p>
        <div className="cl-reel-recap">{chips.map((r) => <span key={r}>{r}</span>)}</div>
        {nextChapter && (
          <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={nextChapter.onClick}>{nextChapter.label}</button>
        )}
        <button type="button" className={`cl-reel-btn ${nextChapter ? "cl-reel-btn-secondary" : "cl-reel-btn-primary"}`} onClick={onTryYourself}>Build your own trip →</button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onReplay}>↺ Replay the demo</button>
      </div>
    </div>
  );
}
