import { describe, it, expect } from "vitest";
import { usdToMicros, microsToUsd, formatUsd } from "./money";

describe("money", () => {
  it("converts USD to integer micros and back", () => {
    expect(usdToMicros(5)).toBe(5_000_000);
    expect(usdToMicros(0.0123)).toBe(12_300);
    expect(microsToUsd(2_500_000)).toBeCloseTo(2.5, 6);
  });
  it("rounds to the nearest micro (no float drift)", () => {
    expect(Number.isInteger(usdToMicros(0.1 + 0.2))).toBe(true);
  });
  it("formats micros as a dollar string", () => {
    expect(formatUsd(4_100_000)).toBe("$4.10");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
