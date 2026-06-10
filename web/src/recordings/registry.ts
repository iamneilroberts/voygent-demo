// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";
import { dublinCollab } from "./dublin-collab.screenplay";

export interface ReelEntry {
  id: string;
  title: string;        // shown on the intro card
  blurb: string;        // one honest line on the intro card
  durationLabel: string; // e.g. "~2 min"
  recording: Recording;
  highlights: Highlight[];
  // End-card overrides (per reel). Absent → the default "real session" end card,
  // which is honest for dublin-oct (a real recording) but NOT for the scripted
  // collab walk-through — so collab supplies its own honest framing + recap chips.
  recap?: string[];
  endCard?: { eyebrow: string; title: string; blurb: string };
  intro?: { eyebrow: string; note: string };
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
  {
    id: "collab",
    title: "A trip, built together",
    blurb: "Watch an advisor, a traveller, and Voygent shape a whole Dublin trip end to end.",
    durationLabel: "~4 min",
    recording: dublinCollab.recording,
    highlights: dublinCollab.highlights,
    recap: ["👥 advisor + traveller", "✈ badged, expandable flights", "🏨 advisor shortlists 3 hotels", "🗓 day-by-day + extras", "✎ advisor refines", "💷 traveller picks + live price", "💬 their note becomes the plan"],
    intro: {
      eyebrow: "▶ Built together",
      note: "The collaboration here is a scripted walk-through of the workflow.",
    },
    endCard: {
      eyebrow: "✓ Built together",
      title: "How a trip comes together",
      blurb: "An advisor, the travellers, and Voygent shaping one trip in a single thread — the flight they pick, the hotel they choose with live pricing, the note that becomes the plan. The collaboration here is a scripted walk-through of the workflow; your own run pulls real live flights and hotels.",
    },
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
