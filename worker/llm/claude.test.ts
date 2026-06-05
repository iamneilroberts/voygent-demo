import { describe, it, expect } from "vitest";
import { parseAnthropicStream } from "./claude";
import type { ProviderEvent } from "./provider";

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close(); } });
}

describe("parseAnthropicStream", () => {
  it("turns text deltas + a tool_use block into ProviderEvents", async () => {
    const frames = [
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } })}\n\n`,
      `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu1", name: "flight_search", input: {} } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"trip_id":"t1"}' } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ];
    const events: ProviderEvent[] = [];
    for await (const e of parseAnthropicStream(sseStream(frames))) events.push(e);
    expect(events.find((e) => e.type === "text-delta")).toEqual({ type: "text-delta", delta: "Hi" });
    const call = events.find((e) => e.type === "tool-call") as any;
    expect(call.name).toBe("flight_search");
    expect(call.input).toEqual({ trip_id: "t1" });
    expect(events[events.length - 1].type).toBe("turn-complete");
  });
});
