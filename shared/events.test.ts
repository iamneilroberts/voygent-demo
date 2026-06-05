import { describe, it, expect } from "vitest";
import { encodeSse, type ServerEvent } from "./events";

describe("encodeSse", () => {
  it("encodes a text event as one SSE frame", () => {
    const ev: ServerEvent = { type: "text", delta: "Hello" };
    expect(encodeSse(ev)).toBe(`data: ${JSON.stringify(ev)}\n\n`);
  });
  it("encodes a folio event carrying FolioData", () => {
    const ev: ServerEvent = { type: "folio", folio: { tripId: "t1", title: "Cancún", flights: [], hotels: [] } };
    expect(encodeSse(ev)).toContain('"type":"folio"');
  });
});
