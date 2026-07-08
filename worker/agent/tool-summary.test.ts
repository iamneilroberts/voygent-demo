import { describe, it, expect } from "vitest";
import { summarizeToolResult } from "./tool-summary";

describe("summarizeToolResult", () => {
  it("humanizes a patch_trip result instead of slicing raw JSON (the Cancún leak)", () => {
    const raw = JSON.stringify({
      status: "ok", persisted: true, tripId: "demo-9800fb6a",
      updatedFields: ["hotels"],
      consistencyWarnings: [{ type: "stagedWithoutPromote", message: "x" }],
    });
    const s = summarizeToolResult(raw);
    expect(s).toBe("ok · updated hotels · 1 warning");
    expect(s).not.toContain("{");
  });

  it("counts search candidates", () => {
    const raw = JSON.stringify({ candidates: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(summarizeToolResult(raw)).toBe("3 candidates");
  });

  it("passes ERROR: results through (clipped)", () => {
    expect(summarizeToolResult("ERROR: connector_unavailable")).toBe("ERROR: connector_unavailable");
  });

  it("surfaces embedded error fields", () => {
    expect(summarizeToolResult(JSON.stringify({ error: "no results for CUN" })))
      .toBe("error: no results for CUN");
  });

  it("surfaces a structured {ok:false, error:{code,message}} promote failure", () => {
    expect(summarizeToolResult(JSON.stringify({
      ok: false, error: { code: "ambiguous_outbound", message: "Two candidates match; stage one explicitly." },
    }))).toBe("error: ambiguous_outbound — Two candidates match; stage one explicitly.");
  });

  it("surfaces an object-form error with only a message (no code)", () => {
    expect(summarizeToolResult(JSON.stringify({ ok: false, error: { message: "no staged candidates" } })))
      .toBe("error: no staged candidates");
  });

  it("reports ok:false with no error field as a failure, not 'ok · ...'", () => {
    expect(summarizeToolResult(JSON.stringify({ ok: false, tripId: "demo-1" }))).toBe("error: request failed");
  });

  it("clips non-JSON text without mid-token JSON debris", () => {
    const s = summarizeToolResult("Found 4 tours.\nAll bookable.   Extra   whitespace");
    expect(s).toBe("Found 4 tours. All bookable. Extra whitespace");
  });

  it("never exceeds ~140 chars", () => {
    const long = JSON.stringify({ status: "ok", updatedFields: Array.from({ length: 40 }, (_, i) => `field_${i}`) });
    expect(summarizeToolResult(long).length).toBeLessThanOrEqual(140);
  });

  it("falls back to key names for unrecognized objects", () => {
    expect(summarizeToolResult(JSON.stringify({ foo: 1, bar: 2 }))).toBe("ok · foo, bar");
  });

  it("counts bare arrays", () => {
    expect(summarizeToolResult(JSON.stringify([1, 2]))).toBe("2 items");
  });
});
