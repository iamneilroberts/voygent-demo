import type { FolioData, FolioFlight, FolioHotel } from "../../shared/events";

const MUTATING = new Set([
  "flight_search", "hotel_search", "excursion_search",
  "patch_trip", "confirm_lodging", "promote_flights",
  "promote_hotels_to_lodging", "add_booking",
]);

export function isTripMutating(tool: string, args: Record<string, unknown>): boolean {
  if (!MUTATING.has(tool)) return false;
  // searches only mutate when accumulating into a trip
  if (tool.endsWith("_search")) return typeof args.trip_id === "string";
  return true;
}

function asPrice(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return `$${v}`;
  const s = String(v).trim();
  return s ? s : undefined;
}

// `read_trip` wraps the trip under `data`: { status, tripId, data: { meta, flights, lodging } }.
// Tolerate both the wrapped envelope and an already-unwrapped trip object.
export function tripToFolio(tripId: string, raw: any): FolioData {
  const t = raw?.data ?? raw ?? {};
  const meta = t?.meta ?? {};
  const title = String(meta.title ?? meta.clientName ?? meta.destination ?? t.title ?? "Trip");

  // After promote_flights, trip.flights is an object { outbound, return } whose
  // legs carry { route, airline, totalPrice, segments }. Before promotion (or in
  // legacy trips) it can be a flat array. Handle both.
  const flightLegs: any[] = Array.isArray(t.flights)
    ? t.flights
    : t.flights && typeof t.flights === "object"
      ? [t.flights.outbound, t.flights.return].filter(Boolean)
      : [];
  const flights: FolioFlight[] = flightLegs.map((f: any) => ({
    label: String(f.label ?? f.route ?? "Flight"),
    price: asPrice(f.price ?? f.totalPrice ?? f.total),
    carrier: f.airline ?? f.carrier ?? undefined,
    route: f.route ?? undefined,
  }));

  // `lodging[]` is the canonical promoted array; `hotels[]` is the staging array
  // (cleared to [] by promote_hotels_to_lodging). Prefer lodging, fall back to a
  // non-empty hotels only when lodging is absent — otherwise an emptied hotels[]
  // would mask the real lodging.
  const lodgingSrc = Array.isArray(t.lodging) && t.lodging.length
    ? t.lodging
    : Array.isArray(t.hotels) && t.hotels.length
      ? t.hotels
      : Array.isArray(t.lodging) ? t.lodging : [];
  const hotels: FolioHotel[] = lodgingSrc.map((h: any) => ({
    name: String(h.name ?? "Hotel"),
    price: asPrice(h.price ?? h.total ?? h.rate),
    stars: typeof h.stars === "number" ? h.stars : undefined,
  }));

  return { tripId, title, flights, hotels };
}
