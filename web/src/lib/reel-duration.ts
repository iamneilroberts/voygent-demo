// Estimated 1x autoplay runtime for a reel, mirroring the player's pacing model:
// per-frame computeDelay + post-apply interaction dwell (skipped when a spotlight
// owns the hold, honoring frame.holdMs) + each callout's dwell. Read mode and
// manual Continue clicks make real runtime longer; this is the honest floor.
import type { Recording, Frame } from "./recording";
import type { Highlight } from "./highlights";
import { resolveHighlightFrames } from "./highlights";
import { computeDelay, interactionDwell } from "./pacing";

const CALLOUT_DEFAULT_DWELL = 4000; // matches the screenplay tests' assumption for un-dwelled callouts

export function estimateReelMs(recording: Recording, highlights: Highlight[]): number {
  const frames = recording.frames;
  const hlMap = resolveHighlightFrames(frames, highlights);
  let total = 0;
  let prev: Frame | null = null;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    total += computeDelay(f, prev, { speed: 1, reducedMotion: false });
    const hits = hlMap.get(i);
    if (f.kind === "interaction" && !(hits && hits.length)) {
      total += f.holdMs ?? interactionDwell(f.interaction.kind, { speed: 1, reducedMotion: false });
    }
    if (hits && hits.length) {
      for (const h of hits) total += h.dwellMs ?? CALLOUT_DEFAULT_DWELL;
    }
    prev = f;
  }
  return total;
}

// "~3 min" style label. Ceil, not round: Read-default playback and Continue
// clicks stretch real time, so the label should never promise less than 1x.
export function reelDurationLabel(recording: Recording, highlights: Highlight[]): string {
  const min = Math.max(1, Math.ceil(estimateReelMs(recording, highlights) / 60_000));
  return `~${min} min`;
}
