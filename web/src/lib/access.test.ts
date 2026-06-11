import { describe, it, expect } from "vitest";
import { effectiveMode, gateOnGoLive, showPublicDisclaimer } from "./access";

describe("effectiveMode", () => {
  it("forces the reel (auto) for unauthed visitors regardless of stored mode", () => {
    expect(effectiveMode("live", false)).toBe("auto");
    expect(effectiveMode("auto", false)).toBe("auto");
  });
  it("respects the resolved mode once a session exists", () => {
    expect(effectiveMode("live", true)).toBe("live");
    expect(effectiveMode("auto", true)).toBe("auto");
  });
});

describe("gateOnGoLive", () => {
  it("requires onboarding only when crossing to live without a session", () => {
    expect(gateOnGoLive(false)).toBe(true);
    expect(gateOnGoLive(true)).toBe(false);
  });
});

describe("showPublicDisclaimer", () => {
  it("shows for public tier in live mode only", () => {
    expect(showPublicDisclaimer("public", "live")).toBe(true);
    expect(showPublicDisclaimer("public", "auto")).toBe(false);
    expect(showPublicDisclaimer("pro", "live")).toBe(false);
    expect(showPublicDisclaimer(null, "live")).toBe(false);
  });
});
