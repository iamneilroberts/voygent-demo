import { describe, it, expect } from "vitest";
import { engState } from "./inspector-state";

describe("engState", () => {
  it("is idle (quiet rail) before any tool fires, when not expanded", () => {
    expect(engState(0, false)).toBe("idle");
  });
  it("is peek (live skinny rail) once a tool fires and not expanded", () => {
    expect(engState(1, false)).toBe("peek");
    expect(engState(12, false)).toBe("peek");
  });
  it("honors an explicit expand in every state — the idle rail is clickable too", () => {
    expect(engState(0, true)).toBe("open");
    expect(engState(3, true)).toBe("open");
  });
});
