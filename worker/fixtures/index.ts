// Real Voygent MCP results captured once against prod (source=serp) on 2026-06-05
// by scripts/capture-fixtures.mjs. The public demo replays these deterministically
// so every flight/hotel/price in the folio is a REAL search result — zero cost per
// visit, zero fabrication. See docs handoff "real-results-and-full-path".

import dublinRaw from "./dublin-oct.json";
import cancunRaw from "./cancun-beach.json";
import tokyoRaw from "./tokyo-blossom.json";
import romeRaw from "./rome-amalfi.json";
import nycRaw from "./nyc-weekend.json";

export interface FixtureRoute {
  id: string; label: string;
  origin: string; destination: string; city: string;
  depart: string; ret: string; adults: number;
}

// Subset of the real FlightCandidate shape the demo uses (full object is in the JSON).
export interface FlightCandidate {
  id: string; source: string;
  price: number | null; currency?: string | null; pricePerPerson?: number | null;
  validatingCarrier?: string | null; airlines?: string[] | null;
  cabin?: string | null; stops?: number | null; durationMinutes?: number | null;
  route?: string | null; flightNumbers?: string[] | null;
}

export interface HotelCandidate {
  id: string; source: string; name: string;
  starRating?: number | null; reviewScore?: number | null; reviewCount?: number | null;
  pricePerNight?: number | null; priceTotal?: number | null; nights?: number | null;
  currency?: string | null; area?: string | null;
  stay?: { location?: string; checkIn?: string; checkOut?: string } | null;
}

export interface ExcursionCandidate {
  productCode: string;        // real Viator product code — the load-bearing id
  title: string;
  day: number;                // 1-based itinerary day this belongs to
  free: boolean;              // true = "free thing to do" (priceFrom null/0)
  priceFrom: number | null;
  currency?: string | null;
  durationMinutes?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  description?: string | null;
  bookingUrl?: string | null;
  coverImage?: string | null;
}
export interface DiningCandidate {
  id: string;                 // real TripAdvisor location id
  name: string;
  day: number;                // 1-based itinerary day
  cuisine?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  priceLevel?: string | null; // "$$ - $$$"
  description?: string | null;
  url?: string | null;
}
export interface ItineraryDayScaffold {
  day: number; date: string; location: string; title: string;
}

export interface Fixture {
  route: FixtureRoute;
  flights: FlightCandidate[];
  hotels: HotelCandidate[];
  // Real promoted trip.flights ({outbound,return}) per flight-candidate id, exactly
  // as prod's promote_flights produced it. The demo replays these byte-for-byte.
  promotedFlightsById: Record<string, unknown>;
  // Real promoted lodging cards per hotel-candidate id, as prod's
  // promote_hotels_to_lodging produced them.
  promotedLodgingById: Record<string, Record<string, unknown>>;
  excursions?: ExcursionCandidate[];
  dining?: DiningCandidate[];
  itineraryDays?: ItineraryDayScaffold[];
  meta?: {
    flightSearch?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    flightList?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    hotelSearch?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    hotelList?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    capturedAt?: string;
  };
}

export const FIXTURES: Fixture[] = [
  dublinRaw, cancunRaw, tokyoRaw, romeRaw, nycRaw,
] as unknown as Fixture[];

export const FIXTURE_BY_ID: Record<string, Fixture> =
  Object.fromEntries(FIXTURES.map((f) => [f.route.id, f]));

/** Preset summaries for the onboarding chips / SYSTEM_HINT (no candidate payloads). */
export function presetRoutes(): FixtureRoute[] {
  return FIXTURES.map((f) => f.route);
}

// Normalize a free-text place or code to a comparison token: uppercase alphanumerics.
function norm(s: unknown): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Does a search term refer to this route's destination? Accept the IATA code
// ("DUB"), the city ("Dublin"), or either embedded in the other (city/airport
// names the model might emit, e.g. "DublinIreland").
function matchesPlace(term: string, code: string, city: string): boolean {
  const t = norm(term), c = norm(code), ci = norm(city);
  if (!t) return false;
  if (t === c) return true;
  if (ci && (t === ci || t.includes(ci) || ci.includes(t))) return true;
  return false;
}

/**
 * Match a flight search to a fixture. Requires BOTH origin and destination to
 * match a captured route — an off-menu origin (e.g. a city we have no fixture
 * for) intentionally yields null so the demo can honestly say "no live results"
 * rather than serve a mismatched route.
 */
export function matchFlightFixture(origin: unknown, destination: unknown): Fixture | null {
  for (const f of FIXTURES) {
    const r = f.route;
    if (matchesPlace(String(origin), r.origin, "") &&
        matchesPlace(String(destination), r.destination, r.city)) {
      return f;
    }
  }
  return null;
}

/** Match a hotel search to a fixture by destination/location (city or code). */
export function matchHotelFixture(location: unknown): Fixture | null {
  for (const f of FIXTURES) {
    const r = f.route;
    if (matchesPlace(String(location), r.destination, r.city)) return f;
  }
  return null;
}
