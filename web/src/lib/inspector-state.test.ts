import { describe, it, expect } from "vitest";
import { engState } from "./inspector-state";

describe("engState", () => {
  it("is idle (quiet rail) before any tool fires, regardless of expand", () => {
    expect(engState(0, false)).toBe("idle");
    expect(engState(0, true)).toBe("idle");
  });
  it("is peek (live skinny rail) once a tool fires and not expanded", () => {
    expect(engState(1, false)).toBe("peek");
    expect(engState(12, false)).toBe("peek");
  });
  it("is open (full two-pane) only when the viewer expands after activity", () => {
    expect(engState(3, true)).toBe("open");
  });
});
