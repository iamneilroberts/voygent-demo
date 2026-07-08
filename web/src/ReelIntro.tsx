// web/src/ReelIntro.tsx
export function ReelIntro(
  { title, blurb, durationLabel, onWatch, onPlanYourOwn, eyebrow, note, chapters, onChapter }:
  { title: string; blurb: string; durationLabel: string; onWatch: () => void; onPlanYourOwn: () => void;
    // Per-reel overrides. Default = "real session" framing (honest for the real
    // dublin-oct recording); the scripted collab reel passes its own honest copy.
    eyebrow?: string; note?: string;
    // The story arc, so visitors can see there is more than one chapter.
    chapters?: { id: string; title: string; durationLabel: string; current: boolean }[];
    onChapter?: (id: string) => void },
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
        {chapters && chapters.length > 1 && (
          <div className="cl-reel-chapters" role="list" aria-label="All chapters">
            {chapters.map((c) => c.current
              ? <span key={c.id} role="listitem" className="cl-reel-chapter on" aria-current="true">{c.title}<i>watching</i></span>
              : <button key={c.id} role="listitem" type="button" className="cl-reel-chapter" onClick={() => onChapter?.(c.id)}>{c.title}<i>{c.durationLabel}</i></button>)}
          </div>
        )}
      </div>
    </div>
  );
}
