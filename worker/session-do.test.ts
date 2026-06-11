import { describe, it, expect } from "vitest";
import { buildFaithfulSeed, faithfulGates, sizeStatsSavings, shouldEmitReplayDistill } from "./session-do";

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

  it("steers the faithful model off list_render (which needs an advisor subdomain) toward the in-chat search tools", () => {
    const seed = buildFaithfulSeed(CORE, { boardsMode: true });
    expect(seed).toContain("Do NOT call list_render");
    expect(seed).toContain("flight_list");
    expect(seed).toContain("hotel_search_and_rank");
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

describe("sizeStatsSavings (live supplier-raw telemetry → searchDistill event)", () => {
  const META = (raw: unknown, distilled: unknown) =>
    ({ "voygent/sizeStats": { rawBytes: raw, distilledBytes: distilled } }) as Record<string, unknown>;

  it("converts the verified prod example (serp JFK→LIS) at chars/4", () => {
    const s = sizeStatsSavings(META(20626, 3102), "flight_search");
    expect(s).toEqual({
      tokensSaved: 4381, rawTokens: 5157, slimTokens: 776,
      detail: "live flight_search supplier-raw ~20626B → model saw ~3102B",
    });
  });

  it("rawBytes null (public source, no fetch-boundary capture) → no event", () => {
    expect(sizeStatsSavings(META(null, 3102), "flight_search")).toBeNull();
  });

  it("absent _meta / absent key / malformed stats → no event", () => {
    expect(sizeStatsSavings(null, "flight_search")).toBeNull();
    expect(sizeStatsSavings(undefined, "flight_search")).toBeNull();
    expect(sizeStatsSavings({}, "flight_search")).toBeNull();
    expect(sizeStatsSavings({ "voygent/sizeStats": "bogus" }, "flight_search")).toBeNull();
    expect(sizeStatsSavings(META("20626", 3102), "flight_search")).toBeNull();
  });

  it("zero raw or near-parity payload → no event (no broken '0 saved' chip)", () => {
    expect(sizeStatsSavings(META(0, 0), "hotel_search")).toBeNull();
    expect(sizeStatsSavings(META(3102, 20626), "hotel_search")).toBeNull(); // distilled bigger
    expect(sizeStatsSavings(META(100, 100), "hotel_search")).toBeNull();    // parity
  });
});

describe("shouldEmitReplayDistill — mutual exclusivity with the live size-stats emit", () => {
  it("replayed featured trip (not faithful, not live) still measures", () => {
    expect(shouldEmitReplayDistill(false, false, true)).toBe(true);
  });
  it("live-latched session never emits the fixture-based event (stale lastMeasurement)", () => {
    expect(shouldEmitReplayDistill(false, true, true)).toBe(false);
  });
  it("faithful mode never emits", () => {
    expect(shouldEmitReplayDistill(true, false, true)).toBe(false);
    expect(shouldEmitReplayDistill(true, true, true)).toBe(false);
  });
  it("non-intercepted tools never emit", () => {
    expect(shouldEmitReplayDistill(false, false, false)).toBe(false);
  });
});
