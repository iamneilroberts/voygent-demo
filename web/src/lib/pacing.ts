// web/src/lib/pacing.ts
import type { Frame, ReelInteraction } from "./recording";

export interface PacingOpts { speed: number; reducedMotion?: boolean }

// QA4 rebalance: MORE time where there is content to absorb (text, boards, folio),
// LESS on the no-output beats (tool chips, turn gaps) — "skip the thinking, hold the
// information". 2× divides all of these; Read mode additionally holds every callout.
const MS_PER_CHAR = 22;
const TEXT_MIN = 160, TEXT_MAX = 3600;
const BOARD_DWELL = 3600;
const FOLIO_DWELL = 2600;
const TOOL_BEAT = 450;
const MICRO = 90;
const USER_BEAT = 650;
const TURN_BEAT = 350;
const REDUCED = 90;

// Post-apply dwell floors per interaction kind (ms at 1x). The interaction is already
// on screen; this is how long the reel HOLDS so the viewer can read it (flash + buffer).
// clientview snapshots hold longer so the live price recalc reads (the total animates
// between consecutive snapshots); the closing snapshot (open:false) shares the floor.
// engpanel's open beat is held by its callout; the only un-spotlit engpanel beat is the
// close (panel already gone), so keep that short — a long floor there is just dead air.
const INTERACTION_DWELL: Record<ReelInteraction["kind"], number> = { pick: 3500, edit: 3200, comment: 4200, handoff: 5200, clientview: 4200, folioview: 4200, engpanel: 600, emailview: 5200, pocketguide: 4200 };
const INTERACTION_PREBEAT = 320;       // small delay BEFORE an interaction frame appears
const INTERACTION_REDUCED_DWELL = 1500; // reduced-motion still needs reading time

// Base (1x) display delay derived from event semantics, not the captured delay.
function baseDelay(f: Frame): number {
  if (f.kind === "user") return USER_BEAT;
  if (f.kind === "turn-end") return TURN_BEAT;
  if (f.kind === "interaction") return INTERACTION_PREBEAT;
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

export function interactionDwell(kind: ReelInteraction["kind"], opts: PacingOpts): number {
  const floor = INTERACTION_DWELL[kind] ?? 3500;
  if (opts.reducedMotion) return INTERACTION_REDUCED_DWELL;
  const speed = opts.speed >= 1 ? opts.speed : 1;
  return Math.round(floor / speed);
}
