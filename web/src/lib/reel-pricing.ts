import type { ReelClientSession } from "./recording";

// The client view's running trip total: flights + the chosen hotel (0 until picked) +
// activities + every toggled-on add-on. Pure so the live recalc is deterministic and
// testable; the component just formats the result.
export function computeTripTotal(v: ReelClientSession): number {
  const hotel = v.hotels.find((h) => h.id === v.pickedHotelId)?.price ?? 0;
  const addons = v.addons.filter((a) => a.on).reduce((n, a) => n + a.price, 0);
  return v.flightsPrice + hotel + v.activitiesPrice + addons;
}

// Whole-dollar money label, e.g. 4739 -> "$4,739".
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}
