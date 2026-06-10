import { describe, it, expect } from "vitest";
import { actorClass, actorLabel, pickedActor, editForActivity, threadsForDay, actorInitial } from "./reel-render";
import type { ReelEditMarker, ReelThread } from "./interaction";

describe("actorClass / actorLabel", () => {
  it("maps actors to scoped classes and human labels", () => {
    expect(actorClass("advisor")).toBe("cl-actor-advisor");
    expect(actorClass("client")).toBe("cl-actor-client");
    expect(actorLabel("advisor")).toBe("Advisor");
    expect(actorLabel("client")).toBe("Client");
    expect(actorLabel("agent")).toBe("Agent");
  });
});

describe("pickedActor", () => {
  const entry = { candidateId: "serp:70wngy", actor: "client" as const };
  it("returns the actor when this candidate is the reel-selected one", () => {
    expect(pickedActor(entry, "serp:70wngy")).toBe("client");
  });
  it("returns null for a non-selected candidate or when there's no entry", () => {
    expect(pickedActor(entry, "serp:other")).toBeNull();
    expect(pickedActor(undefined, "serp:70wngy")).toBeNull();
  });
});

describe("editForActivity", () => {
  const edits: ReelEditMarker[] = [
    { path: "days[1].activities[0]", was: "Free morning", now: "Cliffs of Moher", tag: "Advisor edited", actor: "advisor", reconciled: false },
  ];
  it("matches an edit to its exact day/activity indices", () => {
    expect(editForActivity(edits, 1, 0)?.now).toBe("Cliffs of Moher");
  });
  it("returns undefined when no edit targets that activity", () => {
    expect(editForActivity(edits, 1, 1)).toBeUndefined();
    expect(editForActivity(edits, 0, 0)).toBeUndefined();
    expect(editForActivity([], 1, 0)).toBeUndefined();
  });
});

describe("threadsForDay", () => {
  const threads: ReelThread[] = [
    { threadId: "thread-day6", anchor: "days[2]", comments: [
      { actor: "client", text: "Can we add a food tour this day?" },
      { actor: "advisor", text: "Done, added the Temple Bar tasting." },
    ] },
    { threadId: "thread-day1", anchor: "days[0]", comments: [{ actor: "client", text: "Looks great." }] },
  ];
  it("returns threads anchored to the given day index", () => {
    expect(threadsForDay(threads, 2).map((t) => t.threadId)).toEqual(["thread-day6"]);
    expect(threadsForDay(threads, 0).map((t) => t.threadId)).toEqual(["thread-day1"]);
  });
  it("returns [] for a day with no thread (and matches anchor exactly, not by prefix)", () => {
    expect(threadsForDay(threads, 1)).toEqual([]);
    expect(threadsForDay([], 2)).toEqual([]);
  });
});

describe("actorInitial", () => {
  it("is the first letter of the actor label", () => {
    expect(actorInitial("client")).toBe("C");
    expect(actorInitial("advisor")).toBe("A");
    expect(actorInitial("agent")).toBe("A");
  });
});
