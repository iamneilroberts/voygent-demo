import { describe, it, expect } from "vitest";
import { buildPresets, buildPresetPrompt } from "./presets";
import { presetRoutes } from "./fixtures/index";

function reqWithCf(cf: Record<string, unknown> | undefined): Request {
  const r = new Request("https://demo/presets");
  if (cf) Object.defineProperty(r, "cf", { value: cf, configurable: true });
  return r;
}

describe("buildPresetPrompt", () => {
  it("produces a complete one-click prompt with origin city, destination, dates, and pax", () => {
    const dublin = presetRoutes().find((r) => r.id === "dublin-oct")!;
    const p = buildPresetPrompt(dublin);
    expect(p).toContain("Dublin in October");
    expect(p).toContain("Mobile (MOB)");
    expect(p).toContain("Dublin");
    expect(p).toContain("Oct 12, 2026");
    expect(p).toContain("2 travelers");
  });
});

describe("buildPresets", () => {
  it("returns all fixture routes as cards with prompts + subtitles", () => {
    const res = buildPresets(reqWithCf({ city: "Mobile", region: "Alabama", country: "US" }));
    expect(res.presets).toHaveLength(presetRoutes().length);
    expect(res.geo.city).toBe("Mobile");
    for (const c of res.presets) {
      expect(c.prompt.length).toBeGreaterThan(20);
      expect(c.subtitle).toContain("→");
    }
  });

  it("tolerates a missing cf object (geo nulls)", () => {
    const res = buildPresets(reqWithCf(undefined));
    expect(res.geo).toEqual({ city: null, region: null, country: null });
    expect(res.presets.length).toBeGreaterThan(0);
  });
});
