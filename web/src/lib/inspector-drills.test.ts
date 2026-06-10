import { describe, it, expect } from "vitest";
import { funnelRows, type DrillContext } from "./inspector-drills";
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
