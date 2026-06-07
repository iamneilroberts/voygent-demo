import type { FolioData, FolioFlight, FolioHotel, FolioDay, FolioActivity, FolioDining, FolioInclude } from "../../shared/events";

const MUTATING = new Set([
  "flight_search", "hotel_search", "excursion_search",
  "patch_trip", "confirm_lodging", "promote_flights",
  "promote_hotels_to_lodging", "add_booking",
  "apply_gap_tour_picks", "tripadvisor_search",
]);

export function isTripMutating(tool: string, args: Record<string, unknown>): boolean {
  if (!MUTATING.has(tool)) return false;
  // searches only mutate when accumulating into a trip (snake or camel id)
  if (tool.endsWith("_search")) return typeof args.trip_id === "string" || typeof args.tripId === "string";
  return true;
}

// Deterministic boilerplate "includes" — generic travel boilerplate carries no
// supplier data, so a static template is both fabrication-irrelevant and stable.
// Attached by tripToFolio once the trip has any itinerary days.
const DEMO_INCLUDES: FolioInclude[] = [
  { key: "whats-included", title: "What's included",
    body: "Round-trip flights, hand-picked hotels, and the day-by-day plan below — all booked and managed in one place." },
  { key: "good-to-know", title: "Good to know",
    body: "Activity and dining picks are suggestions you can swap anytime. Prices are live at time of search and confirmed before you book." },
  { key: "travel-tips", title: "Travel tips",
    body: "Bring layers for changeable weather, carry a contactless card for transit, and book popular excursions a few days ahead." },
];

function asPrice(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "number") return `$${v}`;
  const s = String(v).trim();
  return s ? s : undefined;
}

function asStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function projectDays(itinerary: unknown): FolioDay[] {
  if (!Array.isArray(itinerary)) return [];
  return itinerary
    .filter((d: any) => d && typeof d === "object")
    .map((d: any) => {
      const activities: FolioActivity[] = (Array.isArray(d.activities) ? d.activities : [])
        .filter((a: any) => a && typeof a === "object" && a.name)
        .map((a: any) => ({
          time: asStr(a.time),
          name: String(a.name),
          description: asStr(a.description),
          url: asStr(a.url ?? a.bookingUrl),
        }));
      const dining: FolioDining[] = (Array.isArray(d.dining) ? d.dining : [])
        .filter((m: any) => m && typeof m === "object" && m.name)
        .map((m: any) => ({
          name: String(m.name),
          description: asStr(m.description),
          cuisine: asStr(m.cuisine),
          url: asStr(m.url),
        }));
      // NB: a join of an all-empty array returns "" (not nullish), so "?? Day"
      // would never fire — use "|| Day" on the fallback to catch the empty case.
      const fallback = [asStr(d.day) ? `Day ${d.day}` : undefined, asStr(d.location)].filter(Boolean).join(" — ");
      const title = asStr(d.title) ?? (fallback || "Day");
      return {
        date: asStr(d.date),
        title,
        location: asStr(d.location),
        activities,
        dining,
        stay: asStr(d.stay ?? d.lodging?.name),
      };
    })
    .filter((day: FolioDay) => day.activities.length > 0 || day.dining.length > 0 || !!day.stay);
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
  const rawLegs: any[] = Array.isArray(t.flights)
    ? t.flights
    : t.flights && typeof t.flights === "object"
      ? [t.flights.outbound, t.flights.return].filter(Boolean)
      : [];
  // Skip bare staging stubs ({ _candidateId } the model writes before promote_flights);
  // the folio shows only promoted flights, never transient placeholders.
  const flightLegs = rawLegs.filter((f: any) => f && (f.route || f.airline || f.segments || f.totalPrice || f.price));
  const flights: FolioFlight[] = flightLegs.map((f: any) => {
    const segs = Array.isArray(f.segments) ? f.segments : [];
    return {
      label: String(f.label ?? f.route ?? "Flight"),
      price: asPrice(f.price ?? f.totalPrice ?? f.total),
      carrier: f.airline ?? f.carrier ?? undefined,
      route: f.route ?? undefined,
      date: f.date ?? undefined,
      cabin: f.cabin ?? undefined,
      stops: segs.length > 0 ? Math.max(0, segs.length - 1) : undefined,
    };
  });

  // `lodging[]` is the canonical promoted array; `hotels[]` is the staging array
  // (cleared to [] by promote_hotels_to_lodging). Prefer lodging, fall back to a
  // non-empty hotels only when lodging is absent — otherwise an emptied hotels[]
  // would mask the real lodging.
  const lodgingSrc = Array.isArray(t.lodging) && t.lodging.length
    ? t.lodging
    : Array.isArray(t.hotels) && t.hotels.length
      ? t.hotels
      : Array.isArray(t.lodging) ? t.lodging : [];
  // Skip bare staging stubs ({ _candidateId } with no display data) so the folio
  // never flashes nameless "Hotel" placeholders between stage and promote.
  const hotels: FolioHotel[] = lodgingSrc.filter((h: any) => h && (h.name || h.priceTotal || h.total)).map((h: any) => ({
    name: String(h.name ?? "Hotel"),
    price: asPrice(h.price ?? h.total ?? h.rate ?? h.priceTotal),
    stars: typeof h.stars === "number" ? h.stars : (typeof h.starRating === "number" ? h.starRating : undefined),
    area: h.location ?? h.area ?? undefined,
    nights: typeof h.nights === "number" ? h.nights : undefined,
    perNight: asPrice(h.pricePerNight),
  }));

  const days = projectDays(t.itinerary);
  const base: FolioData = { tripId, title, flights, hotels };
  if (days.length > 0) { base.days = days; base.includes = DEMO_INCLUDES; }
  return base;
}
