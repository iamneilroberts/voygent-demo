import { describe, it, expect } from "vitest";
import { normalizeTheme, DEFAULT_THEME, THEME_IDS } from "./theme";

describe("normalizeTheme", () => {
  it("passes through a known theme id", () => {
    expect(normalizeTheme("phosphor")).toBe("phosphor");
  });
  it("falls back to the default for an unknown value", () => {
    expect(normalizeTheme("bogus")).toBe(DEFAULT_THEME);
  });
  it("falls back to the default for null/empty", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeTheme("")).toBe(DEFAULT_THEME);
  });
  it("default theme is amber and is a valid id", () => {
    expect(DEFAULT_THEME).toBe("amber");
    expect(THEME_IDS).toContain(DEFAULT_THEME);
  });
});
