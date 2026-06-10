import { describe, it, expect } from "vitest";
import { FixtureReplay, type ReplayHelpers } from "./replay";
import { FIXTURE_BY_ID, matchFlightFixture, matchHotelFixture, cpmaxxHotelsFor, type Fixture } from "../fixtures/index";

const DUBLIN = FIXTURE_BY_ID["dublin-oct"];
const CANCUN = FIXTURE_BY_ID["cancun-beach"];
const NYC = FIXTURE_BY_ID["nyc-weekend"];

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

describe("credentialed cpmaxx hotel replay", () => {
  it("serves cpmaxx hotels (source:cpmaxx) for a featured route, not serp", () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(r["hotelSearch"]({ location: "Cancun" }));
    expect(out.status).toBe("ok");
    expect(out.source).toBe("cpmaxx");
    const cpmaxx = cpmaxxHotelsFor(CANCUN);
    expect(out.count).toBe(cpmaxx.length);
    expect(out.candidates.map((c: any) => c.id)).toEqual(cpmaxx.map((h) => h.id));
    // Slim, model-facing: credentialed numbers ride through, heavy fields do NOT.
    const first = out.candidates[0];
    expect(first.source).toBe("cpmaxx");
    expect(first.commission).toBe(cpmaxx[0].commission);
    expect(first.clientPrice).toBe(cpmaxx[0].clientPrice);
    expect(first).not.toHaveProperty("hotelSheetUrl");
    expect(first).not.toHaveProperty("image");
    expect(first).not.toHaveProperty("marketingBlurb");
  });

  it("cpmaxx slim payload carries travelers + allInclusive (cheap context, no heavy fields)", () => {
    const r = new FixtureReplay("demo-x");
    const out = JSON.parse(r["hotelSearch"]({ location: "Cancun" }));
    const first = out.candidates[0];
    expect(first.travelers).toBe(CANCUN.route.adults); // 2
    expect(first.nights).toBe(cpmaxxHotelsFor(CANCUN)[0].nights);
    expect(typeof first.allInclusive).toBe("boolean");
    // a Cancun resort whose blurb says all-inclusive flags true
    const dreams = out.candidates.find((c: any) => c.id === "497758");
    expect(dreams.allInclusive).toBe(true);
    // heavy fields stay OUT of the model payload
    expect(first).not.toHaveProperty("hotelSheetUrl");
    expect(first).not.toHaveProperty("marketingBlurb");
  });

  it("hotel_list replays the same cpmaxx set after a search", () => {
    const r = new FixtureReplay("demo-x");
    r["hotelSearch"]({ location: "Cancun" });
    const out = JSON.parse(r["hotelList"]({ action: "list" }));
    expect(out.source).toBe("cpmaxx");
    expect(out.candidates.map((c: any) => c.id)).toEqual(cpmaxxHotelsFor(CANCUN).map((h) => h.id));
  });

  it("price-sanity filter drops the NYC mis-parsed outlier ($8,499/nt Royalton)", () => {
    const served = cpmaxxHotelsFor(NYC);
    expect(served.every((h) => (h.pricePerNight ?? 0) < 8000)).toBe(true);
    // Exactly one hotel dropped from the captured eight.
    expect(served.length).toBe((NYC.cpmaxxHotels ?? []).length - 1);
    // And the model never sees it in the search payload.
    const out = JSON.parse(new FixtureReplay("demo-x")["hotelSearch"]({ location: "New York" }));
    expect(out.candidates.some((c: any) => c.pricePerNight >= 8000)).toBe(false);
  });

  it("synthesizes folio lodging cards from staged cpmaxx ids (multi-select, up to 3)", async () => {
    const r = new FixtureReplay("demo-x");
    r["hotelSearch"]({ location: "Cancun" });
    const cpmaxx = cpmaxxHotelsFor(CANCUN);
    const picks = cpmaxx.slice(0, 3);
    const { patches, helpers } = fakeHelpers({ hotels: picks.map((h) => ({ _candidateId: h.id })) });
    const out = JSON.parse(await r["promoteHotels"](helpers));
    expect(out.ok).toBe(true);
    expect(out.promoted).toBe(3);
    // Cards are synthesized (prod has none for cpmaxx) with the credentialed fields.
    const card = out.lodging[0];
    expect(card.name).toBe(picks[0].name);
    expect(card.total).toBe(picks[0].priceTotal);
    expect(card.commission).toBe(picks[0].commission);
    expect(card.image).toBe(picks[0].image);
    expect(card.quoteUrl).toBe(picks[0].hotelSheetUrl);
    expect(card._candidateId).toBe(picks[0].id);
    expect((patches[0].lodging as any[]).length).toBe(3);
  });

  it("still drops an invented id when synthesizing cpmaxx lodging (fabrication guard)", async () => {
    const r = new FixtureReplay("demo-x");
    r["hotelSearch"]({ location: "Cancun" });
    const realId = cpmaxxHotelsFor(CANCUN)[0].id;
    const { helpers } = fakeHelpers({ hotels: [{ _candidateId: realId }, { _candidateId: "cpmaxx:FAKE" }] });
    const out = JSON.parse(await r["promoteHotels"](helpers));
    expect(out.promoted).toBe(1);
    expect(out.droppedUnknownCandidates).toContain("cpmaxx:FAKE");
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

describe("FixtureReplay supplier fan-out", () => {
  it("records two real sources (cpmaxx + serp) for a credentialed hotel search", async () => {
    const r = new FixtureReplay("demo-fan");
    const helpers = { readTrip: async () => ({}), patchTrip: async () => {} };
    await r.handle("hotel_search", { location: "Cancún" }, helpers as any);
    const fo = r.lastFanout();
    expect(fo).toBeTruthy();
    expect(fo!.tool).toBe("hotelSearch");
    const ids = fo!.sources.map((s) => s.id);
    expect(ids).toContain("cpmaxx");
    expect(ids).toContain("serp");
    expect(fo!.sources.find((s) => s.id === "cpmaxx")!.credentialed).toBe(true);
    expect(fo!.sources.every((s) => s.count > 0)).toBe(true);
    expect(fo!.shortlisted).toBeGreaterThan(0);
  });

  it("clears lastFanout on a non-hotel intercepted call", async () => {
    const r = new FixtureReplay("demo-fan2");
    const helpers = { readTrip: async () => ({}), patchTrip: async () => {} };
    await r.handle("hotel_search", { location: "Cancún" }, helpers as any);
    expect(r.lastFanout()).toBeTruthy();
    await r.handle("flight_search", { origin: "MOB", destination: "DUB" }, helpers as any);
    expect(r.lastFanout()).toBeNull();
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

describe("dublin-oct fixture enrichment (real captured data — D1)", () => {
  it("the captured Dublin fixture carries excursion + dining candidates", () => {
    expect((DUBLIN.excursions ?? []).length).toBeGreaterThan(0);
    expect((DUBLIN.dining ?? []).length).toBeGreaterThan(0);
    // every excursion productCode is a non-empty string (the load-bearing id)
    for (const e of DUBLIN.excursions ?? []) expect(typeof e.productCode === "string" && e.productCode.length > 0).toBe(true);
  });

  it("apply_gap_tour_picks with a real Dublin productCode writes exactly one activity", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    const ex = (DUBLIN.excursions ?? [])[0];
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: ex.day, productCode: ex.productCode }] }, h);
    const acts = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    expect(acts).toHaveLength(1);
    expect(acts[0].productCode).toBe(ex.productCode);
    expect(acts[0].name).toBe(ex.title);
  });

  it("tripadvisor_search writes all captured Dublin dining rows into the itinerary", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    await r.handle("tripadvisor_search", { trip_id: "demo-x", location: "Dublin", category: "restaurants" }, h);
    const dining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    expect(dining.length).toBe((DUBLIN.dining ?? []).length);
  });
});

describe("dublin-oct free things (LLM-proposed + TA-validated value-add)", () => {
  it("the fixture carries at least one free excursion and one paid one (mix the prompt asks for)", () => {
    const ex = DUBLIN.excursions ?? [];
    expect(ex.some((e) => e.free === true && (e.priceFrom == null || e.priceFrom === 0))).toBe(true);
    expect(ex.some((e) => e.free === false && (e.priceFrom ?? 0) > 0)).toBe(true);
  });

  it("a picked free thing writes a fixture-keyed, $0 activity into the itinerary", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    await r.handle("excursion_search", { source: "viator", trip_id: "demo-x", destination: "Dublin" }, h);
    const freebie = (DUBLIN.excursions ?? []).find((e) => e.free === true)!;
    await r.handle("apply_gap_tour_picks", { tripId: "demo-x", picks: [{ day: freebie.day, productCode: freebie.productCode }] }, h);
    const acts = (trip.itinerary ?? []).flatMap((d: any) => d.activities ?? []);
    const got = acts.find((a: any) => a.productCode === freebie.productCode);
    expect(got).toBeTruthy();
    expect(got.free).toBe(true);
    expect(got.priceFrom == null || got.priceFrom === 0).toBe(true);
  });
});

describe("tripadvisor_search writes dining WITHOUT a trip_id (real schema has none)", () => {
  it("dining lands when the model calls tripadvisor_search with only query/category", async () => {
    const r = new FixtureReplay("demo-x");
    const { trip, h } = makeHelpers();
    // mimic the real-schema call the model actually makes: query, no trip_id/location
    await r.handle("tripadvisor_search", { query: "best restaurants in Dublin", category: "restaurants" }, h);
    const dining = (trip.itinerary ?? []).flatMap((d: any) => d.dining ?? []);
    expect(dining.length).toBe((DUBLIN.dining ?? []).length);
    for (const d of dining) expect(r.fixtureDiningIds().includes(d.id)).toBe(true);
  });
});

describe("snapshot/restore (SessionDO persistence across DO eviction)", () => {
  it("round-trips promoted state through a fresh instance", () => {
    const a = new FixtureReplay("demo-x");
    a.restore({
      flightRouteId: "dublin-oct",
      hotelRouteId: "dublin-oct",
      enrichRouteId: "dublin-oct",
      promotedFlights: [{ id: "f1" }],
      promotedLodging: [{ name: "Hotel A" }],
      itinerary: [[2, { day: 2, title: "Day two" }], [1, { day: 1, title: "Day one" }]],
    });
    const b = new FixtureReplay("demo-x");
    b.restore(a.snapshot());
    const p = b.lastPromoted();
    expect(p.flights).toEqual([{ id: "f1" }]);
    expect(p.lodging).toEqual([{ name: "Hotel A" }]);
    // itinerary comes back day-sorted regardless of Map insertion order
    expect(p.itinerary?.map((d) => d.day)).toEqual([1, 2]);
    expect(b.fixtureExcursionCodes()).toEqual(a.fixtureExcursionCodes());
  });

  it("fresh instance snapshot is empty/null (no accidental state)", () => {
    const r = new FixtureReplay("demo-y");
    const s = r.snapshot();
    expect(s.flightRouteId).toBeNull();
    expect(s.promotedFlights).toBeNull();
    expect(s.itinerary).toEqual([]);
    const p = r.lastPromoted();
    expect(p.itinerary).toBeNull();
  });
});

describe("matchesFixture (fixture-vs-live session latch)", () => {
  it("matches featured flight routes and rejects unknown ones", () => {
    const r = new FixtureReplay("demo-x");
    expect(r.matchesFixture("flight_search", { origin: "ATL", destination: "CUN" })).toBe(true);
    expect(r.matchesFixture("flight_search", { origin: "BOS", destination: "LIS" })).toBe(false);
  });

  it("matches featured hotel destinations across arg spellings", () => {
    const r = new FixtureReplay("demo-x");
    expect(r.matchesFixture("hotel_search", { location: "Cancun" })).toBe(true);
    expect(r.matchesFixture("hotel_search_and_rank", { destination: "Cancun, Mexico" })).toBe(true);
    expect(r.matchesFixture("hotel_search_and_rank", { destination: "Lisbon, Portugal" })).toBe(false);
  });

  it("folds diacritics — accented spellings stay featured (Cancún latch regression)", () => {
    const r = new FixtureReplay("demo-x");
    expect(r.matchesFixture("hotel_search", { location: "Cancún" })).toBe(true);
    expect(r.matchesFixture("hotel_search_and_rank", { destination: "Cancún, Mexico" })).toBe(true);
    expect(r.matchesFixture("flight_search", { origin: "ATL", destination: "Cancún" })).toBe(true);
  });

  it("never latches live on non-search tools", () => {
    const r = new FixtureReplay("demo-x");
    expect(r.matchesFixture("patch_trip", {})).toBe(true);
    expect(r.matchesFixture("excursion_search", { destination_name: "Lisbon" })).toBe(true);
  });
});
