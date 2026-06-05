import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema, AssistantMessage } from "./provider";

export async function* parseAnthropicStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const blocks: Record<number, { type: string; id?: string; name?: string; text: string; json: string }> = {};

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
      if (ev.type === "content_block_start") {
        blocks[ev.index] = { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, text: "", json: "" };
      } else if (ev.type === "content_block_delta") {
        const b = blocks[ev.index];
        if (ev.delta.type === "text_delta") { b.text += ev.delta.text; yield { type: "text-delta", delta: ev.delta.text }; }
        else if (ev.delta.type === "input_json_delta") { b.json += ev.delta.partial_json; }
      } else if (ev.type === "message_stop") {
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
        yield { type: "turn-complete", assistant: { role: "assistant", content } };
      }
    }
  }
}

export class ClaudeProvider implements LLMProvider {
  constructor(private apiKey: string, private model = "claude-sonnet-4-6") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[]): AsyncIterable<ProviderEvent> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model, max_tokens: 4096, stream: true,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        messages,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    yield* parseAnthropicStream(res.body);
  }
}
