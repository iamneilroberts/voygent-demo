import { describe, it, expect } from "vitest";
import { resolveMode, normalizeMode, DEFAULT_MODE } from "./mode";

describe("mode resolution", () => {
  it("a known ?mode= param wins over storage", () => {
    expect(resolveMode("auto", "live")).toBe("auto");
    expect(resolveMode("live", "auto")).toBe("live");
  });
  it("falls back to storage then default for absent/unknown params", () => {
    expect(resolveMode(null, "auto")).toBe("auto");
    expect(resolveMode("bogus", null)).toBe(DEFAULT_MODE);
    expect(normalizeMode("nope")).toBe(DEFAULT_MODE);
  });
  it("defaults a fresh visitor (no param, no storage) to auto", () => {
    expect(DEFAULT_MODE).toBe("auto");
    expect(resolveMode(null, null)).toBe("auto");
    expect(resolveMode(undefined, undefined)).toBe("auto");
  });
});

describe("resolveMode with a ?reel= link", () => {
  it("an explicit reel link wins over persisted live mode", () => {
    expect(resolveMode(null, "live", "plan")).toBe("auto");
  });
  it("an explicit ?mode= still outranks the reel param", () => {
    expect(resolveMode("live", "auto", "plan")).toBe("live");
  });
  it("no reel param keeps the stored-mode behavior", () => {
    expect(resolveMode(null, "live", null)).toBe("live");
    expect(resolveMode(null, "live", undefined)).toBe("live");
  });
});
