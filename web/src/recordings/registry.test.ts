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

describe("QA4 chapter arc (plan → client → advisor)", () => {
  it("no-param visitors land on plan (chapter 1), not a rotation", () => {
    expect(pickReel(REELS, null).id).toBe("plan");
  });
  it("plan is chapter 1 and points to client as the next chapter", () => {
    const entry = pickReel(REELS, "plan");
    expect(entry.chapter).toBe(1);
    expect(entry.next).toBe("client");
  });
  it("client is chapter 2 and points to advisor as the next chapter", () => {
    const entry = pickReel(REELS, "client");
    expect(entry.chapter).toBe(2);
    expect(entry.next).toBe("advisor");
  });
  it("advisor is chapter 3, the end of the arc, with honest scripted framing", () => {
    const entry = pickReel(REELS, "advisor");
    expect(entry.chapter).toBe(3);
    expect(entry.next).toBeUndefined();
    expect(entry.intro?.note).toMatch(/scripted/i);
  });
  it("chapter titles are plain language (numbered, no cute names)", () => {
    expect(pickReel(REELS, "plan").title).toBe("1 · Plan the trip");
    expect(pickReel(REELS, "client").title).toBe("2 · The client's view");
    expect(pickReel(REELS, "advisor").title).toBe("3 · Book the trip");
  });
  it("CHAPTERS lists the story arc in order", () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(["plan", "client", "advisor"]);
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

describe("legacy link ids keep working (?reel=collab, ?reel=run shipped in invites)", () => {
  it("collab resolves to the chapter-1 plan reel", () => {
    expect(pickReel(REELS, "collab").id).toBe("plan");
  });
  it("run resolves to the advisor chapter (its paste beat lives there now)", () => {
    expect(pickReel(REELS, "run").id).toBe("advisor");
  });
  it("client resolves directly (same id, new content)", () => {
    expect(pickReel(REELS, "client").id).toBe("client");
  });
});

describe("chapter registration honesty + end cards", () => {
  it("every chapter carries scripted framing on intro AND end card, plus recap chips", () => {
    for (const c of CHAPTERS) {
      expect(c.intro?.note, c.id).toMatch(/scripted/i);
      expect(c.endCard?.blurb, c.id).toMatch(/scripted/i);
      expect(c.recap?.length, c.id).toBeGreaterThan(0);
    }
  });
  it("chapter 1's end card carries the handoff summary (link, alternatives, routed question)", () => {
    const blurb = pickReel(REELS, "plan").endCard!.blurb;
    expect(blurb).toContain("link");
    expect(blurb).toContain("alternatives");
    expect(blurb).toContain("routed back to the advisor");
  });
  it("chapters contain interaction frames (the point of the scripted reels)", () => {
    for (const c of CHAPTERS) {
      expect(c.recording.frames.some((f) => f.kind === "interaction"), c.id).toBe(true);
    }
  });
  it("dublin-oct keeps the default end card (it is a real recording)", () => {
    const entry = pickReel(REELS, "dublin-oct");
    expect(entry.recap).toBeUndefined();
    expect(entry.endCard).toBeUndefined();
    expect(entry.intro).toBeUndefined();
  });
});
