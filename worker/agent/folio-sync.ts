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

  const flightsSrc = Array.isArray(t.flights) ? t.flights : [];
  const flights: FolioFlight[] = flightsSrc.map((f: any) => ({
    label: String(f.label ?? f.route ?? "Flight"),
    price: asPrice(f.price ?? f.total),
    carrier: f.airline ?? f.carrier ?? undefined,
    route: f.route ?? undefined,
  }));

  const lodgingSrc = Array.isArray(t.hotels) ? t.hotels : Array.isArray(t.lodging) ? t.lodging : [];
  const hotels: FolioHotel[] = lodgingSrc.map((h: any) => ({
    name: String(h.name ?? "Hotel"),
    price: asPrice(h.price ?? h.total ?? h.rate),
    stars: typeof h.stars === "number" ? h.stars : undefined,
  }));

  return { tripId, title, flights, hotels };
}
