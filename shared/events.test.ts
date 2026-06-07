import { describe, it, expect } from "vitest";
import { encodeSse, type ServerEvent, type FolioData } from "./events";

describe("encodeSse", () => {
  it("encodes a text event as one SSE frame", () => {
    const ev: ServerEvent = { type: "text", delta: "Hello" };
    expect(encodeSse(ev)).toBe(`data: ${JSON.stringify(ev)}\n\n`);
  });
  it("encodes a folio event carrying FolioData", () => {
    const ev: ServerEvent = { type: "folio", folio: { tripId: "t1", title: "Cancún", flights: [], hotels: [] } };
    expect(encodeSse(ev)).toContain('"type":"folio"');
  });

  it("round-trips an inspector tool event", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "tool", exchangeId: "x1", turn: 0,
      name: "flight_search", args: { origin: "MOB" }, result: '{"count":2}', latencyMs: 12, ok: true,
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });

  it("round-trips an inspector summary event with costByModel", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "summary", exchangeId: "x1",
      turns: 3, toolCalls: 6, exposedToolCount: 9, fullToolCount: 79,
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 980, cacheCreationTokens: 0,
      costByModel: { haiku: 0.0026, sonnet: 0.013, opus: 0.065 },
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });
});

describe("FolioData enrichment shape", () => {
  it("encodes a folio carrying days[] and includes[]", () => {
    const folio: FolioData = {
      tripId: "t1", title: "Dublin", flights: [], hotels: [],
      days: [{
        title: "Day 1 — Dublin", date: "2026-10-12", location: "Dublin",
        activities: [{ name: "Kilmainham Gaol", description: "Historic tour", url: "https://x" }],
        dining: [{ name: "The Winding Stair", cuisine: "Irish", description: "Riverside", url: "https://y" }],
        stay: "Baggotrath House",
      }],
      includes: [{ key: "whats-included", title: "What's included", body: "Flights and hotels." }],
    };
    const line = encodeSse({ type: "folio", folio });
    expect(line).toContain("Kilmainham");
    expect(line).toContain("whats-included");
  });
});
