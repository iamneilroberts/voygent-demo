// web/src/lib/highlights.ts
import type { Frame } from "./recording";
import type { ServerEvent } from "../../../shared/events";

// Set exactly ONE of beatId | interactionKind | eventType. Precedence if more are set: beatId > interactionKind > eventType.
export interface HighlightMatch {
  eventType?: ServerEvent["type"];        // event-frame match: "inspector" | "board" | "folio" | "tool" | "text" | ...
  kind?: string;                          // inspector kind or board kind
  where?: Record<string, string>;         // field equality on the event (stringified), e.g. { status: "repaired" }
  nth?: number;                           // 1-based; default 1
  interactionKind?: "pick" | "edit" | "comment" | "handoff" | "clientview" | "engpanel" | "folioview" | "emailview"; // interaction-frame match
  beatId?: string;                        // exact compiler-assigned frame id (most stable)
}

export interface Highlight {
  match: HighlightMatch;
  target: string;
  eyebrow: string;
  title: string;
  body: string;
  dwellMs?: number;                       // default applied by the player (~4000)
  variant?: "hero";                       // "hero" = larger card for scene-setting callouts
}

export interface HighlightTrack { trip: string; highlights: Highlight[] }

// beatId lives on user/event/interaction frames but not turn-end; read it safely across the union.
function frameBeatId(f: Frame): string | undefined {
  return "beatId" in f ? f.beatId : undefined;
}

function frameMatches(f: Frame, m: HighlightMatch): boolean {
  // beatId is the most specific target: exact compiler-assigned frame id.
  if (m.beatId != null) return frameBeatId(f) === m.beatId;
  if (m.interactionKind != null) return f.kind === "interaction" && f.interaction.kind === m.interactionKind;
  if (m.eventType != null) {
    if (f.kind !== "event") return false;
    const e = f.event as Record<string, unknown>;
    if (e.type !== m.eventType) return false;
    if (m.kind != null && String(e.kind) !== m.kind) return false;
    if (m.where) for (const [k, v] of Object.entries(m.where)) if (String(e[k]) !== v) return false;
    return true;
  }
  return false;
}

// Map each frame index to the highlights bound there (in author order). Multiple allowed.
// Each highlight binds to the frame index of its nth match. Unmatched → omitted.
export function resolveHighlightFrames(frames: Frame[], highlights: Highlight[]): Map<number, Highlight[]> {
  const out = new Map<number, Highlight[]>();
  for (const h of highlights) {
    const target = h.match.nth ?? 1;
    let seen = 0;
    for (let i = 0; i < frames.length; i++) {
      if (frameMatches(frames[i], h.match)) {
        seen++;
        if (seen === target) {
          const arr = out.get(i) ?? [];
          arr.push(h);
          out.set(i, arr);
          break;
        }
      }
    }
  }
  return out;
}
