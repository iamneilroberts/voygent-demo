// web/src/recordings/registry.test.ts
import { describe, it, expect } from "vitest";
import { REELS, CHAPTERS, pickReel, type ReelEntry } from "./registry";

const reels = [{ id: "a" }, { id: "b", chapter: 1 }, { id: "c", chapter: 2 }] as ReelEntry[];

describe("pickReel", () => {
  it("honors an explicit ?reel id", () => {
    expect(pickReel(reels, "c").id).toBe("c");
  });
  it("defaults no-param visitors to chapter 1", () => {
    expect(pickReel(reels, null).id).toBe("b");
  });
  it("ignores an unknown ?reel id and falls back to chapter 1", () => {
    expect(pickReel(reels, "zzz").id).toBe("b");
  });
  it("falls back to the first reel when no chapter 1 exists", () => {
    const noChapters = [{ id: "x" }, { id: "y" }] as ReelEntry[];
    expect(pickReel(noChapters, null).id).toBe("x");
  });
});

describe("chapter arc", () => {
  it("no-param visitors land on collab (chapter 1), not a rotation", () => {
    expect(pickReel(REELS, null).id).toBe("collab");
  });
  it("collab is chapter 1 and points to run as the next chapter", () => {
    const entry = pickReel(REELS, "collab");
    expect(entry.chapter).toBe(1);
    expect(entry.next).toBe("run");
  });
  it("run is chapter 2 and points to client as the next chapter", () => {
    const entry = pickReel(REELS, "run");
    expect(entry.chapter).toBe(2);
    expect(entry.next).toBe("client");
  });
  it("client is chapter 3, the end of the arc for now, with honest scripted framing", () => {
    const entry = pickReel(REELS, "client");
    expect(entry.chapter).toBe(3);
    expect(entry.next).toBeUndefined();
    expect(entry.title).toBe("Chapter 3 · Their trip, their window");
    expect(entry.intro?.note).toMatch(/scripted/i);
  });
  it("CHAPTERS lists the story arc in order", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(["collab", "run", "client"]);
  });
  it("every next id resolves to a registered reel", () => {
    for (const r of REELS) {
      if (r.next) expect(REELS.some((x) => x.id === r.next)).toBe(true);
    }
  });
  it("dublin-oct stays out of the chapter arc (legacy real recording)", () => {
    const entry = pickReel(REELS, "dublin-oct");
    expect(entry.chapter).toBeUndefined();
    expect(entry.next).toBeUndefined();
  });
});

describe("collab reel registration", () => {
  it("registers a collab reel resolvable by ?reel=collab", () => {
    const entry = pickReel(REELS, "collab");
    expect(entry.id).toBe("collab");
    expect(entry.recording.frames.length).toBeGreaterThan(0);
    // it actually contains interaction frames (the whole point of P2)
    expect(entry.recording.frames.some((f) => f.kind === "interaction")).toBe(true);
  });

  it("carries its own honest framing (not the 'real session' copy) since it is scripted", () => {
    const entry = pickReel(REELS, "collab");
    expect(entry.recap?.length).toBeGreaterThan(0);
    expect(entry.intro?.note).toMatch(/scripted/i);
    expect(entry.endCard?.blurb).toMatch(/scripted walk-through/i);
  });

  it("dublin-oct keeps the default end card (it is a real recording)", () => {
    const entry = pickReel(REELS, "dublin-oct");
    expect(entry.recap).toBeUndefined();
    expect(entry.endCard).toBeUndefined();
    expect(entry.intro).toBeUndefined();
  });

  it("resolves ?reel=run to the run-the-trip chapter", () => {
    const hit = pickReel(REELS, "run");
    expect(hit.id).toBe("run");
    expect(hit.title).toContain("Run the trip");
  });
});
