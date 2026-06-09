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

describe("highlight matching for interaction frames + multi-per-frame", () => {
  const frames: Frame[] = [
    { delayMs: 0, kind: "interaction", actor: "client", interaction: { kind: "pick", boardId: "b1", candidateId: "c1", echo: "x" }, beatId: "pick1" },
    { delayMs: 0, kind: "event", event: { type: "folio", folio: { tripId: "t", title: "T", flights: [], hotels: [] } } as any },
  ];

  it("matches an interaction frame by interactionKind", () => {
    const map = resolveHighlightFrames(frames, [
      { match: { interactionKind: "pick" }, target: "board-flight", eyebrow: "E", title: "Client picked", body: "B" },
    ]);
    expect(map.get(0)).toHaveLength(1);
    expect(map.get(0)![0].title).toBe("Client picked");
  });

  it("matches by compiler beatId (stable target)", () => {
    const map = resolveHighlightFrames(frames, [
      { match: { beatId: "pick1" }, target: "board-flight", eyebrow: "E", title: "By beat", body: "B" },
    ]);
    expect(map.get(0)![0].title).toBe("By beat");
  });

  it("keeps the existing eventType matching working (backward compatible)", () => {
    const map = resolveHighlightFrames(frames, [
      { match: { eventType: "folio" }, target: "folio-days", eyebrow: "E", title: "Folio", body: "B" },
    ]);
    expect(map.get(1)![0].title).toBe("Folio");
  });

  it("allows multiple highlights on the same frame index", () => {
    const map = resolveHighlightFrames(frames, [
      { match: { interactionKind: "pick" }, target: "board-flight", eyebrow: "E", title: "One", body: "B" },
      { match: { beatId: "pick1" }, target: "board-flight", eyebrow: "E", title: "Two", body: "B" },
    ]);
    expect(map.get(0)!.map((h) => h.title)).toEqual(["One", "Two"]);
  });
});
