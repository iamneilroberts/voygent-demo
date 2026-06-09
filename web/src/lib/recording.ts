import type { ServerEvent } from "../../../shared/events";
import { computeDelay, interactionDwell } from "./pacing";
import { resolveHighlightFrames, type Highlight } from "./highlights";

export type Actor = "agent" | "advisor" | "client";

// Reel-only interaction payloads. NEVER a ServerEvent — the worker/live app never sees these.
export type ReelInteraction =
  | { kind: "pick"; boardId: string; candidateId: string; echo: string }
  | { kind: "edit"; path: string; was: string; now: string; tag: string }
  | { kind: "comment"; anchor: string; threadId: string; text: string }
  | { kind: "handoff"; channel: "email"; subject: string; reply?: string };

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
  let prev: Frame | null = null;
  for (let i = 0; i < rec.frames.length; i++) {
    const f = rec.frames[i];
    if (opts.signal?.aborted) return;
    await wait(computeDelay(f, prev, { speed: getSpeed(), reducedMotion: opts.reducedMotion }));
    if (opts.signal?.aborted) return;
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
    else if (f.kind === "interaction") h.applyInteraction?.(f.interaction, f.actor);
    prev = f;
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
}
