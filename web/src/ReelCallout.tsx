import { useEffect, useLayoutEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Highlight } from "./lib/highlights";

// Resolve a highlight target key to a live DOM element.
//   "stat:<key>"  -> the engineering-panel stat card [data-stat="<key>"]
//   "<other>"     -> [data-reel-target="<other>"] (e.g. "board-flight")
function findTarget(target: string): HTMLElement | null {
  if (target.startsWith("stat:")) return document.querySelector<HTMLElement>(`[data-stat="${target.slice(5)}"]`);
  return document.querySelector<HTMLElement>(`[data-reel-target="${target}"]`);
}

interface Rect { top: number; left: number; width: number; height: number }

export function ReelCallout(
  { highlight, dwellMs, onContinue }:
  { highlight: Highlight; dwellMs: number; onContinue: () => void },
) {
  // rect = the target's viewport rect when it's on-screen; null => no/offscreen target (centered fallback).
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    const el = findTarget(highlight.target);
    if (!el) { setRect(null); return; }
    try { el.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch { /* ignore */ }
    const measure = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      setRect(visible ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    const raf = requestAnimationFrame(measure); // re-measure after scrollIntoView settles
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [highlight.target]);

  // Auto-resume after dwell (reduced-motion = instant).
  useEffect(() => {
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    const t = setTimeout(onContinue, reduced ? 0 : dwellMs);
    return () => clearTimeout(t);
  }, [dwellMs, onContinue]);

  // Card placement: prefer left of the target (stats sit on the right pane); else right; clamp to viewport.
  const CARD_W = 272, GAP = 14, MARGIN = 12;
  let cardStyle: CSSProperties;
  if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = rect.left >= CARD_W + GAP + MARGIN ? rect.left - CARD_W - GAP : rect.left + rect.width + GAP;
    left = Math.max(MARGIN, Math.min(left, vw - CARD_W - MARGIN));
    let top = Math.max(MARGIN, Math.min(rect.top + rect.height / 2 - 60, vh - 170));
    cardStyle = { position: "fixed", left, top, width: CARD_W };
  } else {
    cardStyle = { position: "fixed", left: "50%", top: "28%", width: CARD_W, transform: "translateX(-50%)" };
  }

  return (
    <div className="cl-reel-overlay" role="note" aria-live="polite">
      {rect
        ? <div className="cl-reel-spot" style={{ position: "fixed", top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="cl-reel-dim" />}
      <div className="cl-reel-callout" style={cardStyle}>
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
