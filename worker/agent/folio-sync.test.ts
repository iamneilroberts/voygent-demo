import { describe, it, expect } from "vitest";
import { isTripMutating, tripToFolio } from "./folio-sync";

describe("isTripMutating", () => {
  it("flags trip-mutating tools called with a trip_id", () => {
    expect(isTripMutating("flight_search", { trip_id: "t1" })).toBe(true);
    expect(isTripMutating("patch_trip", { trip_id: "t1" })).toBe(true);
  });
  it("ignores searches without a trip_id and non-mutating tools", () => {
    expect(isTripMutating("flight_search", {})).toBe(false);
    expect(isTripMutating("get_help", { trip_id: "t1" })).toBe(false);
  });
});

describe("tripToFolio", () => {
  // Shape verified live against read_trip on 2026-06-05: the trip is wrapped under
  // `data`, flights carry { route, airline }, lodging carries { name, rate, total }.
  it("maps a real read_trip envelope (data-wrapped) into FolioData", () => {
    const raw = {
      status: "ok",
      tripId: "t1",
      data: {
        meta: { title: "Cancún Escape", clientName: "Jake & Sarah" },
        flights: [{ role: "outbound", route: "Atlanta (ATL) -> Athens (ATH)", airline: "Delta Air Lines" }],
        lodging: [{ name: "Hilton Cancun Mar Caribe", rate: 490, total: 3430, stayId: "x" }],
      },
    };
    const folio = tripToFolio("t1", raw);
    expect(folio.title).toBe("Cancún Escape");
    expect(folio.flights[0].carrier).toBe("Delta Air Lines");
    expect(folio.flights[0].label).toBe("Atlanta (ATL) -> Athens (ATH)");
    expect(folio.hotels[0].name).toBe("Hilton Cancun Mar Caribe");
    expect(folio.hotels[0].price).toBe("$3430");
    expect(folio.hotels[0].commission).toBeUndefined(); // serp lodging: no commission, never invented
  });

  it("passes through real commission on lodging (cpmaxx) and supports both pct spellings", () => {
    const raw = {
      data: {
        meta: { title: "Cancún Escape" },
        lodging: [
          { name: "Omni Cancun", total: 8122.3, commission: 2436.69, commission_pct: 30 },
          { name: "JW Marriott", total: 5000, commission: 1200, commissionPct: 24 },
          { name: "Serp Inn", total: 900 },
        ],
      },
    };
    const folio = tripToFolio("t1", raw);
    expect(folio.hotels[0].commission).toBe(2436.69);
    expect(folio.hotels[0].commissionPct).toBe(30);
    expect(folio.hotels[1].commissionPct).toBe(24);
    expect(folio.hotels[2].commission).toBeUndefined();
    expect(folio.hotels[2].commissionPct).toBeUndefined();
  });

  it("passes through the property photo + quote-sheet link on synthesized cpmaxx lodging", () => {
    const raw = {
      data: {
        meta: { title: "Cancún Escape" },
        lodging: [{
          name: "Dreams Playa Mujeres", total: 9655.54, stars: 4, location: "Punta Sam",
          image: "https://i.travelapi.com/lodging/x_b.jpg",
          quoteUrl: "https://cpmaxx.example/HotelSheets/497758",
          commission: 2896.66, commissionPct: 30,
        }],
      },
    };
    const folio = tripToFolio("t1", raw);
    expect(folio.hotels[0].image).toBe("https://i.travelapi.com/lodging/x_b.jpg");
    expect(folio.hotels[0].quoteUrl).toBe("https://cpmaxx.example/HotelSheets/497758");
    // Falls back to a bare `url` when quoteUrl/hotelSheetUrl are absent.
    const fallback = tripToFolio("t2", { data: { lodging: [{ name: "H", total: 1, url: "https://u" }] } });
    expect(fallback.hotels[0].quoteUrl).toBe("https://u");
  });

  it("maps the promoted { outbound, return } flights object (post promote_flights)", () => {
    const raw = {
      data: {
        meta: { title: "Dublin" },
        flights: {
          outbound: { route: "MOB→DUB", airline: "United", totalPrice: 3426, segments: [] },
          return: null,
        },
        lodging: [{ name: "Baggotrath House", total: 1343, stars: null }],
      },
    };
    const folio = tripToFolio("t1", raw);
    expect(folio.flights).toHaveLength(1);
    expect(folio.flights[0].carrier).toBe("United");
    expect(folio.flights[0].route).toBe("MOB→DUB");
    expect(folio.flights[0].price).toBe("$3426");
    expect(folio.hotels[0].price).toBe("$1343");
  });

  it("uses lodging[] even when an emptied staging hotels[] is also present", () => {
    // post promote_hotels_to_lodging: hotels[] cleared to [], lodging[] holds the cards
    const raw = { data: { meta: { title: "Dublin" }, hotels: [], lodging: [{ name: "Zanzibar Locke", total: 1308 }] } };
    const folio = tripToFolio("t1", raw);
    expect(folio.hotels).toHaveLength(1);
    expect(folio.hotels[0].name).toBe("Zanzibar Locke");
    expect(folio.hotels[0].price).toBe("$1308");
  });

  it("hides bare staging stubs ({_candidateId}) until promote fills real data", () => {
    // mid-pipeline: model has staged picks but promote hasn't run yet
    const raw = { data: { meta: { title: "X" }, flights: [{ _candidateId: "serp:a" }], hotels: [{ _candidateId: "serp:b" }], lodging: [] } };
    const folio = tripToFolio("t1", raw);
    expect(folio.flights).toEqual([]);
    expect(folio.hotels).toEqual([]);
  });

  it("falls back to clientName/destination when meta.title is absent", () => {
    const raw = { data: { meta: { clientName: "Jake & Sarah", destination: "Cancun, Mexico" } } };
    expect(tripToFolio("t1", raw).title).toBe("Jake & Sarah");
  });

  it("tolerates an already-unwrapped object and missing arrays", () => {
    const folio = tripToFolio("t1", { title: "Empty" });
    expect(folio.title).toBe("Empty");
    expect(folio.flights).toEqual([]);
    expect(folio.hotels).toEqual([]);
  });

  it("tolerates null/garbage input", () => {
    const folio = tripToFolio("t1", null);
    expect(folio.title).toBe("Trip");
    expect(folio.flights).toEqual([]);
    expect(folio.hotels).toEqual([]);
  });
});

describe("tripToFolio enrichment projection", () => {
  it("projects itinerary[] into days[] and attaches includes when enriched", () => {
    const raw = { data: {
      meta: { title: "Dublin" },
      flights: { outbound: { route: "MOB→DUB", airline: "United", totalPrice: 3426, segments: [] }, return: null },
      lodging: [{ name: "Baggotrath House", total: 1343 }],
      itinerary: [{
        day: 1, date: "2026-10-12", location: "Dublin", title: "Arrive Dublin",
        activities: [{ name: "Kilmainham Gaol", description: "Historic gaol tour.", url: "https://v", priceFrom: 26 }],
        dining: [{ name: "The Winding Stair", cuisine: "Modern Irish", description: "Riverside bistro.", url: "https://t" }],
      }],
    } };
    const folio = tripToFolio("t1", raw);
    expect(folio.days?.[0].title).toContain("Dublin");
    expect(folio.days?.[0].activities[0].name).toBe("Kilmainham Gaol");
    expect(folio.days?.[0].dining[0].cuisine).toBe("Modern Irish");
    expect(folio.includes && folio.includes.length).toBeGreaterThan(0);
  });

  it("omits days/includes for an un-enriched trip (flights/hotels only, unchanged)", () => {
    const raw = { data: { meta: { title: "Dublin" }, flights: [], lodging: [] } };
    const folio = tripToFolio("t1", raw);
    expect(folio.days).toBeUndefined();
    expect(folio.includes).toBeUndefined();
  });
});

describe("isTripMutating enrichment tools", () => {
  it("flags apply_gap_tour_picks always, and tripadvisor_search with a trip id (snake or camel)", () => {
    expect(isTripMutating("apply_gap_tour_picks", {})).toBe(true);
    expect(isTripMutating("tripadvisor_search", { trip_id: "t1" })).toBe(true);
    expect(isTripMutating("tripadvisor_search", { tripId: "t1" })).toBe(true); // camelCase accepted
    expect(isTripMutating("tripadvisor_search", {})).toBe(true); // doubles as apply; real schema has no trip_id
  });
});
