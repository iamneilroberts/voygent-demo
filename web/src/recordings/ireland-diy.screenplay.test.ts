import { describe, it, expect } from "vitest";
import { irelandDiy, irelandFolio } from "./ireland-diy.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import { estimateReelMs } from "../lib/reel-duration";
import { computeTripTotal } from "../lib/reel-pricing";
import type { FolioData, BoardCandidate } from "../../../shared/events";
import type { ReelFolioSession } from "../lib/recording";

// Grounding test for the DIY ("build it yourself") reel: a couple plans a week in
// Ireland with no advisor anywhere. The screenplay compiler validates board/candidate/
// path refs at import, so a broken reference already fails the build; these assertions
// guard the authored content itself: no advisor surface leaks in anywhere, every search
// result names its source across six real providers, the proactive date-shift beat
// actually saves what it claims, nothing already added ever disappears, the finale
// folio's live total reconciles by hand, and every callout resolves in order.
describe("ireland-diy (grounding)", () => {
  const frames = irelandDiy.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const boards = frames.flatMap((f) => (f.kind === "event" && f.event.type === "board") ? [f.event] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const kinds = interactions.map((i) => i.kind);
  const folioViews = interactions.flatMap((i) => (i.kind === "folioview" && i.view) ? [i.view as ReelFolioSession] : []);

  it("uses only picks and the folio cutaway — no edit, comment, handoff, engpanel or clientview", () => {
    expect(new Set(kinds)).toEqual(new Set(["pick", "folioview"]));
    expect(kinds.filter((k) => k === "handoff")).toHaveLength(0);
  });

  it("has no advisor anywhere: no frame is spoken by an advisor", () => {
    const advisorFrames = frames.filter((f) => "actor" in f && f.actor === "advisor");
    expect(advisorFrames).toHaveLength(0);
  });

  it("no board candidate carries an advisor-only field (commission, otaFrom, clientPrice)", () => {
    const allCandidates = boards.flatMap((b) => b.candidates as BoardCandidate[]);
    expect(allCandidates.length).toBeGreaterThan(0);
    for (const c of allCandidates) {
      expect(c.commission).toBeUndefined();
      expect(c.commissionPct).toBeUndefined();
      expect(c.otaFrom).toBeUndefined();
      expect(c.clientPrice).toBeUndefined();
    }
  });

  it("no folio snapshot ever carries a commission breakdown", () => {
    expect(folios.every((f) => f.commissions == null)).toBe(true);
  });

  it("every candidate on a live-search board carries a source, spanning six real providers", () => {
    const SEARCH_BOARD_IDS = new Set(["b-flight", "b-hotel-dub", "b-hotel-kil", "b-car", "b-tours"]);
    const searchCandidates = boards
      .filter((b) => SEARCH_BOARD_IDS.has(b.boardId))
      .flatMap((b) => b.candidates as BoardCandidate[]);
    expect(searchCandidates.length).toBe(3 + 3 + 3 + 3 + 3); // flight, hotel-dub, hotel-kil, car, tours
    expect(searchCandidates.every((c) => !!c.source)).toBe(true);
    const sources = new Set(searchCandidates.map((c) => c.source));
    expect(sources).toEqual(new Set(["Travelpayouts", "Kiwi.com", "Booking.com", "LiteAPI", "Viator", "GetYourGuide"]));
  });

  it("the tips board is Voygent's own curation, not a supplier search — no source attribution", () => {
    const inclBoard = boards.find((b) => b.boardId === "b-incl")!;
    expect(inclBoard.candidates.length).toBeGreaterThan(0);
    expect((inclBoard.candidates as BoardCandidate[]).every((c) => c.source == null)).toBe(true);
  });

  it("the date-shift beat: nonstop fare drops 612 -> 498 per person and the dates move, saving $228 for two", () => {
    const perPersonSeen = folios.flatMap((f) => f.flights.map((fl) => fl.perPerson)).filter(Boolean);
    expect(perPersonSeen[0]).toBe("$612");
    expect(perPersonSeen.at(-1)).toBe("$498");
    const datesSeen = new Set(folios.flatMap((f) => f.flights.map((fl) => fl.date)).filter(Boolean));
    expect(datesSeen.has("Sep 19-26")).toBe(true);
    expect(datesSeen.has("Sep 22-29")).toBe(true);
    expect(2 * (612 - 498)).toBe(228);
    const savingsStated = frames.some((f) => f.kind === "event" && f.event.type === "text" && f.event.delta.includes("228"));
    expect(savingsStated).toBe(true);
  });

  it("never drops the flight once present (no folio flicker)", () => {
    const first = folios.findIndex((f) => f.flights.length > 0);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(folios.slice(first).every((f) => f.flights.length > 0)).toBe(true);
  });

  it("both hotels persist once added — Dublin then Killarney, never dropped", () => {
    const withDub = folios.findIndex((f) => f.hotels.some((h) => h.name === "Wren Urban Nest"));
    expect(withDub).toBeGreaterThanOrEqual(0);
    expect(folios.slice(withDub).every((f) => f.hotels.some((h) => h.name === "Wren Urban Nest"))).toBe(true);
    const withKil = folios.findIndex((f) => f.hotels.some((h) => h.name === "Arbutus Hotel"));
    expect(withKil).toBeGreaterThan(withDub);
    expect(folios.slice(withKil).every((f) => f.hotels.length === 2)).toBe(true);
  });

  it("the rental car persists once booked", () => {
    const withCar = folios.findIndex((f) => (f.bookings ?? []).some((b) => b.label.includes("Dublin Airport")));
    expect(withCar).toBeGreaterThanOrEqual(0);
    expect(folios.slice(withCar).every((f) => (f.bookings ?? []).length > 0)).toBe(true);
  });

  it("has the flight pick, both hotel picks, the car pick and a 2-tour pick", () => {
    const picks = interactions.filter((i) => i.kind === "pick") as Array<{ boardId: string; candidateIds: string[] }>;
    expect(picks.find((p) => p.boardId === "b-flight")?.candidateIds).toEqual(["flight:aerlingus-ns"]);
    expect(picks.find((p) => p.boardId === "b-hotel-dub")?.candidateIds).toEqual(["hotel:wren"]);
    expect(picks.find((p) => p.boardId === "b-hotel-kil")?.candidateIds).toEqual(["hotel:arbutus"]);
    expect(picks.find((p) => p.boardId === "b-car")?.candidateIds).toEqual(["car:corolla-auto"]);
    expect(picks.find((p) => p.boardId === "b-tours")?.candidateIds).toHaveLength(2);
    expect(picks.find((p) => p.boardId === "b-incl")?.candidateIds).toHaveLength(4);
  });

  it("the free extras fold into the final chat folio: the walking tour, the museum, the gardens", () => {
    const last = folios.at(-1)!;
    const activityNames = (last.days ?? []).flatMap((d) => d.activities.map((a) => a.name));
    expect(activityNames.some((n) => n.includes("walking tour"))).toBe(true);
    expect(activityNames.some((n) => n.includes("National Museum"))).toBe(true);
    expect(activityNames.some((n) => n.includes("Muckross House"))).toBe(true);
    expect((last.includes ?? []).length).toBe(4);
  });

  it("the finale folioView total reconciles by hand", () => {
    expect(folioViews.length).toBe(2);
    // 2 * $498 flights + hotels (417 + 476) + tours (42 + 38) * 2 + car (7 * 44) + insurance
    const withoutInsurance = 996 + 893 + 160 + 308;
    const withInsurance = withoutInsurance + 128;
    expect(computeTripTotal(folioViews[0])).toBe(withoutInsurance);
    expect(computeTripTotal(folioViews[1])).toBe(withInsurance);
    expect(computeTripTotal(folioViews[1])).toBe(2485);
  });

  it("resolves the exported final folio and finds it advisor-free", () => {
    expect(irelandFolio.commissions).toBeUndefined();
    expect(irelandFolio.hotels).toHaveLength(2);
  });

  it("resolves all callouts, in ascending frame order", () => {
    expect(irelandDiy.highlights.length).toBe(6);
    const resolved = resolveHighlightFrames(frames, irelandDiy.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(6);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });

  it("opens with the hero callout bound to the very first frame", () => {
    const first = irelandDiy.highlights[0];
    expect(first.target).toBe("reel-controls");
    const resolved = resolveHighlightFrames(frames, [first]);
    expect(resolved.has(0)).toBe(true);
  });

  it("estimates a 1x runtime between 130s and 230s (tolerant estimate, mirrors the player)", () => {
    const total = estimateReelMs(irelandDiy.recording, irelandDiy.highlights);
    expect(total).toBeGreaterThan(130_000);
    expect(total).toBeLessThan(230_000);
  });
});
