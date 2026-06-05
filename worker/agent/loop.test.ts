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
    expect(out.map((e) => e.type)).toEqual(["text", "turn-complete"]);
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
});
