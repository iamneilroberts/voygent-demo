// web/src/ReelCallout.tsx
import { useEffect } from "react";
import type { Highlight } from "./lib/highlights";

export function ReelCallout(
  { highlight, dwellMs, onContinue }:
  { highlight: Highlight; dwellMs: number; onContinue: () => void },
) {
  // Auto-resume after dwell; the key on the element (App side) resets this per highlight.
  useEffect(() => {
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    const t = setTimeout(onContinue, reduced ? 0 : dwellMs);
    return () => clearTimeout(t);
  }, [dwellMs, onContinue]);

  return (
    <div className={`cl-reel-spotlight cl-reel-anchor-${highlight.anchor}`} role="note" aria-live="polite">
      <div className="cl-reel-callout">
        <div className="cl-reel-callout-ey">{highlight.eyebrow}</div>
        <h4 className="cl-reel-callout-h">{highlight.title}</h4>
        <p className="cl-reel-callout-b">{highlight.body}</p>
        <div className="cl-reel-callout-bar">
          <span className="cl-reel-prog"><i style={{ animationDuration: `${dwellMs}ms` }} /></span>
          <button type="button" className="cl-reel-continue" onClick={onContinue}>Continue ▶</button>
        </div>
      </div>
    </div>
  );
}
