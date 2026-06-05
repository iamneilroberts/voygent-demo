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
