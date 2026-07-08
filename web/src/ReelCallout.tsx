import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Highlight } from "./lib/highlights";
import { markProgrammaticScroll } from "./lib/scroll-intent";

// Resolve a highlight target key to a live DOM element.
//   "stat:<key>"  -> the engineering-panel stat card [data-stat="<key>"]
//   "<other>"     -> [data-reel-target="<other>"] (e.g. "board-flight")
function findTarget(target: string): HTMLElement | null {
  if (target.startsWith("stat:")) return document.querySelector<HTMLElement>(`[data-stat="${target.slice(5)}"]`);
  return document.querySelector<HTMLElement>(`[data-reel-target="${target}"]`);
}

interface Rect { top: number; left: number; width: number; height: number }

export function ReelCallout(
  { highlight, dwellMs, onContinue, paused }:
  { highlight: Highlight; dwellMs: number; onContinue: () => void; paused?: boolean },
) {
  // rect = the target's viewport rect when it's on-screen; null => no/offscreen target (centered fallback).
  const [rect, setRect] = useState<Rect | null>(null);
  // The ResizeObserver below outlives renders; read `paused` through a ref so its
  // callback never acts on a stale closure.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useLayoutEffect(() => {
    const el = findTarget(highlight.target);
    if (!el) { setRect(null); return; }
    // A target taller than the viewport (e.g. the full flight board) would land on its
    // bottom edge with "nearest", scrolling the chosen option at the top out of view —
    // so align such targets to their TOP. Short targets keep "nearest".
    const scrollToEl = () => {
      try {
        markProgrammaticScroll(); // don't let follow-scroll read this as user intent
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.78;
        el.scrollIntoView({ block: tall ? "start" : "nearest", inline: "nearest" });
      } catch { /* ignore */ }
    };
    scrollToEl();
    const measure = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight, vw = window.innerWidth;
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      setRect(visible ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    const raf = requestAnimationFrame(measure); // re-measure after scrollIntoView settles
    window.addEventListener("resize", measure);
    // A2: the target can GROW after mount — a folio spotlight fires on the same beat
    // that renders the folio's new content, and on a phone that growth pushed the whole
    // artifact below the fold AFTER the mount-time scroll (spotlit content invisible for
    // the entire dwell). Re-assert the scroll when the target's size changes, but only
    // if it has drifted fully out of view, and never while the viewer is paused reading
    // (the ring still re-measures so it tracks the resized target).
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          const r = el.getBoundingClientRect();
          if (!pausedRef.current && (r.bottom < 0 || r.top > window.innerHeight)) scrollToEl();
          measure();
        })
      : null;
    ro?.observe(el);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [highlight.target]);

  // Auto-resume after dwell (reduced-motion = instant). While paused, no timer is
  // armed (only the Continue button advances); resuming re-arms a fresh dwell.
  useEffect(() => {
    if (paused) return;
    const reduced = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    const t = setTimeout(onContinue, reduced ? 0 : dwellMs);
    return () => clearTimeout(t);
  }, [dwellMs, onContinue, paused]);

  // Card placement: beside the target when there's horizontal room (desktop). On a
  // narrow screen a full-width target leaves no side room, so the card would cover it —
  // instead drop to the opposite vertical half (default low, so the TOP of a tall target
  // like the flight board, where the chosen option sits, stays visible).
  const CARD_W = 272, GAP = 14, MARGIN = 12;
  let cardStyle: CSSProperties;
  if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const rectRight = rect.left + rect.width;
    const roomLeft = rect.left >= CARD_W + GAP + MARGIN;
    const roomRight = (vw - rectRight) >= CARD_W + GAP + MARGIN;
    if (roomLeft || roomRight) {
      const left = Math.max(MARGIN, Math.min(roomLeft ? rect.left - CARD_W - GAP : rectRight + GAP, vw - CARD_W - MARGIN));
      const top = Math.max(MARGIN, Math.min(rect.top + rect.height / 2 - 60, vh - 170));
      cardStyle = { position: "fixed", left, top, width: CARD_W };
    } else {
      const cardW = Math.min(CARD_W, vw - 2 * MARGIN);
      const left = Math.round((vw - cardW) / 2);
      // A tall target is top-aligned (above), so its key content is up top → card low.
      // A short target: place on the opposite half of its center; only go high when the
      // target itself sits in the bottom third (e.g. a send button).
      const tall = rect.height > vh * 0.7;
      const targetMid = rect.top + rect.height / 2;
      const top = (!tall && targetMid > vh * 0.62) ? MARGIN : Math.round(vh * 0.62);
      cardStyle = { position: "fixed", left, top, width: cardW };
    }
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
          <span className="cl-reel-prog"><i style={{ animationDuration: `${dwellMs}ms`, animationPlayState: paused ? "paused" : "running" }} /></span>
          <button type="button" className="cl-reel-continue" onClick={onContinue}>Continue ▶</button>
        </div>
      </div>
    </div>
  );
}
