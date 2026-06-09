// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";

export interface ReelEntry {
  id: string;
  title: string;        // shown on the intro card
  blurb: string;        // one honest line on the intro card
  durationLabel: string; // e.g. "~2 min"
  recording: Recording;
  highlights: Highlight[];
}

export const REELS: ReelEntry[] = [
  {
    id: "dublin-oct",
    title: "Five days in Dublin",
    blurb: "Watch Voygent build a real Dublin trip from live flights and hotels.",
    durationLabel: "~2 min",
    recording: dublin as Recording,
    highlights: (dublinHl as HighlightTrack).highlights,
  },
];

const ROT_KEY = "voygent-demo-reel-rot";

// Pure: explicit id wins; else round-robin by counter. Never throws.
export function pickReel(reels: ReelEntry[], param: string | null, counter: number): ReelEntry {
  if (param) { const hit = reels.find((r) => r.id === param); if (hit) return hit; }
  const i = ((counter % reels.length) + reels.length) % reels.length;
  return reels[i];
}

export function selectReel(search?: string): ReelEntry {
  let param: string | null = null;
  try { param = new URLSearchParams(search ?? window.location.search).get("reel"); } catch { /* default */ }
  let counter = 0;
  try { counter = parseInt(localStorage.getItem(ROT_KEY) ?? "0", 10) || 0; } catch { /* default */ }
  const entry = pickReel(REELS, param, counter);
  // advance rotation only when not explicitly overridden, so a shared ?reel link is stable
  if (!param) { try { localStorage.setItem(ROT_KEY, String(counter + 1)); } catch { /* ignore */ } }
  return entry;
}
