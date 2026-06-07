import { describe, it, expect } from "vitest";
import { resolveAdvisor, commissionLabel, commissionTotal, fmtUsd } from "./advisor";

describe("resolveAdvisor", () => {
  it("URL param wins over storage", () => {
    expect(resolveAdvisor("1", "0")).toBe(true);
    expect(resolveAdvisor("0", "1")).toBe(false);
    expect(resolveAdvisor("on", null)).toBe(true);
    expect(resolveAdvisor("off", "1")).toBe(false);
  });
  it("falls back to storage, defaults off", () => {
    expect(resolveAdvisor(null, "1")).toBe(true);
    expect(resolveAdvisor(null, "0")).toBe(false);
    expect(resolveAdvisor(null, null)).toBe(false);
    expect(resolveAdvisor("garbage", null)).toBe(false);
  });
});

describe("commission formatting", () => {
  it("formats USD rounded with separators", () => {
    expect(fmtUsd(2436.69)).toBe("$2,437");
    expect(fmtUsd(30)).toBe("$30");
  });
  it("labels with and without pct", () => {
    expect(commissionLabel(2436.69, 30)).toBe("+$2,437 comm (30%)");
    expect(commissionLabel(150)).toBe("+$150 comm");
  });
});

describe("commissionTotal", () => {
  it("sums only items that carry real commission", () => {
    expect(commissionTotal([{ commission: 100 }, {}, { commission: 50.5 }])).toBe(150.5);
  });
  it("returns null when nothing carries commission (render nothing, never $0)", () => {
    expect(commissionTotal([{}, {}])).toBeNull();
    expect(commissionTotal([])).toBeNull();
  });
});
