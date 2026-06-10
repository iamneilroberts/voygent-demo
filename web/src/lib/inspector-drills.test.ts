import { describe, it, expect } from "vitest";
import { funnelRows, costScenarios, type DrillContext } from "./inspector-drills";
import type { InsSavings } from "../Inspector";

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
