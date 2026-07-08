import { describe, it, expect } from "vitest";
import { segmentsToLegs } from "./legs";

describe("segmentsToLegs", () => {
  it("maps a real prod-captured segments array to formatted FlightLeg objects", () => {
    // Real shape (verbatim from worker/fixtures/dublin-oct.json flights[0].segments).
    const segments = [
      {
        origin: "MOB", destination: "IAD",
        depart: "2026-10-12 12:53", arrive: "2026-10-12 16:15",
        carrier: "United", flightNumber: "UA 4314",
        cabin: "Economy", durationMinutes: 142,
        layover: null, equipment: "Embraer ERJ-135/145",
      },
      {
        origin: "IAD", destination: "DUB",
        depart: "2026-10-12 19:05", arrive: "2026-10-13 07:20",
        carrier: "United", flightNumber: "UA 310",
        cabin: "Economy", durationMinutes: 435,
        layover: "2h 50m", equipment: "Boeing 757", overnight: true,
      },
    ];
    const legs = segmentsToLegs(segments);
    expect(legs).toBeDefined();
    expect(legs).toHaveLength(2);
    expect(legs![0]).toMatchObject({
      from: "MOB", to: "IAD",
      depart: "Oct 12, 12:53p", arrive: "Oct 12, 4:15p",
      carrier: "United", flightNo: "UA 4314",
      aircraft: "Embraer ERJ-135/145", duration: "2h 22m",
    });
    expect(legs![0].layoverAfter).toBeUndefined();
    expect(legs![1]).toMatchObject({
      from: "IAD", to: "DUB", layoverAfter: "2h 50m", carrier: "United",
    });
  });

  it("returns undefined for missing or empty segments", () => {
    expect(segmentsToLegs(undefined)).toBeUndefined();
    expect(segmentsToLegs(null)).toBeUndefined();
    expect(segmentsToLegs([])).toBeUndefined();
  });

  it("drops non-object entries and returns undefined if nothing usable remains", () => {
    expect(segmentsToLegs([null as any, undefined as any])).toBeUndefined();
  });
});
