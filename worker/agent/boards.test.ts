import { describe, it, expect } from "vitest";
import { createBoardBuilder } from "./boards";
import { FixtureReplay } from "../mcp/replay";
import { FIXTURE_BY_ID, cpmaxxHotelsFor } from "../fixtures/index";

const DUBLIN = FIXTURE_BY_ID["dublin-oct"];
const CANCUN = FIXTURE_BY_ID["cancun-beach"];
const TRIP = "demo-board-test";

// Real replay payloads — the exact strings the loop hands to the builder.
function flightSearchPayload(): string {
  const r = new FixtureReplay(TRIP);
  return r["flightSearch"]({ origin: "MOB", destination: "DUB" });
}
// Featured routes now serve credentialed cpmaxx hotels (source:"cpmaxx"), not serp.
function hotelSearchPayload(loc = "Cancun"): string {
  const r = new FixtureReplay(TRIP);
  return r["hotelSearch"]({ location: loc });
}
// A serp-shaped hotel payload (no cpmaxx route) for exercising the serp mapper directly.
function serpHotelPayload(): string {
  return JSON.stringify({
    status: "ok", source: "serp", action: "list", count: 1, version: 1,
    candidates: [{
      id: "serp:h1", name: "The Dockland", area: "Docklands",
      pricePerNight: 214, priceTotal: 1498, nights: 7,
      reviewScore: 4.4, reviewScoreScale: 5, reviewCount: 1203, starRating: 4,
    }],
  });
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

  it("never leaks the credentialed CPMaxx quote-sheet URL into a public demo card", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_search", hotelSearchPayload("Cancun"), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    const cpmaxx = cpmaxxHotelsFor(CANCUN);
    expect(cpmaxx[0].hotelSheetUrl).toBeTruthy(); // sanity: the fixture really has one
    const serialized = JSON.stringify(ev.candidates);
    expect(serialized).not.toContain("hotelSheetUrl");
    expect(serialized).not.toContain(cpmaxx[0].hotelSheetUrl);
    for (const c of ev.candidates) {
      expect(c.detailUrl).toContain("google.com/search");
    }
  });

  it("derives legs from raw prod segments on live (non-replayed) flight candidates", () => {
    // Live/faithful passthrough candidates carry raw prod `segments`, not a
    // pre-shaped `legs` array (that's a replay-layer-only convenience). The
    // board must still populate legs so the routing/aircraft expander works.
    const build = createBoardBuilder();
    const ev = build("flight_search", JSON.stringify({
      status: "ok", action: "list", tripId: TRIP, count: 1, version: 1,
      candidates: [{
        id: "serp:live1", source: "serp", route: "MOB→DUB", price: 3426,
        validatingCarrier: "United", stops: 1, cabin: "Economy", durationMinutes: 747,
        segments: [
          {
            origin: "MOB", destination: "IAD",
            depart: "2026-10-12 12:53", arrive: "2026-10-12 16:15",
            carrier: "United", flightNumber: "UA 4314",
            durationMinutes: 142, layover: null, equipment: "Embraer ERJ-135/145",
          },
          {
            origin: "IAD", destination: "DUB",
            depart: "2026-10-12 19:05", arrive: "2026-10-13 07:20",
            carrier: "United", flightNumber: "UA 310",
            durationMinutes: 435, layover: "2h 50m", equipment: "Boeing 757",
          },
        ],
      }],
    }), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    const first = ev.candidates[0];
    expect(first.legs).toBeDefined();
    expect(first.legs).toHaveLength(2);
    expect(first.legs![0]).toMatchObject({ from: "MOB", to: "IAD", carrier: "United", flightNo: "UA 4314", aircraft: "Embraer ERJ-135/145" });
    expect(first.legs![1]).toMatchObject({ from: "IAD", to: "DUB", layoverAfter: "2h 50m" });
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

  it("flight candidate surfaces travelers + per-person from a 2-traveler total", () => {
    const build = createBoardBuilder();
    const ev = build("flight_list", JSON.stringify({
      status: "ok", action: "list", count: 1, version: 1,
      candidates: [{ id: "serp:f1", route: "ATL→CUN", airline: "Delta", price: 2954, pricePerPerson: 1477, stops: 0, cabin: "Economy" }],
    }), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    const c = ev.candidates[0];
    expect(c.travelers).toBe(2);
    expect(c.perPerson).toBe(1477);
    expect(c.meta).toMatch(/2 travelers/);
  });

  it("maps a featured hotel_search result to a credentialed cpmaxx board", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_search", hotelSearchPayload("Cancun"), TRIP);
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.kind).toBe("hotel");
    const cpmaxx = cpmaxxHotelsFor(CANCUN);
    expect(ev.candidates).toHaveLength(cpmaxx.length);
    expect(ev.candidates.map((c) => c.id)).toEqual(cpmaxx.map((h) => h.id));
    expect(ev.candidates[0].title).toBe(cpmaxx[0].name);
    // Credentialed extras ride through (the "couldn't come from Google" wow): the
    // first Cancun card carries commission, a quote-sheet link, photo + photo count.
    const first = ev.candidates[0];
    expect(first.commission).toBe(cpmaxx[0].commission);
    expect(first.commissionPct).toBe(cpmaxx[0].commissionPct);
    // Public demo cards must NEVER carry the credentialed CPMaxx quote-sheet link —
    // use the same honest Google-by-name fallback the non-cpmaxx mapper uses.
    expect(first.detailUrl).toContain("google.com/search");
    expect(first.detailUrl).toContain(encodeURIComponent(cpmaxx[0].name));
    expect(first.detailUrl).not.toBe(cpmaxx[0].hotelSheetUrl);
    expect(first.detailLabel).toBe("details ↗");
    expect(first.image).toBe(cpmaxx[0].image);
    expect(first.photoCount).toBe(cpmaxx[0].pictureCount);
    // Client price is the headline; the per-night reconciles FROM it (client/nights),
    // not the raw cpmaxx rate, so total and per-night always agree.
    const cp = cpmaxx[0];
    expect(first.clientPrice).toBe(cp.clientPrice);
    expect(first.price).toBe(`$${Math.round(cp.clientPrice! / cp.nights!).toLocaleString("en-US")}/night`);
    expect(first.nights).toBe(cp.nights);
    expect(first.travelers).toBe(CANCUN.route.adults);
    // Context chip rides on meta: all-inclusive + nights + travelers.
    expect(first.meta).toMatch(/All-inclusive/);
    expect(first.meta).toMatch(/7 nts/);
    expect(first.meta).toMatch(/2 travelers/);
    // Ladder NOT shown when OTA ~= client total (no fake savings to claim).
    expect(first.otaFrom).toBeUndefined();
  });

  it("enriches serp hotel candidates with review scale, stay total, and a google search link", () => {
    const build = createBoardBuilder();
    const ev = build("hotel_list", serpHotelPayload(), TRIP);
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
        rank: 1, id: 990114, name: "Omni Cancun Villas", stars: 4,
        area: "Boulevard Kukulcan KM 16.5 Cancun 77500, Zona Hotelera",
        price_total: 8122.3, price_per_night: 1160,
        commission: 2436.69, commission_pct: 30,
        hotel_sheet_url: "https://cpmaxx.example/sheet/990114",
      },
      { rank: 2, id: "990115", name: "JW Marriott Cancun", stars: 5, price_per_night: 437 },
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
    expect(a.id).toBe("990114");           // numeric id coerced to string
    expect(a.title).toBe("Omni Cancun Villas");
    expect(a.price).toBe("$1,160/night");
    // Credentialed CPMaxx quote-sheet links must never reach a public demo card —
    // the Google-by-name fallback stands in instead.
    expect(a.detailUrl).toContain("google.com/search");
    expect(a.detailUrl).not.toBe("https://cpmaxx.example/sheet/990114");
    expect(a.detailLabel).toBe("details ↗");
    expect(a.commission).toBe(2436.69);
    expect(a.commissionPct).toBe(30);
    expect(a.meta).toContain("4★");
    expect(a.meta).toContain("Boulevard Kukulcan");
    expect(b.commission).toBeUndefined();  // absent fields stay absent
    expect(JSON.stringify(board.candidates)).not.toContain("cpmaxx.example/sheet");
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

// --- Ref-and-fetch hydration (backend `board` MCP-app tool) ---

import { boardRefFrom, boardFromData } from "./boards";

// The exact two-line shape voygent-lite's `board` tool returns (summary + ref),
// as joined by the MCP client's "\n" content join.
const BOARD_TOOL_RESULT =
  'flight board: 5 of 35 options for "Seattle, WA". The traveler picks in the board above; their choice saves to the trip.\n' +
  '{"__voygentBoardRef":{"tripId":"demo-abc","kind":"flight"}}';

describe("boardRefFrom", () => {
  it("extracts the tripId/kind ref from a board tool result", () => {
    expect(boardRefFrom(BOARD_TOOL_RESULT)).toEqual({ tripId: "demo-abc", kind: "flight" });
  });
  it("returns null when no ref marker is present", () => {
    expect(boardRefFrom('{"status":"ok","flights":[]}')).toBeNull();
    expect(boardRefFrom("plain text result")).toBeNull();
  });
  it("returns null on a malformed ref line", () => {
    expect(boardRefFrom("summary\n{broken __voygentBoardRef json")).toBeNull();
  });
});

describe("boardFromData", () => {
  const data = (over: Record<string, unknown> = {}) => JSON.stringify({
    __voygentBoardData: {
      kind: "flight", tripId: "demo-abc", title: "Seattle, WA", currency: "USD",
      options: [
        { id: "kiwi:f1", label: "MOB → SEA · American", lo: 830, hi: null, priceLabel: "$830", ribbon: "Best value", meta: { a: "1 stop · 7h 10m" }, perPerson: 415 },
        { id: "ref:bench", label: "Google Flights reference", lo: 800, hi: null, bookable: false },
      ],
      selectedId: null, shown: 2, total: 35, controls: [], note: null,
      ...over,
    },
  });

  it("maps board_data options to demo candidates, dropping unbookable reference rows", () => {
    const ev = boardFromData(data(), "demo-abc");
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.kind).toBe("flight");
    expect(ev.tripId).toBe("demo-abc");
    expect(ev.candidates).toHaveLength(1);
    const c = ev.candidates[0];
    expect(c).toMatchObject({
      id: "kiwi:f1", title: "MOB → SEA · American", price: "$830",
      meta: "1 stop · 7h 10m", badge: "Best value", perPerson: 415,
      summary: "MOB → SEA · American, $830",
    });
  });

  it("flattens per-stay hotel groups when options[] is empty", () => {
    const ev = boardFromData(data({
      kind: "hotel", options: [],
      stays: [
        { stayRef: "s1", label: "Seattle", sub: null, options: [{ id: "cp:h1", label: "Hotel Theodore", lo: 214, hi: null, priceLabel: "$214/night", commission: { amount: 120, rate: 10 } }], total: 1, shown: 1, selectedId: null, chosenId: null },
        { stayRef: "s2", label: "Tacoma", sub: null, options: [{ id: "cp:h2", label: "Hotel Murano", lo: 180, hi: null }], total: 1, shown: 1, selectedId: null, chosenId: null },
      ],
    }), "demo-abc");
    if (ev?.type !== "board") throw new Error("expected board event");
    expect(ev.kind).toBe("hotel");
    expect(ev.candidates.map((c) => c.id)).toEqual(["cp:h1", "cp:h2"]);
    expect(ev.candidates[0].commission).toBe(120);
    expect(ev.candidates[0].commissionPct).toBe(10);
  });

  it("returns null for kinds the demo board cannot render, and for empty/invalid payloads", () => {
    expect(boardFromData(data({ kind: "cruise" }), "demo-abc")).toBeNull();
    expect(boardFromData(data({ kind: "customize" }), "demo-abc")).toBeNull();
    expect(boardFromData(data({ options: [] }), "demo-abc")).toBeNull();
    expect(boardFromData("not json", "demo-abc")).toBeNull();
    expect(boardFromData('{"no":"marker"}', "demo-abc")).toBeNull();
  });
});
