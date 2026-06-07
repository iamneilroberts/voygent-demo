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
});
