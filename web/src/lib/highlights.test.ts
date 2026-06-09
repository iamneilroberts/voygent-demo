// web/src/lib/highlights.test.ts
import { describe, it, expect } from "vitest";
import { resolveHighlightFrames, type Highlight } from "./highlights";
import type { Frame } from "./recording";

const ev = (e: any): Frame => ({ delayMs: 0, kind: "event", event: e });
const frames: Frame[] = [
  { delayMs: 0, kind: "user", text: "Plan Dublin" },
  ev({ type: "board", kind: "flight", boardId: "b1", tripId: "t", candidates: [] }),
  ev({ type: "inspector", kind: "savings", exchangeId: "x", mechanism: "patch", tokensSaved: 1, basis: "chars/4", scope: "perTurn", detail: "" }),
  ev({ type: "inspector", kind: "validation", exchangeId: "x", check: "c", label: "L", status: "repaired" }),
];

const hl = (match: Highlight["match"]): Highlight => ({ match, target: "stat:x", eyebrow: "E", title: "T", body: "B" });

describe("resolveHighlightFrames", () => {
  it("maps a matcher to the index of the matching frame", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "board", kind: "flight" })]);
    expect([...m.keys()]).toEqual([1]);
  });
  it("matches on a where-field (validation status)", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "inspector", kind: "validation", where: { status: "repaired" } })]);
    expect([...m.keys()]).toEqual([3]);
  });
  it("skips a highlight whose matcher never matches", () => {
    const m = resolveHighlightFrames(frames, [hl({ eventType: "board", kind: "hotel" })]);
    expect(m.size).toBe(0);
  });
  it("nth selects the nth match (1-based)", () => {
    const two = [...frames, ev({ type: "inspector", kind: "savings", exchangeId: "y", mechanism: "template", tokensSaved: 2, basis: "chars/4", scope: "perTurn", detail: "" })];
    const m = resolveHighlightFrames(two, [hl({ eventType: "inspector", kind: "savings", nth: 2 })]);
    expect([...m.keys()]).toEqual([4]);
  });
});
