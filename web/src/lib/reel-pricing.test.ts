import { describe, it, expect } from "vitest";
import { computeTripTotal, usd, type TripPricing } from "./reel-pricing";
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

// The pricing slice is shared by ReelClientSession (ch1/ch2) and ReelFolioSession (ch3);
// these tests pin the slice shape so both stay assignable.
describe("computeTripTotal over the TripPricing slice", () => {
  const parts: TripPricing = {
    flightsPrice: 3180,
    activitiesPrice: 284,
    hotels: [{ id: "serp:h1", name: "The Dean Dublin", price: 168 * 7 }],
    pickedHotelId: "serp:h1",
    addons: [{ id: "tour:kilmainham", label: "Kilmainham Gaol & Museum tour", price: 58 * 2, on: true }],
  };
  it("sums flights + picked hotel + activities + toggled-on add-ons", () => {
    expect(computeTripTotal(parts)).toBe(4756);
  });
  it("drops toggled-off add-ons and an unpicked hotel", () => {
    expect(computeTripTotal({ ...parts, pickedHotelId: null, addons: [{ ...parts.addons[0], on: false }] })).toBe(3464);
  });
});

describe("computeTripTotal with fixed components", () => {
  it("sums fixed components", () => {
    const v = {
      flightsPrice: 0, activitiesPrice: 0, hotels: [], pickedHotelId: null, addons: [],
      components: [
        { id: "fare", label: "Cruise fare, 2 connecting cabins, 4 guests", price: 3180 },
        { id: "exc", label: "Chankanaab beach day, 4 guests", price: 117 },
      ],
    };
    expect(computeTripTotal(v)).toBe(3297);
  });

  it("components absent means unchanged totals", () => {
    const v = { flightsPrice: 100, activitiesPrice: 0, hotels: [], pickedHotelId: null, addons: [] };
    expect(computeTripTotal(v)).toBe(100);
  });
});

describe("usd", () => {
  it("formats whole dollars with a thousands separator", () => {
    expect(usd(4739)).toBe("$4,739");
    expect(usd(959.4)).toBe("$959");
  });
});
