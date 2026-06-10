import { describe, it, expect } from "vitest";
import { toolChipTitle } from "./tool-chip-title";

describe("toolChipTitle", () => {
  it("maps search + promote tools (with place when present)", () => {
    expect(toolChipTitle("save_trip", {})).toBe("Starting your trip");
    expect(toolChipTitle("hotel_search", { location: "Cancún" })).toBe("Searching hotels in Cancún");
    expect(toolChipTitle("hotel_search", {})).toBe("Searching hotels");
    expect(toolChipTitle("flight_search", { destination: "Cancún" })).toBe("Searching flights to Cancún");
    expect(toolChipTitle("flight_search", {})).toBe("Searching flights");
    expect(toolChipTitle("flight_list", {})).toBe("Ranking the flights");
    expect(toolChipTitle("hotel_list", {})).toBe("Ranking the hotels");
    expect(toolChipTitle("hotel_search_and_rank", {})).toBe("Ranking the hotels");
    expect(toolChipTitle("promote_flights", {})).toBe("Locking in the flight");
    expect(toolChipTitle("promote_hotels_to_lodging", {})).toBe("Locking in the hotels");
    expect(toolChipTitle("excursion_search", {})).toBe("Finding things to do");
    expect(toolChipTitle("tripadvisor_search", {})).toBe("Finding places to eat");
    expect(toolChipTitle("apply_gap_tour_picks", {})).toBe("Adding activities to your days");
    expect(toolChipTitle("resolve_destination", { query: "Cancún" })).toBe("Looking up Cancún");
    expect(toolChipTitle("list_render", {})).toBe("Updating your folio");
  });

  it("branches patch_trip on the updated key (flights/lodging before hotels)", () => {
    expect(toolChipTitle("patch_trip", { updates: { flights: [{}] } })).toBe("Saving your flight pick");
    expect(toolChipTitle("patch_trip", { updates: { hotels: [{}] } })).toBe("Shortlisting hotels");
    expect(toolChipTitle("patch_trip", { updates: { lodging: [{}] } })).toBe("Locking in the hotel");
    expect(toolChipTitle("patch_trip", { updates: { itinerary: [] } })).toBe("Building the day-by-day");
    expect(toolChipTitle("patch_trip", { updates: { meta: {} } })).toBe("Updating the trip");
    expect(toolChipTitle("patch_trip", {})).toBe("Updating the trip");
  });

  it("falls back to a title-cased tool name and tolerates missing args", () => {
    expect(toolChipTitle("some_new_tool", {})).toBe("Some New Tool");
    expect(toolChipTitle("save_trip")).toBe("Starting your trip");
  });
});
