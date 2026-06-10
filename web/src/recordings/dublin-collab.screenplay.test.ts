import { describe, it, expect } from "vitest";
import { dublinCollab } from "./dublin-collab.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import type { FolioData } from "../../../shared/events";

// Grounding test for the multi-act collab reel (P4). The screenplay compiler validates
// board/candidate/path refs at import, so importing already fails the build on a broken
// reference; these assertions guard the authored content: both picks, all four
// interaction kinds, a clean (flicker-free) folio progression, the right end state, and
// every per-act callout resolving (the nth-based matchers are brittle to re-ordering by
// design, so this is the safety net).
describe("dublin-collab multi-act reel (grounding)", () => {
  const frames = dublinCollab.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction.kind] : []);

  it("exercises all four interaction kinds, with two picks (flight + hotel)", () => {
    expect(new Set(interactions)).toEqual(new Set(["pick", "edit", "comment", "handoff"]));
    expect(interactions.filter((k) => k === "pick").length).toBe(2);
  });

  it("ends with both picks, a day-by-day plan, and the added food tour", () => {
    const last = folios.at(-1)!;
    expect(last.flights.map((f) => f.label).join()).toContain("Aer Lingus");
    expect(last.hotels.map((h) => h.name).join()).toContain("The Dean");
    expect((last.days?.length ?? 0)).toBeGreaterThanOrEqual(5);
    expect(last.days?.[4].activities.map((a) => a.name).join()).toContain("food tour");
  });

  it("never drops the picked flight or hotel back out (no folio flicker)", () => {
    const firstFlight = folios.findIndex((f) => f.flights.length > 0);
    const firstHotel = folios.findIndex((f) => f.hotels.length > 0);
    expect(firstFlight).toBeGreaterThanOrEqual(0);
    expect(firstHotel).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstFlight).every((f) => f.flights.length > 0)).toBe(true);
    expect(folios.slice(firstHotel).every((f) => f.hotels.length > 0)).toBe(true);
  });

  it("resolves all seven per-act callouts (none dropped)", () => {
    expect(dublinCollab.highlights.length).toBe(7);
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(7);
  });

  it("fires the callouts in ascending frame order (act order reads right)", () => {
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});
