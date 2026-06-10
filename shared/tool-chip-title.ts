// Human, present-tense label for a tool-use chip, derived from the tool name + args.
// One source of truth for both the live worker path (loop.ts emits it on the tool
// event) and the reel timeline builder, so a chat reads "Searching hotels in Cancún"
// / "Shortlisting hotels" / "Building the day-by-day" instead of a raw `patch_trip`.
// The raw tool name still rides alongside as a mono tag (engineering honesty).

function place(args: Record<string, any>): string | null {
  const v = args?.destination ?? args?.location ?? args?.city ?? args?.query;
  return typeof v === "string" && v ? v : null;
}

function titleCase(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function toolChipTitle(name: string, args: Record<string, any> = {}): string {
  const where = place(args);
  switch (name) {
    case "save_trip": return "Starting your trip";
    case "flight_search": return where ? `Searching flights to ${where}` : "Searching flights";
    case "flight_list": return "Ranking the flights";
    case "hotel_search": return where ? `Searching hotels in ${where}` : "Searching hotels";
    case "hotel_list": case "hotel_search_and_rank": return "Ranking the hotels";
    case "promote_flights": return "Locking in the flight";
    case "promote_hotels_to_lodging": return "Locking in the hotels";
    case "excursion_search": return "Finding things to do";
    case "tripadvisor_search": return "Finding places to eat";
    case "apply_gap_tour_picks": return "Adding activities to your days";
    case "resolve": case "resolve_destination": return where ? `Looking up ${where}` : "Looking up the destination";
    case "list_render": return "Updating your folio";
    case "patch_trip": {
      const u = (args?.updates ?? {}) as Record<string, unknown>;
      // Order matters: flights/lodging are the "commit" intents; check them before the
      // broader hotels (staging) key so a flight stage reads as a flight action.
      if ("flights" in u) return "Saving your flight pick";
      if ("lodging" in u) return "Locking in the hotel";
      if ("hotels" in u) return "Shortlisting hotels";
      if ("itinerary" in u) return "Building the day-by-day";
      return "Updating the trip";
    }
    default: return titleCase(name);
  }
}
