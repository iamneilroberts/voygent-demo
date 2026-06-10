import { describe, it, expect } from "vitest";
import { buildStats, railStats, deepDiveLinks, type StatInput } from "./inspector-stats";

const input: StatInput = {
  mcpToolsExposed: 72,
  distinctTools: 6,
  persistedWrites: 4,
  contextKeptOut: 230,
  observedCostUsd: 0.41,
  cacheHitRate: 0.91,
};

describe("buildStats", () => {
  it("emits a stat per known metric with formatted values", () => {
    const stats = buildStats(input);
    const byKey = Object.fromEntries(stats.map((s) => [s.key, s]));
    expect(byKey.mcpToolsExposed.value).toBe("72");
    expect(byKey.contextKeptOut.value).toBe("230");
    expect(byKey.contextKeptOut.tone).toBe("good");
    expect(byKey.observedCost.value).toBe("$0.41");
    expect(byKey.cacheHitRate.value).toBe("91%");
  });
  it("each stat that links a deep dive uses a real /info slug", () => {
    for (const s of buildStats(input)) {
      if (s.deepDive) expect(s.deepDive).toMatch(/^[a-z-]+$/);
    }
  });
});

describe("railStats", () => {
  it("returns only rail-eligible stats, sorted by priority, capped at slots", () => {
    const rail = railStats(buildStats(input), 3);
    expect(rail).toHaveLength(3);
    // contextKeptOut leads the rail (the headline savings story)
    expect(rail[0].key).toBe("contextKeptOut");
    expect(rail.every((s) => typeof s.rail === "number")).toBe(true);
  });
});

describe("deepDiveLinks", () => {
  it("dedups slugs in registry order", () => {
    const links = deepDiveLinks(buildStats(input));
    const slugs = links.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length); // no dupes
    expect(slugs).toContain("context-economics");
    expect(slugs).toContain("cost-engineering");
  });
});
