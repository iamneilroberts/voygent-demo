import { describe, it, expect } from "vitest";
import { dublinCollab, shortlistOptions } from "./dublin-collab.screenplay";
import { resolveHighlightFrames } from "../lib/highlights";
import type { FolioData } from "../../../shared/events";

// Grounding test for chapter 1 · "Plan the trip" (QA4 arc). The screenplay compiler
// validates board/candidate/path refs at import, so importing already fails the build
// on a broken reference; these assertions guard the authored content: advisor-only
// surfaces (no client windows — that's ch2), the gap-fill tour beat, the in-place edit,
// the projected commission, the closing send, and every callout resolving in act order.
describe("dublin-collab chapter 1 (grounding)", () => {
  const frames = dublinCollab.recording.frames;
  const folios = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio") ? [f.event.folio as FolioData] : []);
  const interactions = frames.flatMap((f) => (f.kind === "interaction") ? [f.interaction] : []);
  const kinds = interactions.map((i) => i.kind);

  it("is advisor-only: picks, an edit, a comment, the eng peek and the send — no client windows", () => {
    expect(new Set(kinds)).toEqual(new Set(["pick", "edit", "comment", "handoff", "engpanel"]));
  });

  it("ends on the send (the handoff is the last interaction)", () => {
    expect(kinds.at(-1)).toBe("handoff");
  });

  it("opens with the orientation callout on the navigation cluster (frame 0)", () => {
    const first = dublinCollab.highlights[0];
    expect(first.target).toBe("reel-controls");
    const resolved = resolveHighlightFrames(frames, [first]);
    expect(resolved.has(0)).toBe(true);
  });

  it("has the flight pick, a 3-hotel shortlist, the tour pick and the includes pick", () => {
    const picks = interactions.filter((i) => i.kind === "pick") as Array<{ boardId: string; candidateIds: string[] }>;
    expect(picks.find((p) => p.boardId === "b-flight")?.candidateIds).toHaveLength(1);
    expect(picks.find((p) => p.boardId === "b-hotel")?.candidateIds).toHaveLength(3);
    expect(picks.find((p) => p.boardId === "b-tours")?.candidateIds).toEqual(["tour:cliffs"]);
    expect(picks.find((p) => p.boardId === "b-incl")?.candidateIds).toHaveLength(4);
  });

  it("sells the open day: after the tour pick, day 3 carries the Cliffs day trip", () => {
    const withCliffs = folios.filter((f) => f.days?.[2].activities.some((a) => a.name.includes("Cliffs of Moher")));
    expect(withCliffs.length).toBeGreaterThan(0);
  });

  it("the advisor edit swaps day 4 to the step-free walk and it sticks", () => {
    const idx = folios.findIndex((f) => f.days?.[3].activities[0].name === "Howth village & harbour stroll");
    expect(idx).toBeGreaterThan(0);
    expect(folios.slice(idx).every((f) => f.days?.[3].activities[0].name === "Howth village & harbour stroll")).toBe(true);
  });

  it("commits no hotel in this chapter (the travellers choose in ch2)", () => {
    expect(folios.every((f) => f.hotels.length === 0)).toBe(true);
  });

  it("never drops the flight once present (no folio flicker)", () => {
    const firstFlight = folios.findIndex((f) => f.flights.length > 0);
    expect(firstFlight).toBeGreaterThanOrEqual(0);
    expect(folios.slice(firstFlight).every((f) => f.flights.length > 0)).toBe(true);
  });

  it("closes on the PROJECTED commission, itemized and reconciling to $219", () => {
    const last = folios.at(-1)!;
    expect(last.commissionsKind).toBe("projected");
    const rows = last.commissions ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const projected = rows.filter((r) => !r.potential).reduce((n, r) => n + r.amount, 0);
    expect(projected).toBe(219); // Dean 176 + Cliffs 43
    expect(rows.some((r) => r.potential)).toBe(true); // untaken extras still listed
  });

  it("the eng peek carries representative telemetry (cost, tokens, cache)", () => {
    const panels = interactions.flatMap((i) => (i.kind === "engpanel" && i.view ? [i.view] : []));
    expect(panels.length).toBeGreaterThan(0);
    const metrics = panels[0].metrics ?? [];
    expect(metrics.some((m) => m.label.toLowerCase().includes("cost"))).toBe(true);
    expect(metrics.some((m) => m.label.toLowerCase().includes("cache"))).toBe(true);
    expect(panels[0].footnote).toMatch(/representative/i);
  });

  it("exports the shortlist options reconciled with the hotel board (per-night × 7)", () => {
    expect(shortlistOptions.map((o) => o.price)).toEqual([168 * 7, 137 * 7, 159 * 7]);
  });

  it("resolves all callouts, in ascending frame order", () => {
    expect(dublinCollab.highlights.length).toBe(11);
    const resolved = resolveHighlightFrames(frames, dublinCollab.highlights);
    const total = [...resolved.values()].reduce((n, hs) => n + hs.length, 0);
    expect(total).toBe(11);
    const idxs = [...resolved.keys()];
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b));
  });

  it("binds the commission callout to the folio frame that actually carries commissions", () => {
    const hl = dublinCollab.highlights.find((h) => h.target === "trip-commission")!;
    const resolved = resolveHighlightFrames(frames, [hl]);
    const [idx] = [...resolved.keys()];
    const frame = frames[idx];
    expect(frame.kind === "event" && frame.event.type === "folio" && (frame.event.folio.commissions?.length ?? 0) > 0).toBe(true);
  });
});
