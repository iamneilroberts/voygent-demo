import { describe, it, expect } from "vitest";
import { FixtureReplay, type ReplayHelpers } from "./replay";
import { FIXTURE_BY_ID, matchFlightFixture, matchHotelFixture, type Fixture } from "../fixtures/index";

const DUBLIN = FIXTURE_BY_ID["dublin-oct"];

// A fake staging trip backing the live readTrip/patchTrip helpers.
function fakeHelpers(initial: Record<string, any> = {}) {
  const trip: Record<string, any> = { meta: {}, flights: [], lodging: [], hotels: [], ...initial };
  const patches: Array<Record<string, unknown>> = [];
  const helpers: ReplayHelpers = {
    readTrip: async () => trip,
    patchTrip: async (updates) => { patches.push(updates); Object.assign(trip, updates); },
  };
  return { trip, patches, helpers };
}

describe("fixture matching", () => {
  it("matches a flight search by IATA code", () => {
    expect(matchFlightFixture("MOB", "DUB")?.route.id).toBe("dublin-oct");
  });
  it("matches case-insensitively and by city name", () => {
    expect(matchFlightFixture("mob", "dublin")?.route.id).toBe("dublin-oct");
  });
  it("returns null for an off-menu origin", () => {
    expect(matchFlightFixture("BOS", "DUB")).toBeNull();
  });
  it("matches a hotel search by city", () => {
    expect(matchHotelFixture("Dublin")?.route.id).toBe("dublin-oct");
  });
});

describe("flight search + list replay", () => {
  it("returns real captured candidates with ids", () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(r["flightSearch"]({ origin: "MOB", destination: "DUB" }));
    expect(out.status).toBe("ok");
    expect(out.count).toBe(DUBLIN.flights.length);
    expect(out.candidates[0].id).toBe(DUBLIN.flights[0].id);
    expect(out.candidates[0].price).toBe(DUBLIN.flights[0].price);
  });

  it("an off-menu route returns zero candidates + an honest note (no fabrication)", () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(r["flightSearch"]({ origin: "BOS", destination: "PAR" }));
    expect(out.count).toBe(0);
    expect(out.candidates).toEqual([]);
    expect(out.note).toContain("No results for");
    // must NOT leak the internal mechanism to the model
    expect(out.note).not.toMatch(/captured|demo|fixture|replay/i);
  });

  it("flight_list requires a prior search", () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(r["flightList"]({ action: "list" }));
    expect(out.count).toBe(0);
    expect(out.note).toContain("flight_search first");
  });
});

describe("promote_flights fabrication guard", () => {
  it("promotes a real staged candidate to the prod-captured object", async () => {
    const r = new FixtureReplay("demo-x");
    r["flightSearch"]({ origin: "MOB", destination: "DUB" }); // sets routeId
    const realId = DUBLIN.flights[0].id;
    const { patches, helpers } = fakeHelpers({ flights: [{ _candidateId: realId }] });
    const out = JSON.parse(await r["promoteFlights"]({}, helpers));
    expect(out.ok).toBe(true);
    expect(out.flights).toEqual(DUBLIN.promotedFlightsById[realId]);
    expect(patches[0].flights).toEqual(DUBLIN.promotedFlightsById[realId]);
  });

  it("REJECTS an invented candidate id and writes nothing", async () => {
    const r = new FixtureReplay("demo-x");
    r["flightSearch"]({ origin: "MOB", destination: "DUB" });
    const { patches, helpers } = fakeHelpers({ flights: [{ _candidateId: "serp:FAKE", airline: "Imaginary Air", price: 99 }] });
    const out = JSON.parse(await r["promoteFlights"]({}, helpers));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("candidate_not_found");
    expect(patches).toHaveLength(0);
  });

  it("errors when nothing is staged", async () => {
    const r = new FixtureReplay("demo-x");
    r["flightSearch"]({ origin: "MOB", destination: "DUB" });
    const { helpers } = fakeHelpers({ flights: [] });
    const out = JSON.parse(await r["promoteFlights"]({}, helpers));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("nothing_staged");
  });
});

describe("promote_hotels_to_lodging fabrication guard", () => {
  it("writes only candidate-id-backed hotels, dropping invented ones", async () => {
    const r = new FixtureReplay("demo-x");
    r["hotelSearch"]({ location: "Dublin" }); // sets hotelRouteId
    const realId = DUBLIN.hotels[0].id;
    const { patches, helpers } = fakeHelpers({
      hotels: [
        { _candidateId: realId },
        { _candidateId: "serp:FAKEHOTEL", name: "Invented Inn", priceTotal: 1 },
        { name: "No id at all", priceTotal: 2 },
      ],
    });
    const out = JSON.parse(await r["promoteHotels"](helpers));
    expect(out.ok).toBe(true);
    expect(out.promoted).toBe(1);
    expect(out.lodging[0]).toEqual(DUBLIN.promotedLodgingById[realId]);
    expect(out.droppedUnknownCandidates).toContain("serp:FAKEHOTEL");
    expect(patches[0].lodging).toHaveLength(1);
  });

  it("retains promoted flights + lodging via lastPromoted() (folio overlay source)", async () => {
    const r = new FixtureReplay("demo-x");
    r["flightSearch"]({ origin: "MOB", destination: "DUB" });
    r["hotelSearch"]({ location: "Dublin" });
    const fId = DUBLIN.flights[0].id, hId = DUBLIN.hotels[0].id;
    await r["promoteFlights"]({}, fakeHelpers({ flights: [{ _candidateId: fId }] }).helpers);
    await r["promoteHotels"](fakeHelpers({ hotels: [{ _candidateId: hId }] }).helpers);
    const last = r.lastPromoted();
    expect(last.flights).toEqual(DUBLIN.promotedFlightsById[fId]);
    expect(last.lodging).toHaveLength(1);
    expect(last.lodging![0]).toEqual(DUBLIN.promotedLodgingById[hId]);
  });

  it("errors when no real candidate is staged", async () => {
    const r = new FixtureReplay("demo-x");
    r["hotelSearch"]({ location: "Dublin" });
    const { helpers } = fakeHelpers({ hotels: [{ name: "fake", _candidateId: "serp:NOPE" }] });
    const out = JSON.parse(await r["promoteHotels"](helpers));
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("no_staged_candidates");
  });
});

describe("FixtureReplay measurement", () => {
  it("records lastMeasurement for an intercepted flight_search", async () => {
    const r = new FixtureReplay("demo-x");
    const helpers = { readTrip: async () => ({}), patchTrip: async () => {} };
    const out = await r.handle("flight_search", { origin: "MOB", destination: "DUB" }, helpers as any);
    const m = r.lastMeasurement();
    expect(m).toBeTruthy();
    expect(m!.tool).toBe("flightSearch");
    expect(m!.modelFacingTokens).toBe(Math.ceil(out.length / 4));
  });

  it("clears lastMeasurement on a non-measuring intercepted call (promote)", async () => {
    const r = new FixtureReplay("demo-y");
    const helpers = { readTrip: async () => ({ flights: [{ _candidateId: "x" }] }), patchTrip: async () => {} };
    await r.handle("flight_search", { origin: "MOB", destination: "DUB" }, helpers as any);
    expect(r.lastMeasurement()).toBeTruthy();
    try {
      await r.handle("promote_flights", {}, helpers as any);   // intercepted, but sets no measurement
    } catch {
      // promote may error (no valid candidate id), but the reset must have fired at entry
    }
    expect(r.lastMeasurement()).toBeNull();
  });
});

// Minimal in-memory helpers: capture what patchTrip writes so we can assert the
// fabrication guard wrote ONLY fixture-keyed objects.
function makeHelpers() {
  const trip: Record<string, any> = { meta: {}, flights: [], lodging: [], hotels: [], itinerary: [] };
  return {
    trip,
    h: {
      readTrip: async () => trip,
      patchTrip: async (u: Record<string, unknown>) => { Object.assign(trip, u); },
    } as ReplayHelpers,
  };
}

describe("enrichment interception (fabrication guard)", () => {
  it("excursion_search returns slim excursion candidates with real productCodes", async () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(await r.handle("excursion_search",
      { source: "viator", trip_id: "demo-x", destination: "Dublin" }, makeHelpers().h));
    expect(out.status).toBe("ok");
    if (out.count > 0) {
      expect(typeof out.candidates[0].productCode).toBe("string");
      expect(out.candidates[0]).not.toHaveProperty("coverImage"); // slim
    }
  });

  it("apply_gap_tour_picks writes ONLY fixture-keyed activities; drops unknown productCodes", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    const real = r.fixtureExcursionCodes();
    const picks = [...real.slice(0, 1).map((code) => ({ day: 1, productCode: code })),
                   { day: 1, productCode: "FAKE-INVENTED-CODE" }];
    const out = JSON.parse(await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks }, h));
    expect(out).toBeTruthy();
    const allActs = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    expect(allActs.find((a: any) => a.productCode === "FAKE-INVENTED-CODE")).toBeUndefined();
    if (real.length > 0) expect(allActs.length).toBeGreaterThan(0);
  });

  it("tripadvisor_search writes only fixture dining into itinerary[].dining", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    const out = JSON.parse(await r.handle("tripadvisor_search",
      { trip_id: "demo-x", location: "Dublin", category: "restaurants" }, h));
    expect(out.status).toBe("ok");
    const allDining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    for (const d of allDining) expect(r.fixtureDiningIds().includes(d.id)).toBe(true);
  });
});

const TEST_FIXTURE: Record<string, Fixture> = {
  "test-dub": {
    route: { id: "test-dub", label: "T", origin: "MOB", destination: "DUB", city: "Dublin", depart: "2026-10-12", ret: "2026-10-14", adults: 2 },
    flights: [], hotels: [], promotedFlightsById: {}, promotedLodgingById: {},
    itineraryDays: [{ day: 1, date: "2026-10-12", location: "Dublin", title: "Arrive Dublin" }],
    excursions: [{ productCode: "VX1", title: "Kilmainham Gaol", day: 1, free: false, priceFrom: 26, currency: "USD", durationMinutes: 90, rating: 4.7, reviewCount: 1200, description: "Historic gaol.", bookingUrl: "https://v/1", coverImage: null }],
    dining: [{ id: "TA1", name: "The Winding Stair", day: 1, cuisine: "Irish", rating: 4.5, reviewCount: 800, priceLevel: "$$ - $$$", description: "Riverside.", url: "https://t/1" }],
  } as unknown as Fixture,
};

describe("enrichment positive writes (injected fixture)", () => {
  it("apply_gap_tour_picks writes the fixture-keyed activity into itinerary[day].activities", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: 1, productCode: "VX1" }] }, h);
    const acts = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({ name: "Kilmainham Gaol", productCode: "VX1", addedBy: "gap-recommender" });
  });

  it("tripadvisor_search writes the fixture dining into itinerary[day].dining", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { trip, h } = makeHelpers();
    await r.handle("tripadvisor_search", { trip_id: "demo-x", location: "Dublin", category: "restaurants" }, h);
    const dining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    expect(dining).toHaveLength(1);
    expect(dining[0]).toMatchObject({ id: "TA1", name: "The Winding Stair" });
  });

  it("clears accumulated days when the enrichment route changes", async () => {
    const r = new FixtureReplay("demo-x", TEST_FIXTURE);
    const { h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: 1, productCode: "VX1" }] }, h);
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Nowhereville" }, h);
    expect(r.lastPromoted().itinerary).toBeNull();
  });
});
