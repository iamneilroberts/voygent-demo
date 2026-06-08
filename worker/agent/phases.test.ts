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
