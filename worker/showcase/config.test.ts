import { describe, it, expect } from "vitest";
import { SECTIONS, KNOWN_SECTION_IDS, enabledSections, type Section } from "./config";

describe("showcase config", () => {
  it("KNOWN_SECTION_IDS contains every section id", () => {
    for (const s of SECTIONS) expect(KNOWN_SECTION_IDS.has(s.id)).toBe(true);
  });

  it("enabledSections returns only enabled sections in ascending order", () => {
    const input: Section[] = [
      { id: "c", type: "comments", title: "C", enabled: true, order: 30 },
      { id: "a", type: "overview", title: "A", enabled: true, order: 10 },
      { id: "b", type: "architecture", title: "B", enabled: false, order: 20 },
    ];
    const out = enabledSections(input);
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
  });
});
