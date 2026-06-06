import { describe, it, expect } from "vitest";
import { splitFlapCells } from "./split-flap";

describe("splitFlapCells", () => {
  it("returns one cell per character", () => {
    expect(splitFlapCells("CDG")).toEqual(["C", "D", "G"]);
  });
  it("preserves spaces as their own cells", () => {
    expect(splitFlapCells("A B")).toEqual(["A", " ", "B"]);
  });
  it("treats a multi-byte arrow as a single cell", () => {
    expect(splitFlapCells("JFK→CUN")).toHaveLength(7);
  });
  it("returns an empty array for an empty string", () => {
    expect(splitFlapCells("")).toEqual([]);
  });
});
