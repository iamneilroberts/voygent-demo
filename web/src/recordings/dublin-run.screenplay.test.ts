import { describe, it, expect } from "vitest";
import { dublinRun } from "./dublin-run.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import { computeTripTotal } from "../lib/reel-pricing";
import type { FolioData } from "../../../shared/events";
import type { ReelClientSession } from "../lib/recording";

// Grounding test for the "run the trip" reel (chapter 2). The screenplay compiler
// validates board/candidate/path refs at import, so importing already fails the build
// on a broken reference; these assertions guard the authored content: the pasted
// confirmation lands in bookings, the gap-fill tour board + pick, the client's own
// toggle-and-recalc window, and the relayed change closing the loop.
describe("dublin-run screenplay", () => {
  const frames = dublinRun.recording.frames;
  const folioFrames = frames.filter((f) => f.kind === "event" && f.event.type === "folio");
  const folios = folioFrames.map((f) => (f as { event: { folio: FolioData } }).event.folio);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const clientViews = interactions.flatMap((i) => i.kind === "clientview" && i.view ? [i.view as ReelClientSession] : []);

  it("produces frames and highlights", () => {
    expect(dublinRun.recording.frames.length).toBeGreaterThan(10);
    expect(dublinRun.highlights.length).toBeGreaterThanOrEqual(4);
  });

  it("files the pasted confirmation into folio bookings", () => {
    const withBookings = folioFrames.filter((f) => ((f as { event: { folio: FolioData } }).event.folio.bookings ?? []).length > 0);
    expect(withBookings.length).toBeGreaterThan(0);
    expect(JSON.stringify(withBookings[0])).toContain("6XKPTR");
  });

  it("offers tours on a tour board and the advisor picks one", () => {
    expect(dublinRun.recording.frames.some((f) => f.kind === "event" && f.event.type === "board" && f.event.kind === "tour")).toBe(true);
    const picks = interactions.filter((i) => i.kind === "pick") as Array<{ boardId: string; candidateIds: string[] }>;
    expect(picks.some((p) => p.boardId === "b-tours" && p.candidateIds.includes("tour:wicklow"))).toBe(true);
  });

  it("never drops the booking once filed, and the tour lands on day 6 (index 5)", () => {
    const firstBooking = folios.findIndex((f) => (f.bookings ?? []).length > 0);
    expect(firstBooking).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstBooking).every((f) => (f.bookings ?? []).length > 0)).toBe(true);
    const last = folios.at(-1)!;
    const day6 = last.days?.[5];
    expect(day6?.activities.map((a) => a.name).join()).toContain("Wicklow");
    expect(day6?.activities.map((a) => a.name).join()).toContain("whiskey tasting walk");
  });

  it("animates the client-view total across snapshots as the whiskey walk toggles on", () => {
    expect(clientViews.length).toBeGreaterThanOrEqual(3);
    const totals = clientViews.map(computeTripTotal);
    expect(new Set(totals).size).toBeGreaterThanOrEqual(2);
    expect(totals.every((t) => t > 0)).toBe(true);
    const settled = clientViews.find((v) => v.addons.some((a) => a.on));
    expect(settled && computeTripTotal(settled)).toBeGreaterThan(clientViews[0].flightsPrice);
  });

  it("cuts away to the client folio right after the Wicklow pick — day 6 focused and already current (C9)", () => {
    const fvs = interactions.flatMap((i) => (i.kind === "folioview" ? [i.view] : []));
    expect(fvs.length).toBeGreaterThanOrEqual(2);
    const first = fvs[0]!;
    expect(first.focus).toBe("folio-day-6");
    expect(first.expandedDay).toBe(6);
    expect(first.folio.days?.[5].activities.map((a) => a.name).join()).toContain("Wicklow");
    expect(first.addons).toEqual([]);  // beat 3 hasn't offered the optional tours yet
    expect(computeTripTotal(first)).toBe(3180 + 1176 + 284); // = ch3's opening total (wire-truth lineage)
    expect(fvs.at(-1)).toBeNull();     // closed — ended still derives from clientView
  });

  it("resolves every callout, in ascending frame order", () => {
    const resolved = resolveHighlightFrames(frames, dublinRun.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(dublinRun.highlights.length);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });
});
