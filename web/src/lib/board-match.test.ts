import { describe, it, expect } from "vitest";
import { isPickTool, resolveBoardPickId } from "./board-match";

describe("isPickTool", () => {
  it("treats promote_* / patch_trip / confirm_lodging as pick-signaling", () => {
    expect(isPickTool("promote_flights")).toBe(true);
    expect(isPickTool("promote_hotels_to_lodging")).toBe(true);
    expect(isPickTool("patch_trip")).toBe(true);
    expect(isPickTool("confirm_lodging")).toBe(true);
  });
  it("excludes search tools (they echo every candidate id)", () => {
    expect(isPickTool("flight_search")).toBe(false);
    expect(isPickTool("hotel_search")).toBe(false);
    expect(isPickTool("save_trip")).toBe(false);
    expect(isPickTool("tripadvisor_search")).toBe(false);
  });
});

describe("resolveBoardPickId", () => {
  const flightIds = ["serp:70wngy", "serp:3lqsh0", "serp:thxolp", "serp:1w4jijl"];

  it("returns the candidate id staged in the pick-tool blob", () => {
    const blob = JSON.stringify({ updates: { flights: [{ _candidateId: "serp:3lqsh0" }] } });
    expect(resolveBoardPickId(flightIds, blob)).toBe("serp:3lqsh0");
  });

  it("disambiguates among same-title/same-price candidates by id", () => {
    // All four titles are identical in the real recording; only the id differs.
    const blob = 'promote_flights ok serp:thxolp assembled';
    expect(resolveBoardPickId(flightIds, blob)).toBe("serp:thxolp");
  });

  it("returns undefined when no candidate id is referenced (e.g. collab reel: no pick tools)", () => {
    expect(resolveBoardPickId(flightIds, "")).toBeUndefined();
    expect(resolveBoardPickId(flightIds, "patch_trip days enrichment only")).toBeUndefined();
  });

  it("ignores empty candidate ids so a blank id never spuriously matches", () => {
    // The empty id would substring-match any blob; the length guard skips it so the
    // real staged id is the one that resolves.
    expect(resolveBoardPickId(["", "serp:70wngy"], "promote serp:70wngy")).toBe("serp:70wngy");
  });
});
