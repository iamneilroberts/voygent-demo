import { describe, it, expect } from "vitest";
import { storeOpsForTool } from "./storeops";

describe("storeOpsForTool", () => {
  it("maps save_trip to a KV put + a D1 index upsert", () => {
    const ops = storeOpsForTool("save_trip");
    expect(ops).toContainEqual({ store: "KV", op: "put", note: "write the trip blob" });
    expect(ops.some((o) => o.store === "D1" && o.op === "query")).toBe(true);
  });
  it("maps read_trip to a single KV get", () => {
    expect(storeOpsForTool("read_trip")).toEqual([{ store: "KV", op: "get", note: "read the trip blob" }]);
  });
  it("maps patch_trip to a KV read-modify-write", () => {
    const ops = storeOpsForTool("patch_trip");
    expect(ops).toEqual([
      { store: "KV", op: "get", note: "load current trip blob" },
      { store: "KV", op: "put", note: "write the patched trip blob" },
    ]);
  });
  it("maps find_trips to a D1 query", () => {
    expect(storeOpsForTool("find_trips")).toEqual([{ store: "D1", op: "query", note: "query the trip index" }]);
  });
  it("returns no ops for a pure search tool (no trip-state write)", () => {
    expect(storeOpsForTool("flight_search")).toEqual([]);
  });
});
