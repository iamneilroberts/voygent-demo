import type { ServerEvent, FolioData } from "../../../shared/events";
import { computeDelay, interactionDwell } from "./pacing";
import { resolveHighlightFrames, type Highlight } from "./highlights";

export type Actor = "agent" | "advisor" | "client";

// The client-facing view of the trip (R4): a simulated browser window the traveler
// sees after the advisor sends the folio. Snapshot-based — each `clientview` beat
// carries the full state, so consecutive beats animate the live price recalc.
export interface ReelHotelOption { id: string; name: string; price: number; meta?: string }
export interface ReelAddon { id: string; label: string; price: number; on: boolean; day?: number }
export interface ReelClientSession {
  open: boolean;
  url: string;            // simulated address-bar URL, e.g. voygent.app/t/dublin
  tripTitle: string;
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];     // the advisor's shortlist, as the client's single-choice
  pickedHotelId: string | null;
  addons: ReelAddon[];           // optional upgrades the client can toggle
  question: string | null;       // the client's typed note (shown before Send)
  progress: number;              // 0..1, "ready to book"
}

export interface ReelFolioNote { anchor: string; author: "client" | "advisor"; text: string }

// The full client folio window (ch3): a simulated browser window showing the folio
// itself — production-faithful content (FolioData) plus the live-pricing fields the
// client plays with. Snapshot-based like ReelClientSession: each `folioview` beat
// replaces the snapshot; consecutive snapshots animate (total recalc, day swap,
// Draft→Final). `focus` names a data-reel-target anchor the surface scrolls into view
// (the spec's section-cut scroll driving). `expandedDay` is 1-based into folio.days.
export interface ReelFolioSession {
  open: boolean;
  url: string;
  folio: FolioData;
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
  notes: ReelFolioNote[];
  status: "draft" | "final";
  advisorUpdating: boolean;
  focus: string | null;
  expandedDay: number | null;
}

// A brief peek at the engineering view (reel): a small panel that slides in to show
// the REAL tools the assistant has called so far (no cost/token data — those would be
// fabricated on a scripted reel), framed as "full metrics in the interactive demo".
export interface ReelEngTool { name: string; status: "done" | "running" }
export interface ReelEngPanel {
  open: boolean;
  tools: ReelEngTool[];   // the real tool sequence so far
  footnote?: string;      // pointer to the live demo for the full metrics
}

// Reel-only interaction payloads. NEVER a ServerEvent — the worker/live app never sees these.
export type ReelInteraction =
  | { kind: "pick"; boardId: string; candidateIds: string[]; echo: string }
  | { kind: "edit"; path: string; was: string; now: string; tag: string }
  | { kind: "comment"; anchor: string; threadId: string; text: string }
  | { kind: "handoff"; channel: "email"; subject: string; reply?: string }
  | { kind: "clientview"; view: ReelClientSession | null }
  | { kind: "engpanel"; view: ReelEngPanel | null };

export type Frame =
  | { delayMs: number; kind: "user"; text: string; actor?: Actor; beatId?: string }
  | { delayMs: number; kind: "event"; event: ServerEvent; beatId?: string }
  | { delayMs: number; kind: "turn-end" }
  | { delayMs: number; kind: "interaction"; actor: Actor; interaction: ReelInteraction; beatId?: string };

export interface Recording {
  skin: "claude";
  trip: string;
  frames: Frame[];
}

export interface ReplayHandlers {
  applyEvent: (e: ServerEvent) => void;  // caller binds claude=true
  pushUser: (text: string) => void;      // user bubble + assistant placeholder
  setBusy: (b: boolean) => void;
  applyInteraction?: (i: ReelInteraction, actor: Actor) => void; // reel-only interaction frame
  onHighlight?: (h: Highlight) => Promise<void>; // paused callout; resolves to resume
}

export interface ReplayOpts {
  reducedMotion?: boolean;
  wait?: (ms: number) => Promise<void>;  // injected in tests for instant playback
  signal?: AbortSignal;
  speed?: () => number;                  // current speed multiplier (>=1); read each frame
  highlights?: Highlight[];              // sidecar callouts for this recording
  // Playback control: awaited before each frame; resolves immediately when not paused,
  // otherwise when the viewer resumes. Raced against abort so a restart never hangs.
  pauseGate?: () => Promise<void>;
  // Progress tick: (framesDone, framesTotal) before each frame and once at the end.
  onProgress?: (done: number, total: number) => void;
  // Seek: apply frames [0, seekTo) instantly (state rebuild), then play normally from
  // seekTo. Caller must reset state before re-invoking so the rebuild starts clean.
  seekTo?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

// Resolves when the signal aborts (or immediately if already aborted). Used to
// race a paused callout so an abort during a highlight never leaves the loop hanging.
function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise<void>(() => {}); // never resolves; only used inside Promise.race with onHighlight
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export async function replayChat(rec: Recording, h: ReplayHandlers, opts: ReplayOpts = {}): Promise<void> {
  const wait = opts.wait ?? ((ms: number) => sleep(ms, opts.signal));
  const getSpeed = opts.speed ?? (() => 1);
  const hlMap = opts.highlights ? resolveHighlightFrames(rec.frames, opts.highlights) : null;
  // Seek support: frames before `seekTo` are applied INSTANTLY (no delay, dwell, pause,
  // or callout) to rebuild the accumulated state, then normal playback resumes at seekTo.
  // The caller resets state first, so a seek is reset + fast-forward + play-on.
  const startFrom = opts.seekTo && opts.seekTo > 0 ? opts.seekTo : 0;
  let prev: Frame | null = null;
  for (let i = 0; i < rec.frames.length; i++) {
    const f = rec.frames[i];
    if (opts.signal?.aborted) return;
    const live = i >= startFrom;   // false while fast-forwarding to the seek target
    if (live) {
      // Hold here while paused (abort-safe). When not paused this resolves immediately.
      if (opts.pauseGate) { await Promise.race([opts.pauseGate(), waitForAbort(opts.signal)]); if (opts.signal?.aborted) return; }
      opts.onProgress?.(i, rec.frames.length);
      await wait(computeDelay(f, prev, { speed: getSpeed(), reducedMotion: opts.reducedMotion }));
      if (opts.signal?.aborted) return;
    }
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
    else if (f.kind === "interaction") h.applyInteraction?.(f.interaction, f.actor);
    prev = f;
    if (!live) continue;   // fast-forward: skip dwell + callouts
    const hits = hlMap?.get(i);
    // Interactions HOLD after applying (post-apply dwell) unless a spotlight on this
    // same frame provides the hold (handled below) — avoids double-dwell.
    if (f.kind === "interaction" && !(hits && hits.length)) {
      await wait(interactionDwell(f.interaction.kind, { speed: getSpeed(), reducedMotion: opts.reducedMotion }));
      if (opts.signal?.aborted) return;
    }
    if (hits && hits.length && h.onHighlight) {
      for (const hl of hits) {
        if (opts.signal?.aborted) return;
        // Race each callout against abort: if the reel is restarted / unmounted mid-callout,
        // this resolves instead of hanging on a promise App can no longer settle.
        await Promise.race([h.onHighlight(hl), waitForAbort(opts.signal)]);
        if (opts.signal?.aborted) return;
      }
    }
  }
  opts.onProgress?.(rec.frames.length, rec.frames.length);
}
