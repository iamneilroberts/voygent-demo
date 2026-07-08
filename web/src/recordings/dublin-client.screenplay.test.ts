import { describe, it, expect } from "vitest";
import { dublinClient } from "./dublin-client.screenplay";
import { computeTripTotal } from "../lib/reel-pricing";
import { resolveHighlightFrames } from "../lib/highlights";
import type { ReelFolioSession } from "../lib/recording";

const frames = dublinClient.recording.frames;
const views: ReelFolioSession[] = frames.flatMap((f) =>
  f.kind === "interaction" && f.interaction.kind === "folioview" && f.interaction.view ? [f.interaction.view] : []);

describe("dublin-client screenplay (ch3)", () => {
  it("produces frames, folio-window snapshots and highlights", () => {
    expect(frames.length).toBeGreaterThan(10);
    expect(views.length).toBeGreaterThanOrEqual(10);
    expect(dublinClient.highlights.length).toBeGreaterThanOrEqual(5);
  });

  it("stays in the client's window: emits no chat folio events", () => {
    expect(frames.filter((f) => f.kind === "event" && f.event.type === "folio")).toEqual([]);
  });

  it("animates the total as Julie toggles add-ons (4640 → 4756 → 4946 → 4756)", () => {
    const totals = views.map((v) => computeTripTotal(v));
    expect(totals[0]).toBe(4640);
    const idx = totals.indexOf(4756);
    expect(idx).toBeGreaterThan(0);
    expect(totals.slice(idx)).toContain(4946);
    expect(totals[totals.length - 1]).toBe(4756);
  });

  it("lands Julie's note on day 2 and the advisor's reply in the same thread", () => {
    const last = views[views.length - 1];
    expect(last.notes.map((n) => n.author)).toEqual(["client", "advisor"]);
    expect(last.notes.every((n) => n.anchor === "folio-day-2")).toBe(true);
  });

  it("swaps day 2 step-free and settles to Final with the window open (ends on the folio)", () => {
    const last = views[views.length - 1];
    expect(last.status).toBe("final");
    expect(last.open).toBe(true);
    const day2 = last.folio.days![1];
    const names = day2.activities.map((a) => a.name).join(" · ");
    expect(names).not.toContain("EPIC");
    expect(names).toContain("step-free");
  });

  it("keeps the honesty rule in the beat-4 spotlight (scripted rendering, not live)", () => {
    const relay = dublinClient.highlights.find((h) => h.target === "folio-day-2");
    expect(relay?.body).toContain("scripted rendering");
  });

  it("resolves every callout, in ascending frame order", () => {
    const hits = resolveHighlightFrames(frames, dublinClient.highlights);
    const total = [...hits.values()].reduce((n, hl) => n + hl.length, 0);
    expect(total).toBe(dublinClient.highlights.length);
    const keys = [...hits.keys()];
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });
});
