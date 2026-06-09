// web/src/lib/pacing.test.ts
import { describe, it, expect } from "vitest";
import { computeDelay } from "./pacing";
import type { Frame } from "./recording";

const ev = (e: any): Frame => ({ delayMs: 0, kind: "event", event: e });

describe("computeDelay", () => {
  it("gives boards a long readable dwell and tools a short beat", () => {
    const board = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1 });
    const tool = computeDelay(ev({ type: "tool", tool: "flight_search", phase: "done" }), null, { speed: 1 });
    expect(board).toBeGreaterThan(tool);
    expect(board).toBeGreaterThanOrEqual(2000);
  });

  it("scales text by length within clamps", () => {
    const short = computeDelay(ev({ type: "text", delta: "Hi" }), null, { speed: 1 });
    const long = computeDelay(ev({ type: "text", delta: "x".repeat(400) }), null, { speed: 1 });
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(2500); // TEXT_MAX
    expect(short).toBeGreaterThanOrEqual(120); // TEXT_MIN
  });

  it("2x is ~half of 1x", () => {
    const one = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1 });
    const two = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 2 });
    expect(two).toBe(Math.round(one / 2));
  });

  it("reducedMotion collapses everything to the reduced floor", () => {
    const d = computeDelay(ev({ type: "board", kind: "flight", boardId: "b", tripId: "t", candidates: [] }), null, { speed: 1, reducedMotion: true });
    expect(d).toBeLessThanOrEqual(120);
  });

  it("inspector events are near-instant (board-side telemetry)", () => {
    const d = computeDelay(ev({ type: "inspector", kind: "savings", exchangeId: "x", mechanism: "patch", tokensSaved: 1, basis: "chars/4", scope: "perTurn", detail: "" }), null, { speed: 1 });
    expect(d).toBeLessThanOrEqual(120);
  });
});
