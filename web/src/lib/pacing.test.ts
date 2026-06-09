// web/src/lib/pacing.test.ts
import { describe, it, expect } from "vitest";
import { computeDelay, interactionDwell } from "./pacing";
import type { Frame, ReelInteraction } from "./recording";

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

describe("interactionDwell (post-apply hold)", () => {
  const kinds: Array<[ReelInteraction["kind"], number]> = [
    ["pick", 3500], ["edit", 3200], ["comment", 4200], ["handoff", 5200],
  ];
  it("applies the per-kind floor at 1x", () => {
    for (const [kind, ms] of kinds) expect(interactionDwell(kind, { speed: 1 })).toBe(ms);
  });
  it("divides by speed (2x ~ half)", () => {
    expect(interactionDwell("pick", { speed: 2 })).toBe(1750);
  });
  it("reducedMotion keeps a usable dwell (not the 90ms motion floor)", () => {
    expect(interactionDwell("pick", { speed: 1, reducedMotion: true })).toBeGreaterThanOrEqual(1500);
  });
});

describe("computeDelay for interaction frames", () => {
  it("gives an interaction frame a short pre-beat, not a long dwell", () => {
    const f = { delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "pick", boardId: "b", candidateId: "c", echo: "x" } } as const;
    const d = computeDelay(f, null, { speed: 1 });
    expect(d).toBeLessThanOrEqual(700);   // it's a pre-beat; the real hold is interactionDwell
    expect(d).toBeGreaterThan(0);
  });
});
