import { describe, it, expect } from "vitest";
import { parseOpenAiStream, toOpenAiMessages } from "./deepseek";
import type { ProviderEvent } from "./provider";

function sse(frames: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close(); } });
}

describe("parseOpenAiStream", () => {
  it("assembles text + a tool call across chunks and reports usage", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "flight_search", arguments: '{"trip' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '_id":"t1"}' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const evs: ProviderEvent[] = [];
    for await (const e of parseOpenAiStream(sse(frames))) evs.push(e);
    expect(evs.find((e) => e.type === "text-delta")).toEqual({ type: "text-delta", delta: "Hi" });
    const call = evs.find((e) => e.type === "tool-call") as any;
    expect(call.name).toBe("flight_search");
    expect(call.input).toEqual({ trip_id: "t1" });
    const usage = evs.find((e) => e.type === "usage") as any;
    expect(usage.usage.cacheReadTokens).toBe(80);
    expect(usage.usage.inputTokens).toBe(20);   // miss tokens = fresh input
    expect(usage.usage.cacheCreationTokens).toBe(0);  // DeepSeek has no write concept
    expect(evs[evs.length - 1].type).toBe("turn-complete");
  });

  it("stops at [DONE] and ignores any frames after it", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" }, finish_reason: "stop" }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, prompt_cache_miss_tokens: 10, prompt_cache_hit_tokens: 0 } })}\n\n`,
      `data: [DONE]\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "AFTER" } }] })}\n\n`, // must be ignored
    ];
    const evs: ProviderEvent[] = [];
    for await (const e of parseOpenAiStream(sse(frames))) evs.push(e);
    const text = evs.filter((e) => e.type === "text-delta").map((e) => (e as any).delta).join("");
    expect(text).toBe("Hi");                              // "AFTER" is never emitted
    expect(evs[evs.length - 1].type).toBe("turn-complete");
  });

  it("throws on invalid final tool-call JSON (never silently {})", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "x", arguments: "{bad" } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    await expect(async () => { for await (const _ of parseOpenAiStream(sse(frames))) { /* drain */ } })
      .rejects.toThrow();
  });
});

describe("toOpenAiMessages", () => {
  it("turns an assistant tool_use + a user tool_result bundle into OpenAI shape, nudge text as a trailing user message", () => {
    const out = toOpenAiMessages([
      { role: "user", content: "plan it" },
      { role: "assistant", content: [{ type: "tool_use", id: "tu1", name: "flight_search", input: { a: 1 } }] },
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "tu1", content: "RESULT" },
        { type: "text", text: "[host reminder] do X" },
      ] },
    ]);
    expect(out[0]).toEqual({ role: "user", content: "plan it" });
    expect(out[1]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "tu1", type: "function", function: { name: "flight_search", arguments: JSON.stringify({ a: 1 }) } }] });
    expect(out[2]).toEqual({ role: "tool", tool_call_id: "tu1", content: "RESULT" });
    expect(out[3]).toEqual({ role: "user", content: "[host reminder] do X" });
  });
});
