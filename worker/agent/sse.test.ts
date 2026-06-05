import { describe, it, expect } from "vitest";
import { SseMultiplexer } from "./sse";
import type { ServerEvent } from "../../shared/events";

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) { const { value, done } = await reader.read(); if (done) break; out += dec.decode(value); }
  return out;
}

describe("SseMultiplexer", () => {
  it("writes events as SSE frames in order and closes", async () => {
    const mux = new SseMultiplexer();
    const events: ServerEvent[] = [{ type: "text", delta: "Hi" }, { type: "turn-complete" }];
    (async () => { for (const e of events) mux.send(e); mux.close(); })();
    const out = await drain(mux.readable);
    expect(out).toBe(`data: ${JSON.stringify(events[0])}\n\ndata: ${JSON.stringify(events[1])}\n\n`);
  });

  it("close() is idempotent (double close does not throw)", () => {
    const mux = new SseMultiplexer();
    mux.close();
    expect(() => mux.close()).not.toThrow();
  });

  it("send() after close returns false and does not throw", () => {
    const mux = new SseMultiplexer();
    mux.close();
    expect(mux.send({ type: "turn-complete" })).toBe(false);
  });
});
