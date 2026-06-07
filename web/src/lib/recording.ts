import type { ServerEvent } from "../../../shared/events";

export type Frame =
  | { delayMs: number; kind: "user"; text: string }        // push user msg + assistant placeholder; busy=true
  | { delayMs: number; kind: "event"; event: ServerEvent } // run through the shared reducer
  | { delayMs: number; kind: "turn-end" };                 // busy=false

export interface Recording {
  skin: "claude";
  trip: string;
  frames: Frame[];
}

export interface ReplayHandlers {
  applyEvent: (e: ServerEvent) => void;  // caller binds claude=true
  pushUser: (text: string) => void;      // user bubble + assistant placeholder
  setBusy: (b: boolean) => void;
}

export interface ReplayOpts {
  reducedMotion?: boolean;               // compress delays for prefers-reduced-motion
  wait?: (ms: number) => Promise<void>;  // injected in tests for instant playback
  signal?: AbortSignal;                  // abort an in-flight replay (restart / mode switch)
}

// Abort-aware sleep: resolves on timeout OR immediately when the signal aborts,
// so a long recorded delay doesn't leave replay hanging after a restart/mode switch.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function replayChat(rec: Recording, h: ReplayHandlers, opts: ReplayOpts = {}): Promise<void> {
  const wait = opts.wait ?? ((ms: number) => sleep(ms, opts.signal));
  const scale = opts.reducedMotion ? 0.2 : 1;
  for (const f of rec.frames) {
    if (opts.signal?.aborted) return;
    await wait(Math.round((f.delayMs ?? 0) * scale));
    if (opts.signal?.aborted) return;
    if (f.kind === "user") { h.pushUser(f.text); h.setBusy(true); }
    else if (f.kind === "event") h.applyEvent(f.event);
    else if (f.kind === "turn-end") h.setBusy(false);
  }
}
