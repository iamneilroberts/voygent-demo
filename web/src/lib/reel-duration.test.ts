import { describe, it, expect } from "vitest";
import type { Recording } from "./recording";
import { estimateReelMs, reelDurationLabel } from "./reel-duration";
import { irelandDiy } from "../recordings/ireland-diy.screenplay";
import { REELS } from "../recordings/registry";

describe("reel-duration", () => {
  it("estimates the ireland reel in its known 1x window", () => {
    const ms = estimateReelMs(irelandDiy.recording, irelandDiy.highlights);
    expect(ms).toBeGreaterThan(120_000);
    expect(ms).toBeLessThan(230_000);
  });

  it("honors an interaction's holdMs override instead of the kind floor", () => {
    // Synthetic one-frame recording: an un-spotlit folioview with holdMs 100 must
    // estimate shorter than the same frame using the 4200ms kind floor.
    const mk = (holdMs?: number): Recording => ({
      skin: "claude",
      trip: "t",
      frames: [{ delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "folioview", view: null }, ...(holdMs != null ? { holdMs } : {}) }],
    });
    expect(estimateReelMs(mk(100), [])).toBeLessThan(estimateReelMs(mk(), []));
  });

  it("formats labels as ~N min (ceil, floor 1)", () => {
    expect(reelDurationLabel(irelandDiy.recording, irelandDiy.highlights)).toMatch(/^~\d+ min$/);
  });

  it("every registered reel carries a sane computed label", () => {
    for (const r of REELS) {
      const m = r.durationLabel.match(/^~(\d+) min$/);
      expect(m, `${r.id} label "${r.durationLabel}"`).toBeTruthy();
      const n = Number(m![1]);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
});
