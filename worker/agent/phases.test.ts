import { describe, it, expect } from "vitest";
import {
  TRIP_PHASES, INITIAL_PHASE, phaseIndex, isBeforeSummary, isActionPhase,
  phaseDirective, type TripPhase,
} from "./phases";

describe("trip phase ordering", () => {
  it("INITIAL_PHASE is INTAKE and is the lowest index", () => {
    expect(INITIAL_PHASE).toBe("INTAKE");
    expect(phaseIndex("INTAKE")).toBe(0);
  });
  it("phases are strictly ordered up to SUMMARY then EDITS", () => {
    expect(phaseIndex("FLIGHT_PICK")).toBeGreaterThan(phaseIndex("INTAKE"));
    expect(phaseIndex("ENRICH_DINING")).toBeLessThan(phaseIndex("SUMMARY"));
    expect(phaseIndex("EDITS")).toBeGreaterThan(phaseIndex("SUMMARY"));
  });
  it("isBeforeSummary is true for every build phase, false for SUMMARY/EDITS", () => {
    expect(isBeforeSummary("ENRICH_DINING")).toBe(true);
    expect(isBeforeSummary("SUMMARY")).toBe(false);
    expect(isBeforeSummary("EDITS")).toBe(false);
  });
  it("action phases exclude SUMMARY and EDITS", () => {
    expect(isActionPhase("INTAKE")).toBe(true);
    expect(isActionPhase("APPLY_PICKS")).toBe(true);
    expect(isActionPhase("SUMMARY")).toBe(false);
    expect(isActionPhase("EDITS")).toBe(false);
  });
});

describe("phaseDirective", () => {
  const ctx = { boardsMode: false, liveMode: false };
  it("returns a non-empty instruction for every phase", () => {
    for (const p of TRIP_PHASES) {
      expect(typeof phaseDirective(p as TripPhase, ctx)).toBe("string");
      expect(phaseDirective(p as TripPhase, ctx).length).toBeGreaterThan(10);
    }
  });
  it("names the right tool per phase", () => {
    expect(phaseDirective("HOTEL_SEARCH", ctx)).toContain("hotel_search");
    expect(phaseDirective("ENRICH_EXCURSIONS", ctx)).toContain("excursion_search");
    expect(phaseDirective("APPLY_PICKS", ctx)).toContain("apply_gap_tour_picks");
    expect(phaseDirective("ENRICH_DINING", ctx)).toContain("tripadvisor_search");
  });
  it("FLIGHT_PICK ends the turn in boards mode, acts in auto mode", () => {
    expect(phaseDirective("FLIGHT_PICK", { boardsMode: true, liveMode: false }).toLowerCase()).toContain("end your turn");
    expect(phaseDirective("FLIGHT_PICK", { boardsMode: false, liveMode: false }).toLowerCase()).toContain("promote_flights");
  });
});

import { advancePhase } from "./phases";

const ctx = { boardsMode: true, liveMode: false };
const okPersisted = { status: "ok", persisted: true };
const okStatus = { status: "ok" };

describe("advancePhase", () => {
  it("INTAKE: save_trip is a no-op, flight_search advances to FLIGHT_PICK", () => {
    expect(advancePhase("INTAKE", "save_trip", {}, okStatus, ctx)).toBe("INTAKE");
    expect(advancePhase("INTAKE", "flight_search", {}, okStatus, ctx)).toBe("FLIGHT_PICK");
  });
  it("FLIGHT_PICK -> HOTEL_SEARCH only on promote_flights", () => {
    expect(advancePhase("FLIGHT_PICK", "patch_trip", {}, okStatus, ctx)).toBe("FLIGHT_PICK");
    expect(advancePhase("FLIGHT_PICK", "promote_flights", {}, okStatus, ctx)).toBe("HOTEL_SEARCH");
  });
  it("HOTEL_SEARCH advances on hotel_search OR hotel_search_and_rank", () => {
    expect(advancePhase("HOTEL_SEARCH", "hotel_search", {}, okStatus, ctx)).toBe("HOTEL_PICK");
    expect(advancePhase("HOTEL_SEARCH", "hotel_search_and_rank", {}, okStatus, ctx)).toBe("HOTEL_PICK");
  });
  it("HOTEL_PICK -> ENRICH_EXCURSIONS on promote, or on live lodging patch", () => {
    expect(advancePhase("HOTEL_PICK", "promote_hotels_to_lodging", {}, okStatus, ctx)).toBe("ENRICH_EXCURSIONS");
    expect(advancePhase("HOTEL_PICK", "patch_trip", { updates: { lodging: [{ name: "X" }] } }, okStatus, { ...ctx, liveMode: true })).toBe("ENRICH_EXCURSIONS");
    expect(advancePhase("HOTEL_PICK", "patch_trip", { updates: { hotels: [{}] } }, okStatus, { ...ctx, liveMode: true })).toBe("HOTEL_PICK");
  });
  it("ENRICH_EXCURSIONS -> APPLY_PICKS -> ENRICH_DINING -> SUMMARY", () => {
    expect(advancePhase("ENRICH_EXCURSIONS", "excursion_search", {}, okStatus, ctx)).toBe("APPLY_PICKS");
    expect(advancePhase("APPLY_PICKS", "apply_gap_tour_picks", {}, okPersisted, ctx)).toBe("ENRICH_DINING");
    expect(advancePhase("ENRICH_DINING", "tripadvisor_search", {}, okStatus, ctx)).toBe("SUMMARY");
  });
  it("APPLY_PICKS stays put when the result is not persisted", () => {
    expect(advancePhase("APPLY_PICKS", "apply_gap_tour_picks", {}, { status: "error", persisted: false }, ctx)).toBe("APPLY_PICKS");
  });
  it("a failed/error result never advances", () => {
    expect(advancePhase("INTAKE", "flight_search", {}, { status: "error" }, ctx)).toBe("INTAKE");
    expect(advancePhase("INTAKE", "flight_search", {}, null, ctx)).toBe("INTAKE"); // unparseable result
  });
  it("EDITS re-enters the right phase by observed tool", () => {
    expect(advancePhase("EDITS", "hotel_search", {}, okStatus, ctx)).toBe("HOTEL_PICK");
    expect(advancePhase("EDITS", "excursion_search", {}, okStatus, ctx)).toBe("APPLY_PICKS");
    expect(advancePhase("EDITS", "read_trip", {}, okStatus, ctx)).toBe("EDITS"); // non-build tool: stay
  });
});
