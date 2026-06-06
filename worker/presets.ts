import { presetRoutes, type FixtureRoute } from "./fixtures/index";

// Friendly origin-city names for the IATA codes our fixtures depart from (used in
// the one-click prompt so the agent gets an unambiguous origin).
const ORIGIN_CITY: Record<string, string> = {
  MOB: "Mobile", ATL: "Atlanta", SFO: "San Francisco", JFK: "New York", ORD: "Chicago",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function humanDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  return `${MONTHS[mi] ?? m} ${Number(d)}, ${y}`;
}

// A complete, unambiguous prompt so a one-click preset builds a full real trip
// without the agent needing to interview for missing params.
export function buildPresetPrompt(r: FixtureRoute): string {
  const from = ORIGIN_CITY[r.origin] ? `${ORIGIN_CITY[r.origin]} (${r.origin})` : r.origin;
  return `Plan the ${r.label} trip end to end — round-trip flights from ${from} to ${r.city} for ${r.adults} travelers, ${humanDate(r.depart)} to ${humanDate(r.ret)}, plus a few hotel options.`;
}

export interface PresetCard {
  id: string; label: string; city: string; origin: string;
  subtitle: string; prompt: string;
}

export interface PresetsResponse {
  geo: { city: string | null; region: string | null; country: string | null };
  presets: PresetCard[];
}

export function buildPresets(req: Request): PresetsResponse {
  const cf = (req as any).cf ?? {};
  const presets: PresetCard[] = presetRoutes().map((r) => ({
    id: r.id,
    label: r.label,
    city: r.city,
    origin: r.origin,
    subtitle: `${r.origin} → ${r.city} · ${humanDate(r.depart)}`,
    prompt: buildPresetPrompt(r),
  }));
  return {
    geo: { city: cf.city ?? null, region: cf.region ?? null, country: cf.country ?? null },
    presets,
  };
}
