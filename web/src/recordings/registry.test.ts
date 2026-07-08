// web/src/recordings/registry.test.ts
import { describe, it, expect } from "vitest";
import { REELS, pickReel, type ReelEntry } from "./registry";

const reels = [{ id: "a" }, { id: "b" }, { id: "c" }] as ReelEntry[];

describe("pickReel", () => {
  it("honors an explicit ?reel id", () => {
    expect(pickReel(reels, "b", 0).id).toBe("b");
  });
  it("ignores an unknown ?reel id and falls back to rotation", () => {
    expect(pickReel(reels, "zzz", 0).id).toBe("a");
  });
  it("round-robins by counter", () => {
    expect(pickReel(reels, null, 0).id).toBe("a");
    expect(pickReel(reels, null, 1).id).toBe("b");
    expect(pickReel(reels, null, 3).id).toBe("a");
  });
  it("always returns the only reel when there is one", () => {
    const one = [{ id: "dublin-oct" }] as ReelEntry[];
    expect(pickReel(one, null, 7).id).toBe("dublin-oct");
  });
});

describe("collab reel registration", () => {
  it("registers a collab reel resolvable by ?reel=collab", () => {
    const entry = pickReel(REELS, "collab", 0);
    expect(entry.id).toBe("collab");
    expect(entry.recording.frames.length).toBeGreaterThan(0);
    // it actually contains interaction frames (the whole point of P2)
    expect(entry.recording.frames.some((f) => f.kind === "interaction")).toBe(true);
  });

  it("carries its own honest framing (not the 'real session' copy) since it is scripted", () => {
    const entry = pickReel(REELS, "collab", 0);
    expect(entry.recap?.length).toBeGreaterThan(0);
    expect(entry.intro?.note).toMatch(/scripted/i);
    expect(entry.endCard?.blurb).toMatch(/scripted walk-through/i);
  });

  it("dublin-oct keeps the default end card (it is a real recording)", () => {
    const entry = pickReel(REELS, "dublin-oct", 0);
    expect(entry.recap).toBeUndefined();
    expect(entry.endCard).toBeUndefined();
    expect(entry.intro).toBeUndefined();
  });

  it("resolves ?reel=run to the run-the-trip chapter", () => {
    const hit = pickReel(REELS, "run", 0);
    expect(hit.id).toBe("run");
    expect(hit.title).toContain("Run the trip");
  });
});
