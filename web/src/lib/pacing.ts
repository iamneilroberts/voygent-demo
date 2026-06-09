// web/src/lib/pacing.ts
import type { Frame } from "./recording";

export interface PacingOpts { speed: number; reducedMotion?: boolean }

const MS_PER_CHAR = 16;
const TEXT_MIN = 120, TEXT_MAX = 2500;
const BOARD_DWELL = 2600;
const FOLIO_DWELL = 1800;
const TOOL_BEAT = 700;
const MICRO = 90;
const USER_BEAT = 650;
const TURN_BEAT = 500;
const REDUCED = 90;

// Base (1x) display delay derived from event semantics, not the captured delay.
function baseDelay(f: Frame): number {
  if (f.kind === "user") return USER_BEAT;
  if (f.kind === "turn-end") return TURN_BEAT;
  if (f.kind === "interaction") return USER_BEAT;
  const e = f.event;
  switch (e.type) {
    case "text": return Math.min(TEXT_MAX, Math.max(TEXT_MIN, e.delta.length * MS_PER_CHAR));
    case "board": return BOARD_DWELL;
    case "folio": return FOLIO_DWELL;
    case "tool": return TOOL_BEAT;
    default: return MICRO; // inspector, turn-complete, error
  }
}

export function computeDelay(f: Frame, _prev: Frame | null, opts: PacingOpts): number {
  if (opts.reducedMotion) return REDUCED;
  const speed = opts.speed >= 1 ? opts.speed : 1;
  return Math.round(baseDelay(f) / speed);
}
