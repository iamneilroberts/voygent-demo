import { describe, it, expect } from "vitest";
import { runAgentLoop } from "./loop";
import type { ProviderEvent, LLMProvider, ConversationMessage, AssistantMessage } from "../llm/provider";
import type { ServerEvent } from "../../shared/events";

function fakeProvider(turns: ProviderEvent[][]): LLMProvider {
  let i = 0;
  return {
    async *stream(): AsyncIterable<ProviderEvent> { for (const e of turns[i++]) yield e; },
  };
}

describe("runAgentLoop", () => {
  it("streams text then completes when no tools are called", async () => {
    const asst: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Hello!" }] };
    const provider = fakeProvider([[{ type: "text-delta", delta: "Hello!" }, { type: "turn-complete", assistant: asst }]]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "hi" }] as ConversationMessage[],
      callTool: async () => "unused",
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    expect(out.filter((e) => e.type !== "inspector").map((e) => e.type)).toEqual(["text", "turn-complete"]);
    expect(out.some((e) => e.type === "inspector" && (e as any).kind === "turn")).toBe(true);
  });

  it("executes a tool call, feeds the result back, then completes", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu1", name: "flight_search", input: { trip_id: "t1" } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Done." }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tu1", name: "flight_search", input: { trip_id: "t1" } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "Done." }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    let folioCalls = 0;
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "find flights" }] as ConversationMessage[],
      callTool: async (name) => `result of ${name}`,
      onFolio: async () => { folioCalls++; },
      emit: (e) => out.push(e),
    });
    const types = out.map((e) => e.type);
    expect(types).toContain("tool");           // tool start + done emitted
    expect(types[types.length - 1]).toBe("turn-complete");
    expect(folioCalls).toBe(1);                // flight_search w/ trip_id triggered a folio refresh
  });

  it("completes the turn even when onFolio throws, still feeding tool results", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu2", name: "flight_search", input: { trip_id: "t2" } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Done despite error." }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tu2", name: "flight_search", input: { trip_id: "t2" } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "Done despite error." }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "find flights" }] as ConversationMessage[],
      callTool: async (name) => `result of ${name}`,
      onFolio: async () => { throw new Error("read_trip 503"); },
      emit: (e) => out.push(e),
    });
    const types = out.map((e) => e.type);
    expect(types[types.length - 1]).toBe("turn-complete");
    expect(types).toContain("tool");   // tool event was emitted — throw did NOT abort the turn
  });

  it("emits an inspector tool event with scrubbed args, ok flag, and numeric latency", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu9", name: "flight_search", input: { trip_id: "t9", markupPct: 5 } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "ok" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tu9", name: "flight_search", input: { trip_id: "t9", markupPct: 5 } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "ok" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [], exchangeId: "EX1",
      messages: [{ role: "user", content: "go" }] as ConversationMessage[],
      callTool: async (name) => `result of ${name}`,
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    const tool = out.find((e) => e.type === "inspector" && (e as any).kind === "tool") as any;
    expect(tool).toBeTruthy();
    expect(tool.name).toBe("flight_search");
    expect(tool.args).toEqual({ trip_id: "t9" });
    expect(tool.ok).toBe(true);
    expect(typeof tool.latencyMs).toBe("number");
    expect(tool.exchangeId).toBe("EX1");
  });

  it("emits a board event after the tool done event when buildBoard returns one", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tuB", name: "flight_search", input: { trip_id: "tB" } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "Pick one!" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tuB", name: "flight_search", input: { trip_id: "tB" } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "Pick one!" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "find flights" }] as ConversationMessage[],
      callTool: async () => JSON.stringify({ status: "ok", candidates: [{ id: "serp:x" }] }),
      onFolio: async () => {},
      buildBoard: (name) => name === "flight_search"
        ? { type: "board", kind: "flight", boardId: "b1", tripId: "tB", candidates: [{ id: "serp:x", title: "X", summary: "X" }] }
        : null,
      emit: (e) => out.push(e),
    });
    const types = out.map((e) => e.type);
    const doneIdx = out.findIndex((e) => e.type === "tool" && (e as any).phase === "done");
    const boardIdx = types.indexOf("board");
    expect(boardIdx).toBeGreaterThan(doneIdx);
    expect((out[boardIdx] as any).candidates[0].id).toBe("serp:x");
  });

  it("emits no board events when buildBoard is absent (default path unchanged)", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tuN", name: "flight_search", input: { trip_id: "tN" } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "done" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tuN", name: "flight_search", input: { trip_id: "tN" } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "done" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "find flights" }] as ConversationMessage[],
      callTool: async () => JSON.stringify({ status: "ok", candidates: [{ id: "serp:x" }] }),
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    expect(out.some((e) => e.type === "board")).toBe(false);
  });

  it("does not call buildBoard for a failed tool call", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant", content: [{ type: "tool_use", id: "tuF", name: "flight_search", input: {} }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "x" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tuF", name: "flight_search", input: {} }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "x" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    let buildCalls = 0;
    await runAgentLoop({
      provider, tools: [],
      messages: [{ role: "user", content: "go" }] as ConversationMessage[],
      callTool: async () => { throw new Error("boom"); },
      onFolio: async () => {},
      buildBoard: () => { buildCalls++; return null; },
      emit: (e) => out.push(e),
    });
    expect(buildCalls).toBe(0);
    expect(out.some((e) => e.type === "board")).toBe(false);
  });

  it("marks ok=false when a tool throws", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant", content: [{ type: "tool_use", id: "tuE", name: "hotel_search", input: {} }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "x" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tuE", name: "hotel_search", input: {} }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "x" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [], exchangeId: "EX2",
      messages: [{ role: "user", content: "go" }] as ConversationMessage[],
      callTool: async () => { throw new Error("boom"); },
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    const tool = out.find((e) => e.type === "inspector" && (e as any).kind === "tool") as any;
    expect(tool.ok).toBe(false);
    expect(tool.result).toContain("boom");
  });
});
