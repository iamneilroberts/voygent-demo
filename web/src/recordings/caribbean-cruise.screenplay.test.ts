import { describe, it, expect } from "vitest";
import { caribbeanCruise, meta } from "./caribbean-cruise.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import { estimateReelMs } from "../lib/reel-duration";
import { computeTripTotal } from "../lib/reel-pricing";
import type { FolioData } from "../../../shared/events";
import type { ReelFolioSession } from "../lib/recording";

// Grounding test for "A family cruise, planned in one chat" (DIY reel). The screenplay
// compiler validates board/candidate/path refs at import, so importing already fails
// the build on a broken reference; these assertions guard the authored content:
// traveller-only (no advisor, no commission anywhere), every candidate sourced, the
// declined-date beat, the folio never dropping content once added, and the finale
// total reconciling to the hand-computed number.
describe("caribbean-cruise screenplay (grounding)", () => {
  const frames = caribbeanCruise.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const boards = frames.flatMap((f) => (f.kind === "event" && f.event.type === "board") ? [f.event] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const kinds = interactions.map((i) => i.kind);
  const allTexts = frames.flatMap((f) => (f.kind === "event" && f.event.type === "text") ? [f.event.delta] : []);
  const allUserTexts = frames.flatMap((f) => (f.kind === "user") ? [f.text] : []);

  it("is traveller-only: picks and the finale cutaway, nothing else", () => {
    expect(new Set(kinds)).toEqual(new Set(["pick", "folioview"]));
    expect(kinds.includes("handoff")).toBe(false);
  });

  it("no advisor actor anywhere", () => {
    const actors = frames.flatMap((f) => (f.kind === "interaction") ? [f.actor] : []);
    expect(actors.every((a) => a !== "advisor")).toBe(true);
  });

  it("no candidate carries a commission/OTA/client-price field, and no folio carries commissions", () => {
    for (const b of boards) {
      for (const c of b.candidates) {
        expect(c).not.toHaveProperty("commission");
        expect(c).not.toHaveProperty("commissionPct");
        expect(c).not.toHaveProperty("otaFrom");
        expect(c).not.toHaveProperty("clientPrice");
      }
    }
    expect(folios.every((f) => f.commissions == null)).toBe(true);
  });

  it("every board candidate carries a source, and the union is exactly the five named suppliers", () => {
    const sources = new Set<string>();
    for (const b of boards) {
      for (const c of b.candidates) {
        expect(typeof c.source).toBe("string");
        sources.add(c.source as string);
      }
    }
    expect(sources).toEqual(new Set(["Widgety", "Viator", "GetYourGuide", "Shore Excursions Group", "Expedia"]));
  });

  it("declines the cheaper later week and keeps March 29, but banks the connecting-cabin saving", () => {
    expect(allTexts.some((t) => t.includes("$412"))).toBe(true);
    expect(allUserTexts.some((t) => /last week of March|keep March 29/i.test(t))).toBe(true);
    expect(allTexts.some((t) => t.includes("$284"))).toBe(true);
    expect(3464 - 284).toBe(3180);
    const withCruise = folios.find((f) => f.days != null)!;
    expect(withCruise.days![0].date).toBe("Sun Mar 29");
  });

  it("the cruise persists once picked: every folio from that point on keeps the 7-day itinerary", () => {
    const firstDays = folios.findIndex((f) => f.days != null);
    expect(firstDays).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstDays).every((f) => f.days?.length === 7)).toBe(true);
  });

  it("the excursions land on their ports and persist once added", () => {
    const withCozumel = folios.findIndex((f) => f.days?.[2].activities.some((a) => a.name.includes("Chankanaab")));
    const withFalmouth = folios.findIndex((f) => f.days?.[4].activities.some((a) => a.name.includes("Dunn's River Falls")));
    expect(withCozumel).toBeGreaterThan(0);
    expect(withFalmouth).toBeGreaterThan(0);
    expect(folios.slice(withCozumel).every((f) => f.days?.[2].activities.some((a) => a.name.includes("Chankanaab")))).toBe(true);
    expect(folios.slice(withFalmouth).every((f) => f.days?.[4].activities.some((a) => a.name.includes("Dunn's River Falls")))).toBe(true);
  });

  it("the pre-cruise hotel persists once picked", () => {
    const firstHotel = folios.findIndex((f) => f.hotels.length > 0);
    expect(firstHotel).toBeGreaterThan(0);
    expect(folios.slice(firstHotel).every((f) => f.hotels.length > 0)).toBe(true);
  });

  it("the family tips fold into the folio and persist", () => {
    const firstIncludes = folios.findIndex((f) => (f.includes?.length ?? 0) > 0);
    expect(firstIncludes).toBeGreaterThan(0);
    expect(folios.slice(firstIncludes).every((f) => (f.includes?.length ?? 0) === 5)).toBe(true);
  });

  it("the finale total reconciles to the hand-computed family total", () => {
    const snapshots = interactions.flatMap((i) => (i.kind === "folioview" && i.view) ? [i.view as ReelFolioSession] : []);
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    const last = snapshots.at(-1)!;
    // hotel 189 + cruise fare 3180 + Chankanaab 117 + Dunn's River 180 + wifi 89 (the "pop")
    expect(computeTripTotal(last)).toBe(3755);
  });

  it("resolves all callouts, in ascending frame order", () => {
    expect(caribbeanCruise.highlights.length).toBe(8);
    const resolved = resolveHighlightFrames(frames, caribbeanCruise.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(8);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });

  it("opens with the orientation callout on the navigation cluster (frame 0)", () => {
    const first = caribbeanCruise.highlights[0];
    expect(first.target).toBe("reel-controls");
    const resolved = resolveHighlightFrames(frames, [first]);
    expect(resolved.has(0)).toBe(true);
  });

  it("exports the honest, em-dash-free meta the registry agent wires up", () => {
    expect(meta.id).toBe("cruise");
    expect(meta.recap.length).toBeGreaterThanOrEqual(5);
    const allCopy = [meta.title, meta.blurb, meta.intro.eyebrow, meta.intro.note, meta.endCard.eyebrow, meta.endCard.title, meta.endCard.blurb, ...meta.recap];
    for (const line of allCopy) expect(line).not.toMatch(/—/);
  });

  it("estimated 1x runtime lands between 130s and 230s", () => {
    const total = estimateReelMs(caribbeanCruise.recording, caribbeanCruise.highlights);
    expect(total).toBeGreaterThan(130_000);
    expect(total).toBeLessThan(230_000);
  });
});
