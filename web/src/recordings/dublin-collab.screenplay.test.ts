import { describe, it, expect } from "vitest";
import { dublinCollab } from "./dublin-collab.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import { computeTripTotal } from "../lib/reel-pricing";
import type { FolioData } from "../../../shared/events";
import type { ReelClientSession } from "../lib/recording";

// Grounding test for the full collab reel (R5). The screenplay compiler validates
// board/candidate/path refs at import, so importing already fails the build on a broken
// reference; these assertions guard the authored content: every interaction kind (incl. a
// multi-select shortlist and the client-view snapshots), a clean (flicker-free) folio
// progression, the right end state, the client-view price math, and every per-act callout
// resolving in act order (the nth-based matchers are brittle to re-ordering by design, so
// this is the safety net).
describe("dublin-collab full reel (grounding)", () => {
  const frames = dublinCollab.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const kinds = interactions.map((i) => i.kind);
  const clientViews = interactions.flatMap((i) => i.kind === "clientview" && i.view ? [i.view as ReelClientSession] : []);

  it("exercises every interaction kind, including the engineering-panel peek", () => {
    expect(new Set(kinds)).toEqual(new Set(["pick", "edit", "comment", "handoff", "clientview", "engpanel", "folioview"]));
  });

  it("cuts away to the folio window after the send, then closes it before the client-view beat (C9)", () => {
    const seq = kinds;
    const h = seq.indexOf("handoff"), fv = seq.indexOf("folioview"), cv = seq.indexOf("clientview");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(fv).toBeGreaterThan(h);   // the cutaway is what the send delivers
    expect(cv).toBeGreaterThan(fv);  // the pricing-widget beat still follows it
    const fvs = interactions.flatMap((i) => (i.kind === "folioview" ? [i.view] : []));
    expect(fvs.at(-1)).toBeNull();   // closed — ended still derives from clientView
    const first = fvs[0]!;
    expect(first.pickedHotelId).toBeNull();          // nothing picked at send time
    expect(first.hotels.length).toBe(3);             // the Act-3 shortlist as the client's choice
    expect(computeTripTotal(first)).toBe(3180 + 740); // matches cvBase's un-picked total
    expect(first.folio.includes?.length).toBeGreaterThanOrEqual(1); // the sent folio carries the extras
  });

  it("has a multi-select shortlist (advisor picks >1 hotel) and a single flight pick", () => {
    const picks = interactions.filter((i) => i.kind === "pick") as Array<{ candidateIds: string[] }>;
    expect(picks.some((p) => p.candidateIds.length > 1)).toBe(true);  // hotel + includes shortlists
    expect(picks.some((p) => p.candidateIds.length === 1)).toBe(true); // the flight
  });

  it("ends with the picked flight, the chosen hotel, the includes, and the added food tour", () => {
    const last = folios.at(-1)!;
    expect(last.flights.map((f) => f.label).join()).toContain("Aer Lingus");
    expect(last.hotels.map((h) => h.name).join()).toContain("The Dean");
    expect((last.days?.length ?? 0)).toBeGreaterThanOrEqual(5);
    expect((last.includes?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(last.days?.[4].activities.map((a) => a.name).join()).toContain("food tour");
  });

  it("never drops the flight or the hotel back out once present (no folio flicker)", () => {
    const firstFlight = folios.findIndex((f) => f.flights.length > 0);
    const firstHotel = folios.findIndex((f) => f.hotels.length > 0);
    expect(firstFlight).toBeGreaterThanOrEqual(0);
    expect(firstHotel).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstFlight).every((f) => f.flights.length > 0)).toBe(true);
    expect(folios.slice(firstHotel).every((f) => f.hotels.length > 0)).toBe(true);
  });

  it("animates the client-view total across snapshots and the math is sane", () => {
    expect(clientViews.length).toBeGreaterThanOrEqual(3);
    const totals = clientViews.map(computeTripTotal);
    // the total changes at least twice (hotel pick + add-on toggle)
    expect(new Set(totals).size).toBeGreaterThanOrEqual(3);
    // every total = flights + chosen hotel + activities + toggled add-ons, and stays positive
    expect(totals.every((t) => t > 0)).toBe(true);
    // the final committed view: flights 3180 + Dean 1176 + activities 740 + transfers 120
    const settled = clientViews.find((v) => v.pickedHotelId === "serp:h1" && v.addons.some((a) => a.on));
    expect(settled && computeTripTotal(settled)).toBe(3180 + 1176 + 740 + 120);
    // the shortlist prices match the hotel board (per-night × 7 nights)
    expect(settled?.hotels.find((h) => h.id === "serp:h1")?.price).toBe(168 * 7);
  });

  it("resolves all twelve per-act callouts (none dropped)", () => {
    expect(dublinCollab.highlights.length).toBe(12);
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(12);
  });

  it("fires the callouts in ascending frame order (act order reads right)", () => {
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});
