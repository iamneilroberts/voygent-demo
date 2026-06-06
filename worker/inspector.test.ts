import { describe, it, expect } from "vitest";
import {
  estTokens, utf8Bytes, scrubArgs, scrubResultText, scrubAdvisor,
  withInspectorCost, sessionCostByModel, stageForTool,
} from "./inspector";
import type { ServerEvent } from "../shared/events";

describe("estTokens / utf8Bytes", () => {
  it("estTokens is ceil(len/4)", () => { expect(estTokens("abcde")).toBe(2); });
  it("utf8Bytes counts UTF-8 bytes, not UTF-16 units", () => {
    expect("€".length).toBe(1);
    expect(utf8Bytes("€")).toBe(3);
  });
});

describe("scrubAdvisor", () => {
  it("drops advisor-only keys in nested objects and arrays", () => {
    const input = { price: 100, commission: 12, items: [{ netRate: 9, name: "x" }] };
    expect(scrubAdvisor(input)).toEqual({ price: 100, items: [{ name: "x" }] });
  });
  it("bounds recursion at depth 8 with a sentinel", () => {
    let deep: any = { v: 1 };
    for (let i = 0; i < 12; i++) deep = { nest: deep };
    const out = JSON.stringify(scrubAdvisor(deep));
    expect(out).toContain("[scrub: too deep]");
  });
  it("scrubResultText passes through non-JSON unchanged", () => {
    expect(scrubResultText("not json")).toBe("not json");
  });
  it("scrubArgs strips advisor keys from args", () => {
    expect(scrubArgs({ origin: "MOB", markupPct: 5 })).toEqual({ origin: "MOB" });
  });
});

describe("withInspectorCost", () => {
  it("fills costUsd on a zero-cost turn event", () => {
    const ev: ServerEvent = { type: "inspector", kind: "turn", exchangeId: "x", turn: 0,
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
    const out = withInspectorCost(ev, "claude-haiku-4-5");
    expect(out).toMatchObject({ kind: "turn", costUsd: 1 });
  });
  it("passes non-turn events through untouched", () => {
    const ev: ServerEvent = { type: "text", delta: "hi" };
    expect(withInspectorCost(ev, "claude-haiku-4-5")).toBe(ev);
  });
});

describe("sessionCostByModel", () => {
  it("returns three model costs (opus > sonnet > haiku for same usage)", () => {
    const c = sessionCostByModel({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(c.opus).toBeGreaterThan(c.sonnet);
    expect(c.sonnet).toBeGreaterThan(c.haiku);
  });
});

describe("stageForTool", () => {
  it("maps tools to orchestration stages", () => {
    expect(stageForTool("save_trip")).toBe("create");
    expect(stageForTool("flight_search")).toBe("search");
    expect(stageForTool("flight_list")).toBe("distill");
    expect(stageForTool("patch_trip")).toBe("stage");
    expect(stageForTool("promote_flights")).toBe("promote");
    expect(stageForTool("read_trip")).toBeNull();
  });
});
