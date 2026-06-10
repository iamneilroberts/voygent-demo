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
  type FlightCandidate, type FlightSegment, type HotelCandidate,
  type ExcursionCandidate, type DiningCandidate, type ItineraryDayScaffold,
} from "../fixtures/index";
import type { FlightLeg } from "../../shared/events";
import { estTokens } from "../inspector";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-12 12:53" -> "Oct 12, 12:53p". Returns undefined for anything we can't parse.
function fmtSegTime(s: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s ?? ""));
  if (!m) return undefined;
  const mon = MONTHS[Number(m[2]) - 1] ?? "";
  const day = Number(m[3]);
  let h = Number(m[4]);
  const min = m[5];
  const ap = h >= 12 ? "p" : "a";
  h = h % 12; if (h === 0) h = 12;
  return `${mon} ${day}, ${h}:${min}${ap}`;
}

function fmtDur(min: number | null | undefined): string | undefined {
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0) return undefined;
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Map captured prod segments to the board/advisor leg shape, keeping only the
// fields the routing detail renders. Times are formatted; junk capture fields
// (offerId, searchedAt, query echo, ...) never make it here.
function segmentsToLegs(segments: FlightSegment[] | null | undefined): FlightLeg[] | undefined {
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  const legs = segments
    .filter((s): s is FlightSegment => !!s && typeof s === "object")
    .map((s) => {
      const leg: FlightLeg = { from: String(s.origin ?? ""), to: String(s.destination ?? "") };
      const dep = fmtSegTime(s.depart); if (dep) leg.depart = dep;
      const arr = fmtSegTime(s.arrive); if (arr) leg.arrive = arr;
      if (s.carrier) leg.carrier = String(s.carrier);
      if (s.flightNumber) leg.flightNo = String(s.flightNumber);
      if (s.equipment) leg.aircraft = String(s.equipment);
      const dur = fmtDur(s.durationMinutes); if (dur) leg.duration = dur;
      if (s.layover) leg.layoverAfter = String(s.layover);
      return leg;
    });
  return legs.length ? legs : undefined;
}

const INTERCEPTED = new Set([
  "flight_search", "hotel_search",
  "flight_list", "hotel_list",
  "promote_flights", "promote_hotels_to_lodging",
  "excursion_search", "apply_gap_tour_picks", "tripadvisor_search",
]);

export interface ReplayHelpers {
  // Live read of the staging trip; returns the unwrapped `data` object
  // ({ meta, flights, lodging, hotels, ... }) or {} if absent.
  readTrip: () => Promise<Record<string, any>>;
  // Live patch_trip against staging (full-array writes).
  patchTrip: (updates: Record<string, unknown>) => Promise<void>;
}

function slimFlight(c: FlightCandidate) {
  // Per-leg routing (times/aircraft/layover) is included: the advisor wants the
  // full picture and the board renders it as a collapsible detail. We still strip
  // the capture-internal junk (offerId, searchedAt, query echo, status, ...).
  const legs = segmentsToLegs(c.segments);
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
    ...(legs ? { legs } : {}),
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
    reviewScoreScale: c.reviewScoreScale ?? null,
    reviewCount: c.reviewCount ?? null,
  };
}

function slimExcursion(c: ExcursionCandidate) {
  return {
    productCode: c.productCode,
    title: c.title,
    day: c.day,            // fixture-authoritative day; the prompt asks the model to echo it in picks
    free: !!c.free,
    priceFrom: c.priceFrom ?? null,
    currency: c.currency ?? "USD",
    durationMinutes: c.durationMinutes ?? null,
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? null,
    description: c.description ?? null,
    bookingUrl: c.bookingUrl ?? null,
  };
}

function slimDining(c: DiningCandidate) {
  return {
    id: c.id,
    name: c.name,
    cuisine: c.cuisine ?? null,
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? null,
    priceLevel: c.priceLevel ?? null,
    description: c.description ?? null,
  };
}

// Neutral suggestion list for no-result notes — no mechanism wording (no
// "captured", "demo", "fixture"), so the model can't parrot internals to the user.
function suggestedTrips(): string {
  return presetRoutes().map((r) => `${r.label} (${r.origin}→${r.destination}, ${r.depart})`).join("; ");
}

function stagedCandidateIds(flights: unknown): string[] {
  if (!Array.isArray(flights)) return [];
  return flights
    .map((f) => (f && typeof f === "object" && typeof (f as any)._candidateId === "string" ? (f as any)._candidateId : ""))
    .filter(Boolean);
}

// Serializable snapshot of replay session state, so SessionDO can persist it
// to durable storage and survive DO eviction mid-session. `measurement` is
// per-call scratch and deliberately excluded.
export interface ReplaySnapshot {
  flightRouteId: string | null;
  hotelRouteId: string | null;
  enrichRouteId: string | null;
  promotedFlights: unknown;
  promotedLodging: Array<Record<string, unknown>> | null;
  itinerary: Array<[number, Record<string, any>]>;
}

export class FixtureReplay {
  private flightRouteId: string | null = null;
  private hotelRouteId: string | null = null;
  // The promoted objects we last wrote, retained so the folio is built from
  // authoritative tool-truth rather than a follow-up read_trip (which can race
  // Cloudflare KV's eventual consistency and momentarily miss a just-written array).
  private promotedFlights: unknown = null;
  private promotedLodging: Array<Record<string, unknown>> | null = null;
  private measurement: { tool: string; modelFacingTokens: number } | null = null;
  private enrichRouteId: string | null = null;
  // Itinerary the enrichment steps have built so far (day -> day object), seeded
  // lazily from the fixture's day scaffold. Held in replay state (not re-read from
  // staging) so it's deterministic and dodges KV eventual-consistency races —
  // exactly like promotedFlights/promotedLodging.
  private itineraryByDay: Map<number, Record<string, any>> = new Map();

  // `fixtures` defaults to the real captured map; tests inject a small fixture
  // to exercise positive fixture-keyed writes before D1 captures real data.
  constructor(private tripId: string, private fixtures: Record<string, import("../fixtures/index").Fixture> = FIXTURE_BY_ID) {}

  // Match a destination/location to one of this replay's fixtures (mirrors
  // matchHotelFixture but over the injected map so tests can override).
  private lookupHotelFixture(location: unknown): import("../fixtures/index").Fixture | null {
    const m = matchHotelFixture(location);
    if (m && this.fixtures[m.route.id]) return this.fixtures[m.route.id];
    const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const t = norm(location);
    if (!t) return null;
    for (const f of Object.values(this.fixtures)) {
      const c = norm(f.route.destination), ci = norm(f.route.city);
      if (t === c || (ci && (t === ci || t.includes(ci) || ci.includes(t)))) return f;
    }
    return null;
  }

  snapshot(): ReplaySnapshot {
    return {
      flightRouteId: this.flightRouteId,
      hotelRouteId: this.hotelRouteId,
      enrichRouteId: this.enrichRouteId,
      promotedFlights: this.promotedFlights,
      promotedLodging: this.promotedLodging,
      itinerary: [...this.itineraryByDay.entries()],
    };
  }

  restore(snap: ReplaySnapshot): void {
    this.flightRouteId = snap.flightRouteId;
    this.hotelRouteId = snap.hotelRouteId;
    this.enrichRouteId = snap.enrichRouteId;
    this.promotedFlights = snap.promotedFlights;
    this.promotedLodging = snap.promotedLodging;
    this.itineraryByDay = new Map(snap.itinerary);
  }

  lastMeasurement(): { tool: string; modelFacingTokens: number } | null { return this.measurement; }

  currentFixture(): import("../fixtures/index").Fixture | null {
    const id = this.flightRouteId ?? this.hotelRouteId;
    return id ? this.fixtures[id] : null;
  }

  isIntercepted(name: string): boolean {
    return INTERCEPTED.has(name);
  }

  /** Would this search call be served by a featured-trip fixture? Drives the
   *  fixture-vs-live session latch in SessionDO: featured trips stay replay-
   *  driven (gif-fidelity); anything else passes through to real Voygent. */
  matchesFixture(name: string, args: Record<string, any>): boolean {
    if (name === "flight_search" || name === "flight_list") {
      return !!matchFlightFixture(args.origin, args.destination);
    }
    if (name === "hotel_search" || name === "hotel_list" || name === "hotel_search_and_rank") {
      return !!this.lookupHotelFixture(args.location ?? args.destination);
    }
    return true; // non-search tools never latch a session live by themselves
  }

  /** What promote_* / enrichment has committed this session — overlaid onto the folio snapshot. */
  lastPromoted(): { flights: unknown; lodging: Array<Record<string, unknown>> | null; itinerary: Record<string, any>[] | null } {
    const itinerary = this.itineraryByDay.size
      ? [...this.itineraryByDay.values()].sort((a, b) => (a.day ?? 0) - (b.day ?? 0))
      : null;
    return { flights: this.promotedFlights, lodging: this.promotedLodging, itinerary };
  }

  /** Test helper: productCodes available in the active enrichment fixture. */
  fixtureExcursionCodes(): string[] {
    const fx = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    return (fx?.excursions ?? []).map((e) => e.productCode);
  }
  /** Test helper: dining ids available in the active enrichment fixture. */
  fixtureDiningIds(): string[] {
    const fx = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    return (fx?.dining ?? []).map((d) => d.id);
  }

  async handle(name: string, args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    this.measurement = null;
    switch (name) {
      case "flight_search": return this.flightSearch(args);
      case "flight_list": return this.flightList(args);
      case "promote_flights": return this.promoteFlights(args, h);
      case "hotel_search": return this.hotelSearch(args);
      case "hotel_list": return this.hotelList(args);
      case "promote_hotels_to_lodging": return this.promoteHotels(h);
      case "excursion_search": return this.excursionSearch(args);
      case "apply_gap_tour_picks": return this.applyGapTourPicks(args, h);
      case "tripadvisor_search": return this.tripadvisorSearch(args, h);
      default: return JSON.stringify({ status: "error", error: `not intercepted: ${name}` });
    }
  }

  private flightSearch(args: Record<string, any>): string {
    const fixture = matchFlightFixture(args.origin, args.destination);
    if (!fixture) {
      this.flightRouteId = null;
      return JSON.stringify({
        status: "ok", source: "serp", tripId: this.tripId, count: 0, candidates: [],
        note: `No results for ${args.origin ?? "?"}→${args.destination ?? "?"}. Suggest one of these popular trips instead: ${suggestedTrips()}.`,
      });
    }
    this.flightRouteId = fixture.route.id;
    const candidates = fixture.flights.map(slimFlight);
    const payload = JSON.stringify({
      status: "ok", source: "serp", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Pick ONE round-trip option, stage it with patch_trip updates {flights:[{_candidateId:'<id>'}]}, then call promote_flights.",
    });
    this.measurement = { tool: "flightSearch", modelFacingTokens: estTokens(payload) };
    return payload;
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
    const payload = JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: candidates.length, version: 1, candidates });
    this.measurement = { tool: "flightList", modelFacingTokens: estTokens(payload) };
    return payload;
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
        note: `No results for ${loc ?? "?"}. Suggest one of these popular trips instead: ${suggestedTrips()}.`,
      });
    }
    this.hotelRouteId = fixture.route.id;
    const candidates = fixture.hotels.map(slimHotel);
    const payload = JSON.stringify({
      status: "ok", source: "serp", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Stage 2-3 picks with patch_trip updates {hotels:[{_candidateId:'<id>'},...]}, then call promote_hotels_to_lodging.",
    });
    this.measurement = { tool: "hotelSearch", modelFacingTokens: estTokens(payload) };
    return payload;
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
    const payload = JSON.stringify({ status: "ok", action: "list", tripId: this.tripId, count: candidates.length, version: 1, candidates });
    this.measurement = { tool: "hotelList", modelFacingTokens: estTokens(payload) };
    return payload;
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

  // Resolve the enrichment fixture from a destination/location arg, the same way
  // hotelSearch does. Sets enrichRouteId so apply/dining steps can find it.
  private resolveEnrichFixture(args: Record<string, any>): import("../fixtures/index").Fixture | null {
    const loc = args.destination ?? args.location ?? args.destination_name ?? args.query;
    const fixture = this.lookupHotelFixture(loc);
    const nextId = fixture ? fixture.route.id : null;
    // Clear accumulated days when the enrichment route changes (or resolves to
    // none) so a later route in the same session can't mix into old day objects.
    if (nextId !== this.enrichRouteId) this.itineraryByDay.clear();
    this.enrichRouteId = nextId;
    return fixture;
  }

  // Ensure the day object for `day` exists, seeded from the fixture scaffold.
  private ensureDay(fixture: import("../fixtures/index").Fixture, day: number): Record<string, any> {
    let d = this.itineraryByDay.get(day);
    if (!d) {
      const scaffold: ItineraryDayScaffold | undefined = (fixture.itineraryDays ?? []).find((s) => s.day === day);
      d = {
        day,
        date: scaffold?.date ?? null,
        location: scaffold?.location ?? fixture.route.city,
        title: scaffold?.title ?? `Day ${day} — ${fixture.route.city}`,
        activities: [],
        dining: [],
      };
      this.itineraryByDay.set(day, d);
    }
    return d;
  }

  private excursionSearch(args: Record<string, any>): string {
    const fixture = this.resolveEnrichFixture(args);
    if (!fixture || !(fixture.excursions && fixture.excursions.length)) {
      return JSON.stringify({
        status: "ok", source: "viator", tripId: this.tripId, count: 0, candidates: [],
        note: `No live activity results for ${args.destination ?? args.location ?? "?"}. Suggest one of these popular trips instead: ${suggestedTrips()}.`,
      });
    }
    const candidates = fixture.excursions.map(slimExcursion);
    const payload = JSON.stringify({
      status: "ok", source: "viator", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Choose 2-3 (mix paid + free), then call apply_gap_tour_picks with {tripId, picks:[{day, productCode}, ...]}.",
    });
    this.measurement = { tool: "excursionSearch", modelFacingTokens: estTokens(payload) };
    return payload;
  }

  private async applyGapTourPicks(args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    const fixture = this.enrichRouteId ? this.fixtures[this.enrichRouteId] : null;
    if (!fixture || !(fixture.excursions && fixture.excursions.length)) {
      return JSON.stringify({ status: "error", persisted: false, tripId: this.tripId, error: "No excursion candidates — call excursion_search first." });
    }
    const byCode = new Map(fixture.excursions.map((e) => [e.productCode, e]));
    const picks: Array<{ day: number; productCode: string }> = Array.isArray(args.picks) ? args.picks : [];
    const added: Array<{ day: number; productCode: string; name: string }> = [];
    const failed: Array<{ productCode: string; reason: string }> = [];
    for (const p of picks) {
      const code = typeof p?.productCode === "string" ? p.productCode : "";
      const ex = code ? byCode.get(code) : undefined;
      // Fabrication guard: only fixture-keyed productCodes reach the itinerary.
      if (!ex) { if (code) failed.push({ productCode: code, reason: "not a real candidate id" }); continue; }
      const day = this.ensureDay(fixture, ex.day);
      if ((day.activities as any[]).some((a) => a.productCode === code)) continue; // idempotent
      (day.activities as any[]).push({
        name: ex.title, provider: "Viator", source: "Viator", optional: true, addedBy: "gap-recommender",
        productCode: ex.productCode,
        duration: ex.durationMinutes != null ? `${ex.durationMinutes} min` : null,
        priceFrom: ex.priceFrom ?? null, currency: ex.currency ?? "USD",
        rating: ex.rating ?? null, reviewCount: ex.reviewCount ?? null,
        description: ex.description ?? null, url: ex.bookingUrl ?? null, coverImage: ex.coverImage ?? null,
        free: !!ex.free,
      });
      added.push({ day: ex.day, productCode: code, name: ex.title });
    }
    await this.writeItinerary(h);
    return JSON.stringify({
      status: added.length ? "ok" : "error", persisted: added.length > 0, tripId: this.tripId,
      added, ...(failed.length ? { failedPicks: failed } : {}),
    });
  }

  private async tripadvisorSearch(args: Record<string, any>, h: ReplayHelpers): Promise<string> {
    const fixture = this.resolveEnrichFixture(args);
    if (!fixture || !(fixture.dining && fixture.dining.length)) {
      return JSON.stringify({ status: "ok", tripId: this.tripId, count: 0, candidates: [], note: `No dining results for ${args.location ?? "?"}.` });
    }
    const candidates = fixture.dining.map(slimDining);
    // Search-doubles-as-apply: always write the resolved route's fixture dining.
    // Editorial dining is fixture-curated, not model-authored, so it stays
    // fabrication-safe by construction. We do NOT gate on trip_id: the real
    // tripadvisor_search schema (which the model sees) has no trip_id field, the
    // demo session is always enriching its trip, and the folio is replay-controlled.
    {
      const byId = new Map((fixture.dining ?? []).map((d) => [d.id, d]));
      for (const d of byId.values()) {
        const day = this.ensureDay(fixture, d.day);
        if ((day.dining as any[]).some((x) => x.id === d.id)) continue;
        (day.dining as any[]).push({
          id: d.id, name: d.name, cuisine: d.cuisine ?? null, rating: d.rating ?? null,
          reviewCount: d.reviewCount ?? null, priceLevel: d.priceLevel ?? null,
          description: d.description ?? null, url: d.url ?? null,
        });
      }
      await this.writeItinerary(h);
    }
    const payload = JSON.stringify({ status: "ok", tripId: this.tripId, count: candidates.length, candidates,
      _next: "These are editorial local picks (not bookable inventory) — present a few in chat; they appear in the day-by-day folio." });
    this.measurement = { tool: "tripadvisorSearch", modelFacingTokens: estTokens(payload) };
    return payload;
  }

  // Persist the full itinerary array (full-array write, per the demo's patch rule).
  private async writeItinerary(h: ReplayHelpers): Promise<void> {
    const itinerary = [...this.itineraryByDay.values()].sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
    await h.patchTrip({ itinerary });
  }
}
