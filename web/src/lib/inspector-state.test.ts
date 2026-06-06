import { describe, it, expect } from "vitest";
import { engState } from "./inspector-state";

describe("engState", () => {
  it("is idle (quiet rail) before any tool fires", () => {
    expect(engState(0, false)).toBe("idle");
  });
  it("is live once at least one tool has fired", () => {
    expect(engState(1, false)).toBe("live");
  });
  it("is collapsed when manually collapsed, regardless of activity", () => {
    expect(engState(5, true)).toBe("collapsed");
    expect(engState(0, true)).toBe("collapsed");
  });
});
