import { describe, it, expect } from "vitest";
import { dublinCollab } from "./dublin-collab.screenplay";
import { dublinRun } from "./dublin-run.screenplay";
import type { FolioData } from "../../../shared/events";
import type { ReelClientSession } from "../lib/recording";

// Guards the App.tsx ended-phase contract for reels that end on the client session
// (ch1/ch2): App renders ReelFolioView interactive from `folioSessionFromClient(
// clientView, folio)`, which needs BOTH (a) at least one folio ServerEvent so the
// App-level folio state is populated, and (b) a final clientview snapshot. It also pins
// the two hotel fixture shapes (session options vs folio content) against silent drift:
// every folio hotel must appear among the session's options at a reconciling price.
for (const [name, sp] of [["dublinCollab", dublinCollab], ["dublinRun", dublinRun]] as const) {
  describe(`${name} end-state contract`, () => {
    const frames = sp.recording.frames;
    const folios: FolioData[] = frames.flatMap((f) => (f.kind === "event" && f.event.type === "folio" ? [f.event.folio] : []));
    const clientViews: (ReelClientSession | null)[] = frames.flatMap((f) =>
      f.kind === "interaction" && f.interaction.kind === "clientview" ? [f.interaction.view] : []);

    it("emits at least one folio event (App's ended branch requires populated folio state)", () => {
      expect(folios.length).toBeGreaterThan(0);
    });

    it("ends its clientview track with a session snapshot (not a bare close)", () => {
      expect(clientViews.length).toBeGreaterThan(0);
      expect(clientViews[clientViews.length - 1]).toBeTruthy();
    });

    // C9 cutaways open ReelFolioView mid-chapter; App's ended branch PREFERS folioView
    // over clientView, so a cutaway left open would hijack the end-state. Every ch1/ch2
    // folioview track must exist (C9 grounding) and end with an explicit close (null).
    it("has a folioview cutaway and ends its track closed (null), so ended derives from clientView", () => {
      const folioViews = frames.flatMap((f) =>
        f.kind === "interaction" && f.interaction.kind === "folioview" ? [f.interaction.view] : []);
      expect(folioViews.length).toBeGreaterThan(0);
      expect(folioViews[folioViews.length - 1]).toBeNull();
    });

    it("keeps folio hotels reconciled with the session's hotel options (name + nights×rate)", () => {
      const lastFolio = folios[folios.length - 1];
      const lastView = clientViews[clientViews.length - 1]!;
      for (const h of lastFolio.hotels) {
        const opt = lastView.hotels.find((o) => o.name === h.name);
        expect(opt, `folio hotel "${h.name}" missing from session options`).toBeTruthy();
        if (h.perNight && typeof h.nights === "number") {
          const perNight = Number(h.perNight.replace(/[$,]/g, ""));
          expect(opt!.price, `price drift for "${h.name}"`).toBe(perNight * h.nights);
        }
      }
    });
  });
}
