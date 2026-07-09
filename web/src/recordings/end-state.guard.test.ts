import { describe, it, expect } from "vitest";
import { dublinCollab } from "./dublin-collab.screenplay";
import { dublinRun } from "./dublin-run.screenplay";
import { dublinClient } from "./dublin-client.screenplay";

// Guards the App.tsx ended-phase contract (QA4 arc): every chapter ends on the
// ReelEndCard interstitial, so EVERY overlay track a chapter opens (folioview,
// clientview, engpanel, emailview) must end CLOSED (null / open:false). A track left
// open would hijack the ended surface (App prefers an open folioView/clientView) or
// leave a stale window over the end card.
const CHAPTER_PLAYS = [
  ["dublinCollab (ch1 plan)", dublinCollab],
  ["dublinClient (ch2 client)", dublinClient],
  ["dublinRun (ch3 advisor)", dublinRun],
] as const;

for (const [name, sp] of CHAPTER_PLAYS) {
  describe(`${name} end-state contract`, () => {
    const frames = sp.recording.frames;
    const interactions = frames.flatMap((f) => (f.kind === "interaction" ? [f.interaction] : []));

    it("every overlay track it opens is closed by the end", () => {
      for (const kind of ["folioview", "clientview", "engpanel", "emailview"] as const) {
        const track = interactions.filter((i) => i.kind === kind).map((i) => (i as { view: unknown }).view);
        if (track.length === 0) continue;
        const last = track.at(-1) as { open?: boolean } | null;
        expect(last == null || last.open === false, `${kind} track ends open`).toBe(true);
      }
    });

    it("ends with no open folio/client window (the end card owns the ended phase)", () => {
      // Replay the view-state track: last snapshot per overlay kind.
      const lastOf = (kind: string) => {
        const t = interactions.filter((i) => i.kind === kind);
        return t.length ? (t.at(-1) as { view: unknown }).view : null;
      };
      expect(lastOf("folioview")).toBeNull();
      expect(lastOf("clientview")).toBeNull();
    });
  });
}

describe("chapter 1 populates the chat folio (its end card follows a full advisor folio)", () => {
  it("emits folio events and the last one carries the itemized commission", () => {
    const folios = dublinCollab.recording.frames.flatMap((f) =>
      f.kind === "event" && f.event.type === "folio" ? [f.event.folio] : []);
    expect(folios.length).toBeGreaterThan(0);
    expect(folios.at(-1)!.commissions?.length ?? 0).toBeGreaterThan(0);
  });
});
