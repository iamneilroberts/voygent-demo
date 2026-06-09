// web/src/ReelIntro.tsx
export function ReelIntro(
  { title, blurb, durationLabel, onWatch, onPlanYourOwn }:
  { title: string; blurb: string; durationLabel: string; onWatch: () => void; onPlanYourOwn: () => void },
) {
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label="Watch a real session">
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">▶ Watch a real session</div>
        <h2 className="cl-reel-h">{title}</h2>
        <p className="cl-reel-p">{blurb} Nothing in the results is scripted.</p>
        <button type="button" className="cl-reel-btn cl-reel-btn-primary" onClick={onWatch}>
          Watch the 2× replay<span className="cl-reel-btn-meta">{durationLabel}</span>
        </button>
        <button type="button" className="cl-reel-btn cl-reel-btn-secondary" onClick={onPlanYourOwn}>
          Plan your own trip instead<span className="cl-reel-btn-meta">live · type anything</span>
        </button>
      </div>
    </div>
  );
}
