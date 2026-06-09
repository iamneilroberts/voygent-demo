import { describe, it, expect } from "vitest";
import { buildFaithfulSeed, faithfulGates } from "./session-do";

describe("buildFaithfulSeed", () => {
  const CORE = "LIVE OPERATING CORE: drive manage_trip_goal.";

  it("puts the live instructions first, then the demo addendum", () => {
    const seed = buildFaithfulSeed(CORE, { boardsMode: false });
    expect(seed.startsWith(CORE)).toBe(true);
    expect(seed.toLowerCase()).toContain("never reveal"); // anti-leak guard
    expect(seed).not.toContain("WORKFLOW (one category at a time)"); // no demo orchestration
  });

  it("falls back to a built-in core when the server omits instructions", () => {
    const seed = buildFaithfulSeed(null, { boardsMode: false });
    expect(seed).toContain("You are Voygent"); // FAITHFUL_FALLBACK_CORE used
    expect(seed.toLowerCase()).toContain("never reveal");
  });

  it("adds the board-presentation note only in boards mode", () => {
    expect(buildFaithfulSeed(CORE, { boardsMode: true })).toContain("option cards render");
    expect(buildFaithfulSeed(CORE, { boardsMode: false })).not.toContain("option cards render");
  });
});

describe("faithfulGates", () => {
  it("faithful=true → all-real, demo machinery off", () => {
    const g = faithfulGates(true, false);
    expect(g.bypassReplay).toBe(true);
    expect(g.sanitizeModelPatch).toBe(false);
    expect(g.overlayReplayInFolio).toBe(false);
    expect(g.measureSearchDistill).toBe(false);
    expect(g.suppressOrchestration).toBe(true);
    expect(g.promoteLodgingFromPatch).toBe(true);
  });
  it("flag-off, featured (liveMode=false) → today's replay behavior", () => {
    const g = faithfulGates(false, false);
    expect(g.bypassReplay).toBe(false);
    expect(g.sanitizeModelPatch).toBe(true);
    expect(g.overlayReplayInFolio).toBe(true);
    expect(g.measureSearchDistill).toBe(true);
    expect(g.suppressOrchestration).toBe(false);
    expect(g.promoteLodgingFromPatch).toBe(false);
  });
  it("flag-off, live (liveMode=true) → real calls + no overlay, but distill still measured & orchestration on", () => {
    const g = faithfulGates(false, true);
    expect(g.bypassReplay).toBe(true);
    expect(g.sanitizeModelPatch).toBe(false);
    expect(g.overlayReplayInFolio).toBe(false);
    expect(g.measureSearchDistill).toBe(true);   // liveMode (not faithful) keeps today's measurement
    expect(g.suppressOrchestration).toBe(false); // nudge stays on for live trips
    expect(g.promoteLodgingFromPatch).toBe(true);
  });
  it("faithful=true → liveMode is a don't-care (irrelevant when faithful)", () => {
    expect(faithfulGates(true, true)).toEqual(faithfulGates(true, false));
  });
});
