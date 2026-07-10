// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";
import { dublinCollab } from "./dublin-collab.screenplay";
import { dublinRun } from "./dublin-run.screenplay";
import { dublinClient } from "./dublin-client.screenplay";
import { irelandDiy, meta as irelandMeta } from "./ireland-diy.screenplay";
import { caribbeanCruise, meta as cruiseMeta } from "./caribbean-cruise.screenplay";

export interface ReelEntry {
  id: string;
  title: string;        // shown on the intro card
  blurb: string;        // one honest line on the intro card
  durationLabel: string; // e.g. "~2 min"
  recording: Recording;
  highlights: Highlight[];
  // End-card overrides (per reel). Absent → the default "real session" end card,
  // which is honest for dublin-oct (a real recording) but NOT for the scripted
  // chapters — so each chapter supplies its own honest framing + recap chips.
  recap?: string[];
  endCard?: { eyebrow: string; title: string; blurb: string };
  intro?: { eyebrow: string; note: string };
  chapter?: number;  // position in the story arc; absent → not a chapter (legacy reels)
  next?: string;     // id of the chapter to offer when this reel ends
  // Whether the inline folio's "Send to client" affordance shows during this reel's
  // playback. Default true (existing behavior); a traveller-only DIY reel with no
  // client to send to can set this false.
  showSend?: boolean;
}

// QA4 arc (2026-07-09): 1 plan (advisor + Voygent build it, projected commission) →
// 2 client (their window only, picks + note) → 3 advisor (reply in, booking pasted,
// earned commission). Plain-language titles; the breadcrumb strips the "N · " prefix.
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
    id: "plan",
    chapter: 1,
    next: "client",
    title: "1 · Plan the trip",
    blurb: "An advisor and Voygent build a week in Dublin: real searches, a hotel shortlist, the open day sold, and the advisor's commission in view.",
    durationLabel: "~4 min",
    recording: dublinCollab.recording,
    highlights: dublinCollab.highlights,
    recap: ["six real fares, one pick", "a 3-hotel shortlist for the clients", "the week, day by day", "the open day becomes a $43 commission", "the advisor edits in place", "commission projected, itemized"],
    intro: {
      eyebrow: "▶ Demo 1 of 3",
      note: "A scripted walk-through of the workflow. Your own run pulls real live flights and hotels.",
    },
    endCard: {
      eyebrow: "✓ Demo 1 · the plan is out",
      title: "The trip is with the travellers",
      blurb: "The travellers get a link to a live, detailed portfolio with the advisor's recommendations and transparent pricing. They can try out the alternatives, get more details by clicking an item, or ask a question that is instantly routed back to the advisor. That is demo 2. (This walk-through is scripted; a real run pulls live flights and hotels.)",
    },
  },
  {
    id: "client",
    chapter: 2,
    next: "advisor",
    title: "2 · The client's view",
    blurb: "The proposal lands with the Millers. Watch them explore it in their own window, pick a hotel, watch the price follow every click, and send their answer back.",
    durationLabel: "~3 min",
    recording: dublinClient.recording,
    highlights: dublinClient.highlights,
    recap: ["a living page, not a PDF", "the advisor's note on top", "their hotel pick reprices the trip", "a tour page one click deep", "their question, on the day itself", "one click back to the advisor"],
    intro: { eyebrow: "▶ Demo 2 of 3", note: "This walk-through is scripted, like demo 1. A real Voygent folio is a live page your clients open, change, and annotate." },
    endCard: {
      eyebrow: "✓ Demo 2 · the clients answered",
      title: "They shaped their own trip",
      blurb: "The Millers picked their hotel, added a tour and the transfers, and asked one question. All of it went back to the advisor in one click. Demo 3 is what the advisor does with it: the reply, the booking, and the commission. (Scripted walk-through; the live folio is a real page.)",
    },
  },
  {
    id: "advisor",
    chapter: 3,
    title: "3 · Book the trip",
    blurb: "The Millers' answer lands back with the advisor. Voygent folds it in, files the airline's messy confirmation email, and itemizes the commission.",
    durationLabel: "~2 min",
    recording: dublinRun.recording,
    highlights: dublinRun.highlights,
    recap: ["the reply, routed to the trip", "their note becomes the plan", "a messy confirmation, pasted, filed", "$280 commission, itemized"],
    intro: { eyebrow: "▶ Demo 3 of 3", note: "This walk-through is scripted, like demos 1 and 2. A real Voygent run files real confirmations against real trips." },
    endCard: {
      eyebrow: "✓ That's the whole loop",
      title: "Plan it, share it, book it, get paid",
      blurb: "One thread planned the trip, the clients shaped it in their own window, the booking filed itself from a pasted email, and the commission stayed itemized the whole way. The walk-through was scripted; the demo behind the button below is live.",
    },
  },
  // DIY (traveller-only) reels — the free tier, no advisor anywhere. Not part of
  // the 3-chapter advisor arc; reached via ?reel=ireland / ?reel=cruise.
  {
    id: irelandMeta.id,
    next: "cruise",
    showSend: false,
    title: irelandMeta.title,
    blurb: irelandMeta.blurb,
    durationLabel: irelandMeta.durationLabel,
    recording: irelandDiy.recording,
    highlights: irelandDiy.highlights,
    recap: [...irelandMeta.recap],
    intro: { ...irelandMeta.intro },
    endCard: { ...irelandMeta.endCard },
  },
  {
    id: cruiseMeta.id,
    showSend: false,
    title: cruiseMeta.title,
    blurb: cruiseMeta.blurb,
    durationLabel: cruiseMeta.durationLabel,
    recording: caribbeanCruise.recording,
    highlights: caribbeanCruise.highlights,
    recap: [...cruiseMeta.recap],
    intro: { ...cruiseMeta.intro },
    endCard: { ...cruiseMeta.endCard },
  },
];

// The story arc, in order, for the intro-card chapter list.
export const CHAPTERS: ReelEntry[] = REELS
  .filter((r) => r.chapter != null)
  .sort((a, b) => a.chapter! - b.chapter!);

// Old chapter ids that shipped in links (?reel=collab, ?reel=run) map onto the QA4 arc.
const LEGACY_IDS: Record<string, string> = { collab: "plan", run: "advisor" };

// Pure: explicit id wins (legacy ids remapped); else chapter 1; else the first reel.
// Never throws.
export function pickReel(reels: ReelEntry[], param: string | null): ReelEntry {
  if (param) {
    const id = LEGACY_IDS[param] ?? param;
    const hit = reels.find((r) => r.id === id);
    if (hit) return hit;
  }
  return reels.find((r) => r.chapter === 1) ?? reels[0];
}

export function selectReel(search?: string): ReelEntry {
  let param: string | null = null;
  try { param = new URLSearchParams(search ?? window.location.search).get("reel"); } catch { /* default */ }
  return pickReel(REELS, param);
}
