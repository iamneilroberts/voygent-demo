import { describe, it, expect } from "vitest";
import { computeTripTotal, usd } from "./reel-pricing";
import type { ReelClientSession } from "./recording";

const base: ReelClientSession = {
  open: true, url: "voygent.app/t/dublin", tripTitle: "Dublin",
  flightsPrice: 3180, activitiesPrice: 420,
  hotels: [
    { id: "serp:h1", name: "The Dean", price: 1176 },
    { id: "serp:h2", name: "Beckett Locke", price: 959 },
    { id: "serp:h3", name: "The Mayson", price: 1113 },
  ],
  pickedHotelId: null,
  addons: [
    { id: "ins", label: "Travel insurance", price: 180, on: false },
    { id: "cliffs", label: "Cliffs premium", price: 95, on: false },
  ],
  question: null,
  progress: 0.6,
};

describe("computeTripTotal", () => {
  it("excludes the hotel until one is picked", () => {
    expect(computeTripTotal(base)).toBe(3180 + 420);
  });
  it("adds the chosen hotel's price", () => {
    expect(computeTripTotal({ ...base, pickedHotelId: "serp:h2" })).toBe(3180 + 959 + 420);
  });
  it("re-totals when the client switches hotels", () => {
    expect(computeTripTotal({ ...base, pickedHotelId: "serp:h1" })).toBe(3180 + 1176 + 420);
  });
  it("adds only toggled-on add-ons", () => {
    const v = { ...base, pickedHotelId: "serp:h2", addons: [
      { id: "ins", label: "Travel insurance", price: 180, on: true },
      { id: "cliffs", label: "Cliffs premium", price: 95, on: false },
    ] };
    expect(computeTripTotal(v)).toBe(3180 + 959 + 420 + 180);
  });
});

describe("usd", () => {
  it("formats whole dollars with a thousands separator", () => {
    expect(usd(4739)).toBe("$4,739");
    expect(usd(959.4)).toBe("$959");
  });
});
