import { describe, it, expect } from "vitest";
import { dublinCollab } from "./dublin-collab.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import type { FolioData } from "../../../shared/events";

// Grounding test for the authored collab reel (mirrors dublin-oct.highlights.test.ts).
// The screenplay compiler validates board/candidate/path refs at import, so importing
// it already fails the build on a broken reference; these assertions guard the P2.4
// content itself: all four interactions present, a clean (flicker-free) folio
// progression, the right end state, and every spotlight resolving.
describe("dublin-collab reel (grounding)", () => {
  const frames = dublinCollab.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction.kind] : []);

  it("exercises all four interaction kinds", () => {
    expect(new Set(interactions)).toEqual(new Set(["pick", "edit", "comment", "handoff"]));
  });

  it("ends with the picked flight and the added food tour in the folio", () => {
    const last = folios.at(-1)!;
    expect(last.flights.map((f) => f.label).join()).toContain("Aer Lingus");
    expect(last.days?.[2].activities.map((a) => a.name).join()).toContain("food tour");
  });

  it("never drops the picked flight back out (no folio flicker)", () => {
    // Once a folio carries the flight, no later folio re-emits an empty flight list.
    const firstWithFlight = folios.findIndex((f) => f.flights.length > 0);
    expect(firstWithFlight).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstWithFlight).every((f) => f.flights.length > 0)).toBe(true);
  });

  it("resolves every spotlight (none dropped)", () => {
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(dublinCollab.highlights.length);
  });
});
