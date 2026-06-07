import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema, AssistantMessage, TokenUsage } from "./provider";

export async function* parseAnthropicStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let completed = false;
  const blocks: Record<number, { type: string; id?: string; name?: string; text: string; json: string }> = {};
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  let sawUsage = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const ev = JSON.parse(dataLine.slice(5).trim());
      if (ev.type === "message_start" && ev.message?.usage) {
        const u = ev.message.usage;
        usage.inputTokens = u.input_tokens ?? 0;
        usage.cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
        usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
        usage.outputTokens = u.output_tokens ?? 0;
        sawUsage = true;
      } else if (ev.type === "message_delta" && ev.usage) {
        usage.outputTokens = ev.usage.output_tokens ?? usage.outputTokens;
        sawUsage = true;
      } else if (ev.type === "content_block_start") {
        blocks[ev.index] = { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, text: "", json: "" };
      } else if (ev.type === "content_block_delta") {
        const b = blocks[ev.index];
        if (ev.delta.type === "text_delta") { b.text += ev.delta.text; yield { type: "text-delta", delta: ev.delta.text }; }
        else if (ev.delta.type === "input_json_delta") { b.json += ev.delta.partial_json; }
      } else if (ev.type === "message_stop") {
        if (!completed) {
          completed = true;
          const content: AssistantMessage["content"] = [];
          for (const idx of Object.keys(blocks).map(Number).sort((a, b) => a - b)) {
            const b = blocks[idx];
            if (b.type === "text") content.push({ type: "text", text: b.text });
            else if (b.type === "tool_use") {
              const input = b.json ? JSON.parse(b.json) : {};
              content.push({ type: "tool_use", id: b.id!, name: b.name!, input });
              yield { type: "tool-call", id: b.id!, name: b.name!, input };
            }
          }
          if (sawUsage) yield { type: "usage", usage };
          yield { type: "turn-complete", assistant: { role: "assistant", content } };
        }
      }
    }
  }
  // EOF fallback: if the stream ended without a message_stop frame, finalize what we have
  if (!completed && Object.keys(blocks).length > 0) {
    completed = true;
    const content: AssistantMessage["content"] = [];
    for (const idx of Object.keys(blocks).map(Number).sort((a, b) => a - b)) {
      const b = blocks[idx];
      if (b.type === "text") content.push({ type: "text", text: b.text });
      else if (b.type === "tool_use") {
        const input = b.json ? JSON.parse(b.json) : {};
        content.push({ type: "tool_use", id: b.id!, name: b.name!, input });
        yield { type: "tool-call", id: b.id!, name: b.name!, input };
      }
    }
    if (sawUsage) yield { type: "usage", usage };
    yield { type: "turn-complete", assistant: { role: "assistant", content } };
  }
}

const EPHEMERAL = { type: "ephemeral" as const };

// Cache the expensive prefixes so the agent loop's later turns read them at
// ~0.1x instead of re-billing full price every turn:
//  1. the tools block (cache_control on the last tool caches the whole array)
//  2. the first user message (our long, static SYSTEM_HINT)
//  3. a MOVING breakpoint on the final message of each request, so the whole
//     growing conversation is cached for the next provider call (3 breakpoints
//     total — under the API's limit of 4). Without #3, every agent-loop turn
//     re-billed the full conversation as fresh input.
function withToolCache(tools: ToolSchema[]): unknown[] {
  return tools.map((t, i) => ({
    name: t.name, description: t.description, input_schema: t.input_schema,
    ...(i === tools.length - 1 ? { cache_control: EPHEMERAL } : {}),
  }));
}
function withMessageCache(messages: ConversationMessage[]): unknown[] {
  const last = messages.length - 1;
  return messages.map((m, i) => {
    if (i === 0 && m.role === "user" && typeof m.content === "string") {
      return { role: "user", content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }] };
    }
    if (i === last && i > 0) {
      // moving breakpoint: tag the final content block so the whole prefix caches
      if (typeof m.content === "string") {
        return { role: m.role, content: [{ type: "text", text: m.content, cache_control: EPHEMERAL }] };
      }
      const blocks = m.content.map((b, j) => (j === m.content.length - 1 ? { ...b, cache_control: EPHEMERAL } : b));
      return { ...m, content: blocks };
    }
    return m;
  });
}

export class ClaudeProvider implements LLMProvider {
  constructor(private apiKey: string, private model = "claude-sonnet-4-6") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts?.model ?? this.model, max_tokens: 4096, stream: true,
        tools: withToolCache(tools),
        messages: withMessageCache(messages),
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    yield* parseAnthropicStream(res.body);
  }
}
