import { describe, it, expect } from "vitest";
import { createBoardBuilder } from "./boards";
import { FixtureReplay } from "../mcp/replay";
import { FIXTURE_BY_ID } from "../fixtures/index";

const DUBLIN = FIXTURE_BY_ID["dublin-oct"];
const TRIP = "demo-board-test";

// Real replay payloads — the exact strings the loop hands to the builder.
function flightSearchPayload(): string {
  const r = new FixtureReplay(TRIP);
  return r["flightSearch"]({ origin: "MOB", destination: "DUB" });
}
function hotelSearchPayload(): string {
  const r = new FixtureReplay(TRIP);
  return r["hotelSearch"]({ location: "Dublin" });
}

describe("createBoardBuilder", () => {
  it("maps a flight_search result to a flight board with real candidate ids", () => {
    const build = createBoardBuilder();
    const ev = build("flight_search", flightSearchPayload(), TRIP);
    expect(ev).toBeTruthy();
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.kind).toBe("flight");
    expect(ev.tripId).toBe(TRIP);
    expect(ev.boardId).toBeTruthy();
    expect(ev.candidates).toHaveLength(DUBLIN.flights.length);
    expect(ev.candidates.map((c) => c.id)).toEqual(DUBLIN.flights.map((f) => f.id));
    // Every candidate carries a human summary that embeds enough to echo back.
    for (const c of ev.candidates) {
      expect(c.title).toBeTruthy();
      expect(c.summary).toContain(c.title);
    }
  });

  it("carries real per-leg routing detail on featured flight candidates", () => {
    const build = createBoardBuilder();
    const ev = build("flight_search", flightSearchPayload(), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    const first = ev.candidates[0];
    // Real captured Dublin flight: MOB→IAD→DUB, two legs.
    expect(first.legs && first.legs.length).toBeGreaterThanOrEqual(2);
    const [a, b] = first.legs!;
    expect(a.from).toBe("MOB");
    expect(b.to).toBe("DUB");
    expect(a.flightNo).toBeTruthy();
    expect(a.aircraft).toBeTruthy();
    expect(a.depart).toMatch(/\d/);
    // The connecting leg names its layover so the routing detail can call it out.
    expect(b.layoverAfter).toBeTruthy();
    // Total duration now shows on the meta line.
    expect(first.meta).toMatch(/\dh/);
  });

  it("formats flight price as whole USD with separators", () => {
    const build = createBoardBuilder();
    const ev = build("flight_list", JSON.stringify({
      status: "ok", action: "list", tripId: TRIP, count: 1, version: 1,
      candidates: [{ id: "serp:x1", route: "MOB→DUB", airline: "United", price: 3426.4, stops: 1, cabin: "Economy" }],
    }), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.candidates[0].price).toBe("$3,426");
    expect(ev.candidates[0].meta).toBe("United · 1 stop · Economy");
    expect(ev.candidates[0].summary).toBe("MOB→DUB, United, 1 stop, $3,426");
  });

  it("maps a hotel_search result to a hotel board", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_search", hotelSearchPayload(), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.kind).toBe("hotel");
    expect(ev.candidates).toHaveLength(DUBLIN.hotels.length);
    expect(ev.candidates.map((c) => c.id)).toEqual(DUBLIN.hotels.map((h) => h.id));
    expect(ev.candidates[0].title).toBe(DUBLIN.hotels[0].name);
  });

  it("enriches serp hotel candidates with review scale, stay total, and a google search link", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_search", hotelSearchPayload(), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    const first = ev.candidates[0];
    // Google-by-name fallback (serp exposes no deep link) — mirrors voygent-lite.
    expect(first.detailUrl).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
    expect(first.detailLabel).toBe("search ↗");
    // Review scale disambiguates the score (Google Hotels is /5).
    expect(first.meta).toMatch(/\/5/);
    // Stay total shows next to the nightly rate.
    expect(first.meta).toMatch(/total/);
  });

  it("returns null for non-board tools", () => {
    const build = createBoardBuilder();
    expect(build("save_trip", JSON.stringify({ ok: true }), TRIP)).toBeNull();
    expect(build("patch_trip", JSON.stringify({ ok: true }), TRIP)).toBeNull();
    expect(build("promote_flights", JSON.stringify({ ok: true, candidates: [{ id: "x" }] }), TRIP)).toBeNull();
  });

  it("returns null for zero-result and clear payloads", () => {
    const build = createBoardBuilder();
    const noResults = new FixtureReplay(TRIP)["flightSearch"]({ origin: "BOS", destination: "PAR" });
    expect(build("flight_search", noResults, TRIP)).toBeNull();
    const cleared = new FixtureReplay(TRIP)["flightList"]({ action: "clear" });
    expect(build("flight_list", cleared, TRIP)).toBeNull();
  });

  it("returns null for malformed result text", () => {
    const build = createBoardBuilder();
    expect(build("flight_search", "ERROR: upstream timeout", TRIP)).toBeNull();
    expect(build("flight_search", "not json", TRIP)).toBeNull();
  });

  it("dedupes consecutive identical candidate sets (search → list)", () => {
    const build = createBoardBuilder();
    const r = new FixtureReplay(TRIP);
    const search = r["flightSearch"]({ origin: "MOB", destination: "DUB" });
    const list = r["flightList"]({ action: "list" });
    expect(build("flight_search", search, TRIP)).toBeTruthy();
    expect(build("flight_list", list, TRIP)).toBeNull(); // same ids → deduped
    // a different kind is NOT deduped
    expect(build("hotel_search", hotelSearchPayload(), TRIP)).toBeTruthy();
  });

  it("scrubs advisor-economics keys defensively", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_list", JSON.stringify({
      status: "ok", action: "list", count: 1, version: 1,
      candidates: [{ id: "serp:h1", name: "Test Hotel", area: "Docklands", pricePerNight: 214, commissionPct: 12, netRate: 180 }],
    }), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(JSON.stringify(ev)).not.toMatch(/commission|netRate/i);
    expect(ev.candidates[0].price).toBe("$214/night");
  });
});

describe("hotel_search_and_rank (cpmaxx live) board mapping", () => {
  const cpmaxxResult = JSON.stringify({
    status: "success",
    hotels: [
      {
        rank: 1, id: 537754, name: "Omni Cancun Villas", stars: 4,
        area: "Boulevard Kukulcan KM 16.5 Cancun 77500, Zona Hotelera",
        price_total: 8122.3, price_per_night: 1160,
        commission: 2436.69, commission_pct: 30,
        hotel_sheet_url: "https://cpmaxx.example/sheet/537754",
      },
      { rank: 2, id: "537755", name: "JW Marriott Cancun", stars: 5, price_per_night: 437 },
    ],
  });

  it("maps {hotels:[...]} to a hotel board with commission + detail link", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_search_and_rank", cpmaxxResult, "demo-t");
    expect(ev).not.toBeNull();
    expect(ev!.type).toBe("board");
    const board = ev as Extract<NonNullable<typeof ev>, { type: "board" }>;
    expect(board.kind).toBe("hotel");
    expect(board.candidates).toHaveLength(2);
    const [a, b] = board.candidates;
    expect(a.id).toBe("537754");           // numeric id coerced to string
    expect(a.title).toBe("Omni Cancun Villas");
    expect(a.price).toBe("$1,160/night");
    expect(a.detailUrl).toBe("https://cpmaxx.example/sheet/537754");
    expect(a.commission).toBe(2436.69);
    expect(a.commissionPct).toBe(30);
    expect(a.meta).toContain("4★");
    expect(a.meta).toContain("Boulevard Kukulcan");
    expect(b.commission).toBeUndefined();  // absent fields stay absent
  });

  it("returns null when hotels array is empty", () => {
    const build = createBoardBuilder();
    expect(build("hotel_search_and_rank", JSON.stringify({ status: "success", hotels: [] }), "t")).toBeNull();
  });

  it("does not read {candidates:[...]} for the cpmaxx tool name", () => {
    const build = createBoardBuilder();
    const wrongShape = JSON.stringify({ candidates: [{ id: "x", name: "Hotel X" }] });
    expect(build("hotel_search_and_rank", wrongShape, "t")).toBeNull();
  });
});
