import type { ServerEvent } from "../../../shared/events";
import type { Frame, Recording } from "./recording";

// Captures a live claude-skin run into a Recording. `clock` returns ms (injected
// for tests; defaults to Date.now in the browser). Delay of each frame = time
// since the previous frame, so replay reproduces the live pacing.
export function createRecorder(trip: string, clock: () => number = () => Date.now()) {
  const frames: Frame[] = [];
  let last = clock();
  const delta = () => { const t = clock(); const d = Math.max(0, t - last); last = t; return d; };
  return {
    recordUser(text: string) { frames.push({ delayMs: delta(), kind: "user", text }); },
    recordEvent(event: ServerEvent) { frames.push({ delayMs: delta(), kind: "event", event }); },
    recordTurnEnd() { frames.push({ delayMs: delta(), kind: "turn-end" }); },
    export(): Recording { return { skin: "claude", trip, frames }; },
  };
}
