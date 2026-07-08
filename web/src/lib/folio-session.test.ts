import { describe, it, expect } from "vitest";
import { folioSessionFromClient } from "./folio-session";
import { computeTripTotal } from "./reel-pricing";
import type { ReelClientSession } from "./recording";
import type { FolioData } from "../../../shared/events";

// End-of-reel bridge: ch1/ch2's ReelClientSession + the canonical chat folio become a
// ReelFolioSession so the ended phase renders the full folio surface (ReelExplore retired).
const client: ReelClientSession = {
  open: false, // ch2 ends with the window closed — the adapter must reopen it
  url: "voygent.app/t/dublin",
  tripTitle: "A week in Dublin · for two",
  flightsPrice: 3180,
  activitiesPrice: 740,
  hotels: [
    { id: "serp:h1", name: "The Dean Dublin", price: 168 * 7 },
    { id: "serp:h2", name: "Beckett Locke", price: 137 * 7 },
  ],
  pickedHotelId: "serp:h1",
  addons: [{ id: "transfers", label: "Private airport transfers", price: 120, on: true }],
  question: "Can we do the whiskey walk the same night?",
  progress: 1,
};
const folio: FolioData = { tripId: "dublin", title: "A week in Dublin", flights: [], hotels: [] };

describe("folioSessionFromClient", () => {
  const s = folioSessionFromClient(client, folio);
  it("carries the pricing state verbatim and the folio as content", () => {
    expect(s.hotels).toBe(client.hotels);
    expect(s.pickedHotelId).toBe("serp:h1");
    expect(s.addons).toBe(client.addons);
    expect(s.flightsPrice).toBe(3180);
    expect(s.activitiesPrice).toBe(740);
    expect(s.folio).toBe(folio);
    expect(s.url).toBe(client.url);
  });
  it("opens the window as a draft with no scripted state", () => {
    expect(s.open).toBe(true);
    expect(s.status).toBe("draft");
    expect(s.notes).toEqual([]);
    expect(s.advisorUpdating).toBe(false);
    expect(s.focus).toBeNull();
    expect(s.expandedDay).toBeNull();
  });
  it("preserves the trip total exactly (end-state price parity with ReelExplore)", () => {
    expect(computeTripTotal(s)).toBe(computeTripTotal(client));
  });
});
