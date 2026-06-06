import { useEffect, useRef, useState } from "react";
import { splitFlapCells } from "./lib/split-flap";

// A row of airport split-flap cells that clack in with a staggered flip whenever
// the text changes. Uses the `.flap` / `.flap.flip` primitives from theme.css;
// reduced-motion users get the end state (handled in theme.css). `as` lets the
// caller pick the wrapping element (default span) for semantic fit.
export function SplitFlap(
  { text, as: Tag = "span", className = "" }:
  { text: string; as?: "span" | "div"; className?: string },
) {
  const cells = splitFlapCells(text);
  // Re-trigger the flip animation on every text change by toggling the `flip`
  // class off then on across a frame (so the CSS animation restarts).
  const [flip, setFlip] = useState(true);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current === text) return;
    prev.current = text;
    setFlip(false);
    const id = requestAnimationFrame(() => setFlip(true));
    return () => cancelAnimationFrame(id);
  }, [text]);

  return (
    <Tag className={`flap ${flip ? "flip" : ""} ${className}`.trim()}>
      {/* Readable text for assistive tech; the animated cells below are decorative. */}
      <span className="sr-only">{text}</span>
      {cells.map((c, i) => (
        <b key={i} aria-hidden="true">{c === " " ? " " : c}</b>
      ))}
    </Tag>
  );
}
