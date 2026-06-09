import { describe, it, expect } from "vitest";
import { buildFaithfulSeed } from "./session-do";

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
