// web/src/lib/highlights.ts
import type { Frame } from "./recording";
import type { ServerEvent } from "../../../shared/events";

export interface HighlightMatch {
  eventType: ServerEvent["type"];        // "inspector" | "board" | "folio" | "tool" | "text" | ...
  kind?: string;                          // inspector kind or board kind
  where?: Record<string, string>;         // field equality on the event (stringified), e.g. { status: "repaired" }
  nth?: number;                           // 1-based; default 1
}

export interface Highlight {
  match: HighlightMatch;
  target: string;
  eyebrow: string;
  title: string;
  body: string;
  dwellMs?: number;                       // default applied by the player (~4000)
}

export interface HighlightTrack { trip: string; highlights: Highlight[] }

function frameMatches(f: Frame, m: HighlightMatch): boolean {
  if (f.kind !== "event") return false;
  const e = f.event as Record<string, unknown>;
  if (e.type !== m.eventType) return false;
  if (m.kind != null && String(e.kind) !== m.kind) return false;
  if (m.where) for (const [k, v] of Object.entries(m.where)) if (String(e[k]) !== v) return false;
  return true;
}

// Map each highlight to the frame index of its nth match. Unmatched → omitted.
export function resolveHighlightFrames(frames: Frame[], highlights: Highlight[]): Map<number, Highlight> {
  const out = new Map<number, Highlight>();
  for (const h of highlights) {
    const target = h.match.nth ?? 1;
    let seen = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frameMatches(frames[i], h.match)) {
        seen++;
        if (seen === target) { out.set(i, h); break; }
      }
    }
  }
  return out;
}
