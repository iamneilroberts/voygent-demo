// Fixture replay layer for the public demo (Phase 1, decision B).
//
// The demo points its MCP client at STAGING, which has no supplier credentials —
// so flight_search/hotel_search return nothing and, historically, the model would
// FABRICATE flights/hotels/prices. This layer fixes that at the seam: it intercepts
// the supplier-search, candidate-list, and promote tools and replays REAL results
// captured once from prod (scripts/capture-fixtures.mjs). Trip-state tools
// (save_trip / patch_trip / read_trip) still run live against staging — that's the
// real trip engine; only the supplier round-trip is replayed.
//
// FABRICATION GUARANTEE: promote_* writes ONLY the prod-captured promoted object
// keyed by a real candidate id. A staged entry whose _candidateId is not in the
// fixture is dropped (hotels) or rejected (flights) — the model can never inject
// invented flight/hotel data into the folio, even though it authors the staging step.

import {
  FIXTURE_BY_ID, matchFlightFixture, matchHotelFixture, presetRoutes,
  type FlightCandidate, type HotelCandidate,
} from "../fixtures/index";

const INTERCEPTED = new Set([
  "flight_search", "hotel_search",
  "flight_list", "hotel_list",
  "promote_flights", "promote_hotels_to_lodging",
]);

export interface ReplayHelpers {
  // Live read of the staging trip; returns the unwrapped `data` object
  // ({ meta, flights, lodging, hotels, ... }) or {} if absent.
  readTrip: () => Promise<Record<string, any>>;
  // Live patch_trip against staging (full-array writes).
  patchTrip: (updates: Record<string, unknown>) => Promise<void>;
}

function slimFlight(c: FlightCandidate) {
  return {
    id: c.id,
    route: c.route ?? null,
    airline: c.validatingCarrier ?? (c.airlines && c.airlines[0]) ?? null,
    price: c.price ?? null,
    currency: c.currency ?? "USD",
    pricePerPerson: c.pricePerPerson ?? null,
    stops: c.stops ?? null,
    cabin: c.cabin ?? null,
    durationMinutes: c.durationMinutes ?? null,
  };
}

function slimHotel(c: HotelCandidate) {
  return {
    id: c.id,
    name: c.name,
    area: c.area ?? (c.stay && c.stay.location) ?? null,
    pricePerNight: c.pricePerNight ?? null,
    priceTotal: c.priceTotal ?? null,
    nights: c.nights ?? null,
    starRating: c.starRating ?? null,
    reviewScore: c.reviewScore ?? null,
    reviewCount: c.reviewCount ?? null,
  };
}

function presetHint(): string {
  return presetRoutes().map((r) => `${r.label} (${r.origin}→${r.destination}, ${r.depart})`).join("; ");
}

function stagedCandidateIds(flights: unknown): string[] {
  if (!Array.isArray(flights)) return [];
  return flights
    .map((f) => (f && typeof f === "object" && typeof (f as any)._candidateId === "string" ? (f as any)._candidateId : ""))
    .filter(Boolean);
}

export class FixtureReplay {
  private flightRouteId: string | null = null;
  private hotelRouteId: string | null = null;
  // The promoted objects we last wrote, retained so the folio is built from
  // authoritative tool-truth rather than a follow-up read_trip (which can race
  // Cloudflare KV's eventual consistency and momentarily miss a just-written array).
  private promotedFlights: unknown = null;
  private promotedLodging: Array<Record<string, unknown>> | null = null;

  constructor(private tripId: string) {}

  isIntercepted(name: string): boolean {
    return INTERCEPTED.has(name);
  }

  /** What promote_* has committed this session — overlaid onto the folio snapshot. */
  lastPromoted(): { flights: unknown; lodging: Array<Record<string, unknown>> | null } {
    return { flights: this.promotedFlights, lodging: this.promotedLodging };
  }

  async handle(name: string, args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    switch (name) {
      case "flight_search": return this.flightSearch(args);
      case "flight_list": return this.flightList(args);
      case "promote_flights": return this.promoteFlights(args, h);
      case "hotel_search": return this.hotelSearch(args);
      case "hotel_list": return this.hotelList(args);
      case "promote_hotels_to_lodging": return this.promoteHotels(h);
      default: return JSON.stringify({ status: "error", error: `not intercepted: ${name}` });
    }
  }

  private flightSearch(args: Record<string, any>): string {
    const fixture = matchFlightFixture(args.origin, args.destination);
    if (!fixture) {
      this.flightRouteId = null;
      return JSON.stringify({
        status: "ok", source: "serp", tripId: this.tripId, count: 0, candidates: [],
        note: `No live demo results for ${args.origin ?? "?"}→${args.destination ?? "?"}. This demo replays real searches for: ${presetHint()}.`,
      });
    }
    this.flightRouteId = fixture.route.id;
    const candidates = fixture.flights.map(slimFlight);
    return JSON.stringify({
      status: "ok", source: "serp", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Pick ONE round-trip option, stage it with patch_trip updates {flights:[{_candidateId:'<id>'}]}, then call promote_flights.",
    });
  }

  private flightList(args: Record<string, any>): string {
    if (args.action === "clear") {
      return JSON.stringify({ status: "ok", action: "clear", tripId: this.tripId, count: 0 });
    }
    const fixture = this.flightRouteId ? FIXTURE_BY_ID[this.flightRouteId] : null;
    if (!fixture) {
      return JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: 0, candidates: [], note: "Run flight_search first." });
    }
    const candidates = fixture.flights.map(slimFlight);
    return JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: candidates.length, version: 1, candidates });
  }

  private async promoteFlights(args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    const fixture = this.flightRouteId ? FIXTURE_BY_ID[this.flightRouteId] : null;
    if (!fixture) {
      return JSON.stringify({ ok: false, error: { code: "no_candidates", message: "No flight candidates — call flight_search first." } });
    }
    const trip = await h.readTrip();
    const staged = stagedCandidateIds(trip.flights);
    if (staged.length === 0) {
      return JSON.stringify({ ok: false, error: { code: "nothing_staged", message: "Stage a pick first: patch_trip updates {flights:[{_candidateId:'<id>'}]}." } });
    }
    let pickId: string;
    if (staged.length > 1) {
      const requested = typeof args.outboundCandidateId === "string" ? args.outboundCandidateId : null;
      if (!requested) {
        return JSON.stringify({ ok: false, error: { code: "ambiguous_outbound", message: "Multiple staged; pass outboundCandidateId.", staged } });
      }
      pickId = requested;
    } else {
      pickId = staged[0];
    }
    const promoted = fixture.promotedFlightsById[pickId];
    if (!promoted) {
      // Fabrication guard: the staged id is not a real captured candidate.
      return JSON.stringify({ ok: false, error: { code: "candidate_not_found", message: `No FlightCandidate id=${pickId} in results. Stage a real id from flight_search/flight_list.` } });
    }
    await h.patchTrip({ flights: promoted });
    this.promotedFlights = promoted;
    return JSON.stringify({ ok: true, mode: "promoted", tripId: this.tripId, flights: promoted });
  }

  private hotelSearch(args: Record<string, any>): string {
    const loc = args.location ?? args.destination;
    const fixture = matchHotelFixture(loc);
    if (!fixture) {
      this.hotelRouteId = null;
      return JSON.stringify({
        status: "ok", source: "serp", tripId: this.tripId, count: 0, candidates: [],
        note: `No live demo hotels for ${loc ?? "?"}. This demo replays real searches for: ${presetHint()}.`,
      });
    }
    this.hotelRouteId = fixture.route.id;
    const candidates = fixture.hotels.map(slimHotel);
    return JSON.stringify({
      status: "ok", source: "serp", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Stage 2-3 picks with patch_trip updates {hotels:[{_candidateId:'<id>'},...]}, then call promote_hotels_to_lodging.",
    });
  }

  private hotelList(args: Record<string, any>): string {
    if (args.action === "clear") {
      return JSON.stringify({ status: "ok", action: "clear", tripId: this.tripId, count: 0 });
    }
    const fixture = this.hotelRouteId ? FIXTURE_BY_ID[this.hotelRouteId] : null;
    if (!fixture) {
      return JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: 0, candidates: [], note: "Run hotel_search first." });
    }
    const candidates = fixture.hotels.map(slimHotel);
    return JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: candidates.length, version: 1, candidates });
  }

  private async promoteHotels(h: ReplayHelpers): Promise<string> {
    const fixture = this.hotelRouteId ? FIXTURE_BY_ID[this.hotelRouteId] : null;
    if (!fixture) {
      return JSON.stringify({ ok: false, error: { code: "no_candidates", message: "No hotel candidates — call hotel_search first." } });
    }
    const trip = await h.readTrip();
    const stagedHotels = Array.isArray(trip.hotels) ? trip.hotels : [];
    const cards: Array<Record<string, unknown>> = [];
    const dropped: string[] = [];
    for (const sh of stagedHotels) {
      const cid = sh && typeof sh === "object" && typeof (sh as any)._candidateId === "string" ? (sh as any)._candidateId : "";
      const card = cid ? fixture.promotedLodgingById[cid] : undefined;
      // Fabrication guard: only candidate-id-backed hotels reach the folio.
      if (card) cards.push(card); else if (cid) dropped.push(cid);
    }
    if (cards.length === 0) {
      return JSON.stringify({ ok: false, error: { code: "no_staged_candidates", message: "Stage real hotel ids first: patch_trip updates {hotels:[{_candidateId:'<id>'}]}." } });
    }
    await h.patchTrip({ lodging: cards, hotels: [] });
    this.promotedLodging = cards;
    return JSON.stringify({ ok: true, promoted: cards.length, tripId: this.tripId, lodging: cards, ...(dropped.length ? { droppedUnknownCandidates: dropped } : {}) });
  }
}
