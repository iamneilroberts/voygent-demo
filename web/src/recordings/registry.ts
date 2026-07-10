// web/src/recordings/registry.ts
import type { Recording } from "../lib/recording";
import type { Highlight, HighlightTrack } from "../lib/highlights";
import dublin from "./dublin-oct.json";
import dublinHl from "./dublin-oct.highlights.json";
import { dublinCollab, meta as planMeta } from "./dublin-collab.screenplay";
import { dublinRun, meta as advisorMeta } from "./dublin-run.screenplay";
import { dublinClient, meta as clientMeta } from "./dublin-client.screenplay";
import { irelandDiy, meta as irelandMeta } from "./ireland-diy.screenplay";
import { caribbeanCruise, meta as cruiseMeta } from "./caribbean-cruise.screenplay";
import { reelDurationLabel } from "../lib/reel-duration";
import type { ActorLabels } from "../lib/reel-render";

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
  // Per-actor label overrides for inline attribution during this reel
  // (e.g. { client: "You" } in the DIY reels). Absent -> Advisor/Client/Voygent.
  actorLabels?: ActorLabels;
  // Small persistent chip in the playback rail, e.g. "Scripted walk-through ·
  // your own run pulls live results". Absent -> no chip (dublin-oct is a real
  // recording and needs none; the advisor chapters adopt it in a later pass).
  honestyChip?: string;
  // Which audience a non-chapter reel is authored for. "traveller" reels are
  // listed under "Planning it yourself?" on the intro card. Absent -> unlisted.
  audience?: "traveller";
}

// QA4 arc (2026-07-09): 1 plan (advisor + Voygent build it, projected commission) →
// 2 client (their window only, picks + note) → 3 advisor (reply in, booking pasted,
// earned commission). Plain-language titles; the breadcrumb strips the "N · " prefix.
export const REELS: ReelEntry[] = [
  {
    id: "dublin-oct",
    title: "Five days in Dublin",
    blurb: "Watch Voygent build a real Dublin trip from live flights and hotels.",
    durationLabel: reelDurationLabel(dublin as Recording, (dublinHl as HighlightTrack).highlights),
    recording: dublin as Recording,
    highlights: (dublinHl as HighlightTrack).highlights,
  },
  {
    id: planMeta.id,
    chapter: 1,
    next: "client",
    title: planMeta.title,
    blurb: planMeta.blurb,
    durationLabel: reelDurationLabel(dublinCollab.recording, dublinCollab.highlights),
    recording: dublinCollab.recording,
    highlights: dublinCollab.highlights,
    recap: [...planMeta.recap],
    intro: { ...planMeta.intro },
    endCard: { ...planMeta.endCard },
  },
  {
    id: clientMeta.id,
    chapter: 2,
    next: "advisor",
    title: clientMeta.title,
    blurb: clientMeta.blurb,
    durationLabel: reelDurationLabel(dublinClient.recording, dublinClient.highlights),
    recording: dublinClient.recording,
    highlights: dublinClient.highlights,
    recap: [...clientMeta.recap],
    intro: { ...clientMeta.intro },
    endCard: { ...clientMeta.endCard },
  },
  {
    id: advisorMeta.id,
    chapter: 3,
    title: advisorMeta.title,
    blurb: advisorMeta.blurb,
    durationLabel: reelDurationLabel(dublinRun.recording, dublinRun.highlights),
    recording: dublinRun.recording,
    highlights: dublinRun.highlights,
    recap: [...advisorMeta.recap],
    intro: { ...advisorMeta.intro },
    endCard: { ...advisorMeta.endCard },
  },
  // DIY (traveller-only) reels — the free tier, no advisor anywhere. Not part of
  // the 3-chapter advisor arc; reached via ?reel=ireland / ?reel=cruise.
  {
    id: irelandMeta.id,
    next: "cruise",
    showSend: false,
    audience: "traveller",
    actorLabels: { client: "You" },
    honestyChip: "Scripted walk-through · your own run pulls live results",
    title: irelandMeta.title,
    blurb: irelandMeta.blurb,
    durationLabel: reelDurationLabel(irelandDiy.recording, irelandDiy.highlights),
    recording: irelandDiy.recording,
    highlights: irelandDiy.highlights,
    recap: [...irelandMeta.recap],
    intro: { ...irelandMeta.intro },
    endCard: { ...irelandMeta.endCard },
  },
  {
    id: cruiseMeta.id,
    showSend: false,
    audience: "traveller",
    actorLabels: { client: "You" },
    honestyChip: "Scripted walk-through · your own run pulls live results",
    title: cruiseMeta.title,
    blurb: cruiseMeta.blurb,
    durationLabel: reelDurationLabel(caribbeanCruise.recording, caribbeanCruise.highlights),
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
