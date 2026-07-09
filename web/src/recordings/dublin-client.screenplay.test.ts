import { describe, it, expect } from "vitest";
import { dublinClient } from "./dublin-client.screenplay";
import { computeTripTotal } from "../lib/reel-pricing";
import { resolveHighlightFrames } from "../lib/highlights";
import type { ReelFolioSession } from "../lib/recording";

const frames = dublinClient.recording.frames;
const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
const views: ReelFolioSession[] = interactions.flatMap((i) =>
  i.kind === "folioview" && i.view ? [i.view] : []);

// Grounding test for chapter 2 · "The client's view" (QA4 arc): all client, no advisor
// surfaces. The invite email opens the chapter, the advisor's note is pinned on the
// folio, the hotel choice reprices the trip live (flip, flip back), the tour page is
// one click deep, and the chapter closes on the one-click send back to the advisor.
describe("dublin-client chapter 2 (grounding)", () => {
  it("stays entirely in the client's world: no chat events at all", () => {
    expect(frames.filter((f) => f.kind === "event")).toEqual([]);
  });

  it("opens in the inbox: the invite email shows first, then closes before the folio opens", () => {
    const kinds = interactions.map((i) => i.kind);
    expect(kinds[0]).toBe("emailview");
    const emails = interactions.flatMap((i) => (i.kind === "emailview" ? [i.view] : []));
    expect(emails[0]?.sceneLabel).toContain("Millers");
    expect(emails[0]?.body).toContain("voygent.app/t/dublin");
    expect(kinds.indexOf("folioview")).toBeGreaterThan(kinds.lastIndexOf("emailview"));
    expect(emails.at(-1)).toBeNull();
  });

  it("pins the advisor's note on every open folio snapshot", () => {
    expect(views.length).toBeGreaterThanOrEqual(10);
    expect(views.every((v) => !!v.advisorNote)).toBe(true);
  });

  it("reprices the trip as the hotel choice flips (3920 → 5096 → 4879 → 5096)", () => {
    const totals = views.map((v) => computeTripTotal(v));
    expect(totals[0]).toBe(3180 + 740);                 // nothing picked
    const dean = totals.indexOf(3920 + 1176);           // Dean picked
    expect(dean).toBeGreaterThan(0);
    expect(totals.slice(dean)).toContain(3920 + 959);   // flipped to Beckett Locke
    const picks = views.map((v) => v.pickedHotelId);
    expect(picks).toContain("serp:h2");
    expect(picks.at(-1)).toBe("serp:h1");               // settled back on The Dean
  });

  it("drills into the Kilmainham tour page before adding it (link → details → CTA → price)", () => {
    const detailIdx = views.findIndex((v) => v.openDetailId === "tour:kilmainham");
    expect(detailIdx).toBeGreaterThan(0);
    expect(views[detailIdx].url).toContain("/tours/");
    expect(views[detailIdx].addons.find((a) => a.id === "tour:kilmainham")?.detail?.blurb).toBeTruthy();
    expect(views.slice(detailIdx).some((v) => v.openDetailId && v.focus === "tour-detail-cta")).toBe(true);
    const after = views.slice(detailIdx).find((v) => !v.openDetailId);
    expect(after?.addons.find((a) => a.id === "tour:kilmainham")?.on).toBe(true);
  });

  it("settles the extras: gaol tour + transfers on, whiskey walk tried and dropped", () => {
    const last = views.at(-1)!;
    const on = last.addons.filter((a) => a.on).map((a) => a.id).sort();
    expect(on).toEqual(["tour:kilmainham", "transfers"]);
    expect(computeTripTotal(last)).toBe(3180 + 740 + 1176 + 116 + 120);
  });

  it("lands Julie's note on the last evening (day 6), client-authored", () => {
    const last = views.at(-1)!;
    expect(last.notes).toHaveLength(1);
    expect(last.notes[0].author).toBe("client");
    expect(last.notes[0].anchor).toBe("folio-day-6");
    expect(last.notes[0].text).toContain("Lisbon");
  });

  it("closes on the send: feedbackSent flips true, then the window closes (end card next)", () => {
    expect(views.at(-2)?.feedbackSent).toBe(false);
    expect(views.at(-1)?.feedbackSent).toBe(true);
    const track = interactions.flatMap((i) => (i.kind === "folioview" ? [i.view] : []));
    expect(track.at(-1)).toBeNull();
  });

  it("resolves every callout, in ascending frame order", () => {
    expect(dublinClient.highlights.length).toBe(8);
    const hits = resolveHighlightFrames(frames, dublinClient.highlights);
    const total = [...hits.values()].reduce((n, hl) => n + hl.length, 0);
    expect(total).toBe(dublinClient.highlights.length);
    const keys = [...hits.keys()];
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });
});
