import { describe, it, expect } from "vitest";
import { funnelRows, costScenarios, ganttBars, fanoutGroups, litSupplierIds, type DrillContext } from "./inspector-drills";
import type { InsSavings, InsTool, InsFanout } from "../Inspector";

function savings(partial: Partial<InsSavings>): InsSavings {
  return {
    type: "inspector", kind: "savings", exchangeId: "x", mechanism: "searchDistill",
    tokensSaved: 0, basis: "chars/4", scope: "aggregate", detail: "", ...partial,
  };
}

describe("funnelRows", () => {
  it("returns one row per searchDistill event that carries raw+slim, with pct kept out", () => {
    const ctx = { savings: [
      savings({ tool: "hotelSearch", rawTokens: 1195, slimTokens: 343, tokensSaved: 852 }),
      savings({ tool: "flightList", rawTokens: 699, slimTokens: 283, tokensSaved: 416 }),
    ] } as unknown as DrillContext;
    const rows = funnelRows(ctx);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tool: "hotelSearch", rawTokens: 1195, slimTokens: 343, pct: 71 });
    expect(rows[1].pct).toBe(60); // 1 - 283/699 = 0.595 -> 60
  });

  it("ignores savings of other mechanisms and rows missing raw/slim", () => {
    const ctx = { savings: [
      savings({ mechanism: "patch", rawTokens: 100, slimTokens: 10 }),
      savings({ mechanism: "searchDistill", tool: "x" }), // no raw/slim
    ] } as unknown as DrillContext;
    expect(funnelRows(ctx)).toHaveLength(0);
  });
});

describe("costScenarios", () => {
  const ctx = {
    actualCost: 0.41,
    cost: { haiku: 0.12, sonnet: 0.83, opus: 2.07 },
  } as unknown as DrillContext;

  it("returns actual + all-Sonnet + all-Opus with multipliers vs actual", () => {
    const rows = costScenarios(ctx);
    expect(rows.map((r) => r.label)).toEqual(["Actual (routed)", "All Sonnet", "All Opus"]);
    expect(rows[0]).toMatchObject({ usd: 0.41, mult: 1, actual: true });
    expect(rows[2].usd).toBe(2.07);
    expect(rows[2].mult).toBeCloseTo(5.05, 1); // 2.07 / 0.41
  });

  it("guards divide-by-zero when actual cost is 0", () => {
    const rows = costScenarios({ actualCost: 0, cost: { haiku: 0, sonnet: 0.1, opus: 0.2 } } as unknown as DrillContext);
    expect(rows.every((r) => Number.isFinite(r.mult))).toBe(true);
  });
});

function tool(name: string, latencyMs: number): InsTool {
  return { type: "inspector", kind: "tool", exchangeId: "x", turn: 0, name, args: {}, result: "", latencyMs, ok: true };
}

describe("ganttBars", () => {
  it("lays tool calls end-to-end with cumulative offsets and a stage per call", () => {
    const ctx = { tools: [tool("hotel_search", 400), tool("hotel_list", 100), tool("patch_trip", 50)] } as unknown as DrillContext;
    const bars = ganttBars(ctx);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({ name: "hotel_search", stage: "search", offsetPct: 0 });
    // second bar starts after the first (400 / 550 total)
    expect(bars[1].offsetPct).toBeCloseTo((400 / 550) * 100, 1);
    expect(bars[1].stage).toBe("distill");
    expect(bars[2].stage).toBe("stage");
  });

  it("returns [] for no tools", () => {
    expect(ganttBars({ tools: [] } as unknown as DrillContext)).toEqual([]);
  });
});

function fanout(tool: string, sources: InsFanout["sources"], shortlisted: number): InsFanout {
  return { type: "inspector", kind: "fanout", exchangeId: "x", tool, sources, shortlisted };
}

describe("fanoutGroups / litSupplierIds", () => {
  const ctx = { fanout: [
    fanout("hotel_search", [
      { id: "cpmaxx", label: "CPMaxx", count: 8, credentialed: true },
      { id: "serp", label: "Google", count: 22, credentialed: false },
    ], 8),
    fanout("hotel_list", [
      { id: "cpmaxx", label: "CPMaxx", count: 8, credentialed: true },
    ], 6),
  ] } as unknown as DrillContext;

  it("returns one group per fanout event, preserving tool + sources + shortlisted", () => {
    const groups = fanoutGroups(ctx);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ tool: "hotel_search", shortlisted: 8 });
    expect(groups[0].sources.map((s) => s.id)).toEqual(["cpmaxx", "serp"]);
  });

  it("litSupplierIds is the distinct set of source ids across all events", () => {
    const lit = litSupplierIds(ctx);
    expect(lit.has("cpmaxx")).toBe(true);
    expect(lit.has("serp")).toBe(true);
    expect(lit.size).toBe(2);
  });

  it("empty when no fanout events", () => {
    expect(fanoutGroups({ fanout: [] } as unknown as DrillContext)).toEqual([]);
    expect(litSupplierIds({ fanout: [] } as unknown as DrillContext).size).toBe(0);
  });
});
