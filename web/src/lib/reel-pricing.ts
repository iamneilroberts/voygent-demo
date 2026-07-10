import type { ReelHotelOption, ReelAddon, ReelComponent } from "./recording";

// The pricing slice shared by ReelClientSession (ch1/ch2 client window) and
// ReelFolioSession (ch3 folio window). Both satisfy it structurally, so the one
// total function serves both surfaces.
export interface TripPricing {
  flightsPrice: number;
  activitiesPrice: number;
  hotels: ReelHotelOption[];
  pickedHotelId: string | null;
  addons: ReelAddon[];
  components?: ReelComponent[];
}

// The client view's running trip total: flights + the chosen hotel (0 until picked) +
// activities + every toggled-on add-on + every fixed component. Pure so the live
// recalc is deterministic and testable; the component just formats the result.
export function computeTripTotal(v: TripPricing): number {
  const hotel = v.hotels.find((h) => h.id === v.pickedHotelId)?.price ?? 0;
  const addons = v.addons.filter((a) => a.on).reduce((n, a) => n + a.price, 0);
  const components = (v.components ?? []).reduce((n, c) => n + c.price, 0);
  return v.flightsPrice + hotel + v.activitiesPrice + addons + components;
}

// Whole-dollar money label, e.g. 4739 -> "$4,739".
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
