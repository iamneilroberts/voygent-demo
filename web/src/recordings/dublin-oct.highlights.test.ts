import { describe, it, expect } from "vitest";
import { resolveHighlightFrames, type HighlightTrack } from "../lib/highlights";
import type { Recording } from "../lib/recording";
import rec from "./dublin-oct.json";
import track from "./dublin-oct.highlights.json";

describe("dublin-oct highlight track (grounding)", () => {
  const frames = (rec as Recording).frames;
  const highlights = (track as HighlightTrack).highlights;
  const resolved = resolveHighlightFrames(frames, highlights);

  it("resolves every highlight (none dropped)", () => {
    expect(resolved.size).toBe(highlights.length);
  });

  it("the cost highlight binds to the LAST summary (whole-run), not an early partial", () => {
    const summaryFrames = frames.flatMap((f, i) => (f.kind === "event" && (f.event as any).type === "inspector" && (f.event as any).kind === "summary") ? [i] : []);
    const costIdx = [...resolved.entries()].find(([, h]) => h.eyebrow === "What it cost")?.[0];
    expect(costIdx).toBe(summaryFrames.at(-1));   // nth:3 == last of the 3 summaries
  });

  it("fires in ascending frame order (narrative order is intentional)", () => {
    const idxs = [...resolved.keys()].sort((a, b) => a - b);
    expect([...resolved.keys()]).toEqual(idxs); // keys already insertion-ordered by index in the resolver? assert sorted regardless
    // If this ever reorders unexpectedly, re-pick the matchers/nth so the on-screen order reads right.
  });
});
