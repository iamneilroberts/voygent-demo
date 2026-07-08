// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";
import { dublinCollab } from "./dublin-collab.screenplay";
import { dublinRun } from "./dublin-run.screenplay";
import { dublinClient } from "./dublin-client.screenplay";

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
  chapter?: number;  // position in the story arc; absent → not a chapter (legacy reels)
  next?: string;     // id of the chapter to offer when this reel ends
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
    chapter: 1,
    next: "run",
    title: "Chapter 1 · A trip, built together",
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
      blurb: "An advisor, the travellers, and Voygent shaping one trip in a single thread. They pick the flight, choose the hotel with live pricing, and leave the note that becomes the plan. The collaboration here is a scripted walk-through of the workflow, and your own run pulls real live flights and hotels.",
    },
  },
  {
    id: "run",
    chapter: 2,
    next: "client",
    title: "Chapter 2 · Run the trip",
    blurb: "The trip is sold. Watch a confirmation file itself, two empty days become a tour sale, and the travellers shape their own week.",
    durationLabel: "~2 min",
    recording: dublinRun.recording,
    highlights: dublinRun.highlights,
    recap: ["📋 pasted confirmation, filed", "🗓 two open days → a $142 tour", "💷 client adds an extra, price updates", "✓ one-click confirm"],
    intro: { eyebrow: "▶ Chapter 2", note: "This walk-through is scripted, like chapter 1. A real Voygent run files real confirmations and sells real tours." },
    endCard: { eyebrow: "✓ The week after", title: "Hours of admin. Zero typing.",
      blurb: "A pasted email became a filed confirmation. Two empty days became a commissionable tour. The travellers added an extra themselves. The advisor clicked twice. The collaboration here is a scripted walk-through of the workflow." },
  },
  {
    id: "client",
    chapter: 3,
    title: "Chapter 3 · Their trip, their window",
    blurb: "The proposal lands with the Millers. Watch them explore it, make it theirs, and send it back ready to book.",
    durationLabel: "~2 min",
    recording: dublinClient.recording,
    highlights: dublinClient.highlights,
    recap: ["📬 a living page, not a PDF", "💷 priced add-ons, toggled live", "💬 their note, on the day itself", "✓ back to the advisor ready to book"],
    intro: { eyebrow: "▶ Chapter 3", note: "This walk-through is scripted, like chapters 1 and 2. A real Voygent folio is a live page your clients open, change, and annotate." },
    // No endCard: the chapter ends on the folio surface itself (ReelFolioView interactive).
  },
];

// The story arc, in order, for the intro-card chapter list.
export const CHAPTERS: ReelEntry[] = REELS
  .filter((r) => r.chapter != null)
  .sort((a, b) => a.chapter! - b.chapter!);

// Pure: explicit id wins; else chapter 1; else the first reel. Never throws.
export function pickReel(reels: ReelEntry[], param: string | null): ReelEntry {
  if (param) { const hit = reels.find((r) => r.id === param); if (hit) return hit; }
  return reels.find((r) => r.chapter === 1) ?? reels[0];
}

export function selectReel(search?: string): ReelEntry {
  let param: string | null = null;
  try { param = new URLSearchParams(search ?? window.location.search).get("reel"); } catch { /* default */ }
  return pickReel(REELS, param);
}
