import { describe, it, expect } from "vitest";
import { normalizeSkin, resolveSkin, DEFAULT_SKIN, SKIN_IDS } from "./skin";

describe("normalizeSkin", () => {
  it("passes through a known skin id", () => {
    expect(normalizeSkin("claude")).toBe("claude");
    expect(normalizeSkin("board")).toBe("board");
  });
  it("falls back to the default for unknown/null/empty", () => {
    expect(normalizeSkin("chatgpt")).toBe(DEFAULT_SKIN); // future skin, not yet shipped
    expect(normalizeSkin("bogus")).toBe(DEFAULT_SKIN);
    expect(normalizeSkin(null)).toBe(DEFAULT_SKIN);
    expect(normalizeSkin("")).toBe(DEFAULT_SKIN);
  });
  it("default skin is board and is a valid id", () => {
    expect(DEFAULT_SKIN).toBe("board");
    expect(SKIN_IDS).toContain(DEFAULT_SKIN);
  });
});

describe("resolveSkin precedence", () => {
  it("a known URL param wins over storage", () => {
    expect(resolveSkin("claude", "board")).toBe("claude");
    expect(resolveSkin("board", "claude")).toBe("board");
  });
  it("an unknown param falls back to storage", () => {
    expect(resolveSkin("bogus", "claude")).toBe("claude");
  });
  it("no param falls back to storage", () => {
    expect(resolveSkin(null, "claude")).toBe("claude");
  });
  it("no param and no/invalid storage falls back to default", () => {
    expect(resolveSkin(null, null)).toBe(DEFAULT_SKIN);
    expect(resolveSkin(null, "bogus")).toBe(DEFAULT_SKIN);
    expect(resolveSkin(undefined, undefined)).toBe(DEFAULT_SKIN);
  });
});

describe("resolveSkin on small screens", () => {
  it("defaults to claude on a small screen (board skin has no mobile pass)", () => {
    expect(resolveSkin(null, null, true)).toBe("claude");
  });
  it("small screen overrides a stored board preference", () => {
    expect(resolveSkin(null, "board", true)).toBe("claude");
  });
  it("an explicit URL param still wins on a small screen", () => {
    expect(resolveSkin("board", null, true)).toBe("board");
    expect(resolveSkin("board", "claude", true)).toBe("board");
  });
  it("an unknown param on a small screen falls through to claude", () => {
    expect(resolveSkin("bogus", "board", true)).toBe("claude");
  });
  it("large screens keep the existing precedence", () => {
    expect(resolveSkin(null, "board", false)).toBe("board");
    expect(resolveSkin(null, null, false)).toBe(DEFAULT_SKIN);
  });
});
