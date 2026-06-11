import { describe, it, expect } from "vitest";
import {
  STATS_COLUMNS, STATS_INSERT_SQL, statsRowFromSummary, shapeStats,
  type StatsSummary, type StatsCtx, type StatsAggRow,
} from "./stats";
import { DEFAULT_ROUTING } from "../shared/models";

const summary: StatsSummary = {
  turns: 4, toolCalls: 11, exposedToolCount: 106, fullToolCount: 120,
  inputTokens: 1200, outputTokens: 800, cacheReadTokens: 9000, cacheCreationTokens: 1500,
  costByModel: { haiku: 0.01, sonnet: 0.03, opus: 0.15 },
  actualCostUsd: 0.024,
  actualCostByModel: { "claude-sonnet-4-6": 0.02, "claude-haiku-4-5": 0.004 },
};

const ctx: StatsCtx = {
  sessionId: "sess-1", exchangeId: "exch-1", tripId: "demo-abcd1234",
  boardsMode: true, liveMode: false, routing: DEFAULT_ROUTING,
};

describe("statsRowFromSummary", () => {
  it("produces a tuple whose length matches the column list", () => {
    const row = statsRowFromSummary(summary, ctx, 5000, 1234567890);
    expect(row).toHaveLength(STATS_COLUMNS.length);
    // and the INSERT has one placeholder per column
    expect((STATS_INSERT_SQL.match(/\?/g) ?? [])).toHaveLength(STATS_COLUMNS.length);
  });

  it("maps fields to the right positions and splits actual cost by tier", () => {
    const row = statsRowFromSummary(summary, ctx, 5000, 1234567890);
    const at = (col: typeof STATS_COLUMNS[number]) => row[STATS_COLUMNS.indexOf(col)];
    expect(at("ts")).toBe(1234567890);
    expect(at("session_id")).toBe("sess-1");
    expect(at("exchange_id")).toBe("exch-1");
    expect(at("trip_id")).toBe("demo-abcd1234");
    expect(at("boards_mode")).toBe(1);
    expect(at("live_mode")).toBe(0);
    expect(at("routing_mode")).toBe("smart");
    expect(at("routing_json")).toBe(JSON.stringify(DEFAULT_ROUTING));
    expect(at("turns")).toBe(4);
    expect(at("tool_calls")).toBe(11);
    expect(at("exposed_tools")).toBe(106);
    expect(at("full_tools")).toBe(120);
    expect(at("in_tok")).toBe(1200);
    expect(at("out_tok")).toBe(800);
    expect(at("cache_read")).toBe(9000);
    expect(at("cache_write")).toBe(1500);
    expect(at("actual_cost_usd")).toBe(0.024);
    expect(at("actual_haiku")).toBe(0.004);
    expect(at("actual_sonnet")).toBe(0.02);
    expect(at("actual_opus")).toBe(0);
    expect(at("cost_haiku")).toBe(0.01);
    expect(at("cost_sonnet")).toBe(0.03);
    expect(at("cost_opus")).toBe(0.15);
    expect(at("saved_tokens")).toBe(5000);
  });

  it("rounds and clamps saved_tokens to a non-negative integer", () => {
    const at = (row: unknown[], col: typeof STATS_COLUMNS[number]) => row[STATS_COLUMNS.indexOf(col)];
    expect(at(statsRowFromSummary(summary, ctx, 12.6, 0), "saved_tokens")).toBe(13);
    expect(at(statsRowFromSummary(summary, ctx, -50, 0), "saved_tokens")).toBe(0);
  });

  it("tolerates a missing actualCostByModel (all tiers zero)", () => {
    const row = statsRowFromSummary({ ...summary, actualCostByModel: undefined }, ctx, 0, 0);
    const at = (col: typeof STATS_COLUMNS[number]) => row[STATS_COLUMNS.indexOf(col)];
    expect(at("actual_haiku")).toBe(0);
    expect(at("actual_sonnet")).toBe(0);
    expect(at("actual_opus")).toBe(0);
  });

  it("includes code_id as a bound column when present in ctx", () => {
    const row = statsRowFromSummary(summary, { ...ctx, codeId: "self-1" }, 0, 0);
    expect(STATS_COLUMNS).toContain("code_id");
    expect(row[STATS_COLUMNS.indexOf("code_id")]).toBe("self-1");
  });

  it("binds null code_id when absent from ctx", () => {
    const row = statsRowFromSummary(summary, ctx, 0, 0);
    expect(row[STATS_COLUMNS.indexOf("code_id")]).toBeNull();
  });
});

describe("shapeStats", () => {
  it("derives the aggregate response from a full row", () => {
    const aggRow: StatsAggRow = {
      exchanges: 42, sessions: 9, trips: 7,
      totalActualCostUsd: 1.23, totalSavedTokens: 99000, totalTokens: 500000,
      actualHaiku: 0.4, actualSonnet: 0.7, actualOpus: 0.13,
    };
    expect(shapeStats(aggRow)).toEqual({
      sessions: 9, exchanges: 42, trips: 7,
      totalActualCostUsd: 1.23, totalSavedTokens: 99000, totalTokens: 500000,
      // other = total - haiku - sonnet - opus = 1.23 - 1.23 ≈ 0 (closeTo absorbs float dust)
      byModel: { haiku: 0.4, sonnet: 0.7, opus: 0.13, other: expect.closeTo(0, 6) },
    });
  });

  it("coerces null/undefined/NaN sums to zeros (empty table / D1 error)", () => {
    const zero = {
      sessions: 0, exchanges: 0, trips: 0,
      totalActualCostUsd: 0, totalSavedTokens: 0, totalTokens: 0,
      byModel: { haiku: 0, sonnet: 0, opus: 0, other: 0 },
    };
    expect(shapeStats(null)).toEqual(zero);
    expect(shapeStats(undefined)).toEqual(zero);
    expect(shapeStats({ exchanges: NaN, totalActualCostUsd: undefined } as unknown as StatsAggRow)).toEqual(zero);
  });
});

describe("shapeStats other-bucket", () => {
  it("derives byModel.other from total minus the Claude trio", () => {
    const s = shapeStats({
      sessions: 1, exchanges: 1, trips: 1,
      totalActualCostUsd: 1.00, totalSavedTokens: 0, totalTokens: 0,
      actualHaiku: 0.20, actualSonnet: 0.30, actualOpus: 0.00,
    });
    expect(s.byModel.other).toBeCloseTo(0.50, 6); // 1.00 - 0.20 - 0.30 - 0.00
  });
  it("never goes negative when rounding makes the trio exceed the total", () => {
    const s = shapeStats({ totalActualCostUsd: 0.40, actualHaiku: 0.25, actualSonnet: 0.20, actualOpus: 0 });
    expect(s.byModel.other).toBe(0);
  });
});
