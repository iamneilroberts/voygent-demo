// web/src/ReelIntro.tsx
export function ReelIntro(
  { title, blurb, durationLabel, onWatch, onPlanYourOwn, eyebrow, note }:
  { title: string; blurb: string; durationLabel: string; onWatch: () => void; onPlanYourOwn: () => void;
    // Per-reel overrides. Default = "real session" framing (honest for the real
    // dublin-oct recording); the scripted collab reel passes its own honest copy.
    eyebrow?: string; note?: string },
) {
  const ey = eyebrow ?? "▶ Watch a real session";
  const nt = note ?? "Nothing in the results is scripted.";
  return (
    <div className="cl-reel-scrim" role="dialog" aria-modal="true" aria-label={ey}>
      <div className="cl-reel-card">
        <div className="cl-reel-eyebrow">{ey}</div>
        <h2 className="cl-reel-h">{title}</h2>
        <p className="cl-reel-p">{blurb}{nt ? ` ${nt}` : ""}</p>
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
