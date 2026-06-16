import { describe, it, expect } from "vitest";
import { parseBuildLog, type RawEntry } from "./buildlog";

describe("parseBuildLog", () => {
  it("keeps well-formed entries and sorts newest first", () => {
    const raw: RawEntry[] = [
      { date: "2026-06-10", text: "older" },
      { date: "2026-06-16", text: "newer" },
    ];
    const out = parseBuildLog(raw);
    expect(out.map((e) => e.text)).toEqual(["newer", "older"]);
  });

  it("drops malformed entries (bad date, empty text, missing fields)", () => {
    const raw = [
      { date: "2026-06-16", text: "good" },
      { date: "not-a-date", text: "bad date" },
      { date: "2026-01-01", text: "   " },
      { date: "2026-02-02" },
      { text: "no date" },
      null,
      "garbage",
    ] as unknown as RawEntry[];
    const out = parseBuildLog(raw);
    expect(out.map((e) => e.text)).toEqual(["good"]);
  });

  it("returns [] for non-array input", () => {
    expect(parseBuildLog(undefined as unknown as RawEntry[])).toEqual([]);
  });
});
