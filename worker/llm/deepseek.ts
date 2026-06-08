import type {
  LLMProvider, ProviderEvent, ConversationMessage, ToolSchema, AssistantMessage, TokenUsage,
} from "./provider";

// --- Anthropic-shaped transcript -> OpenAI chat messages ---------------------
// Our canonical conversation uses Anthropic block shapes (tool_use / tool_result
// + a trailing {type:"text"} host-nudge note). OpenAI needs: assistant messages
// carrying tool_calls[], separate role:"tool" results, and any nudge as a LATER
// role:"user" message (R7). One Anthropic user tool_result bundle can fan out to
// several OpenAI messages.
interface OpenAiMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export function toOpenAiMessages(messages: ConversationMessage[]): OpenAiMsg[] {
  const out: OpenAiMsg[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("");
      const calls = m.content.filter((b) => b.type === "tool_use").map((b) => {
        const tu = b as Extract<AssistantMessage["content"][number], { type: "tool_use" }>;
        return { id: tu.id, type: "function" as const, function: { name: tu.name, arguments: JSON.stringify(tu.input) } };
      });
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else if (typeof m.content === "string") {
      // plain user message (role:"user" + string content)
      out.push({ role: "user", content: m.content });
    } else {
      // user tool_result bundle: each tool_result -> role:"tool"; trailing text -> role:"user"
      for (const b of m.content) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
        else if (b.type === "text") out.push({ role: "user", content: b.text });
      }
    }
  }
  return out;
}

export function toOpenAiTools(tools: ToolSchema[]): unknown[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

// --- OpenAI SSE stream -> ProviderEvent --------------------------------------
export async function* parseOpenAiStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const calls: Record<number, { id: string; name: string; args: string }> = {};
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  let sawUsage = false;
  const assistant: AssistantMessage = { role: "assistant", content: [] };
  let textBuf = "";

  const finalize = function* (): Iterable<ProviderEvent> {
    if (textBuf) assistant.content.push({ type: "text", text: textBuf });
    for (const idx of Object.keys(calls).map(Number).sort((a, b) => a - b)) {
      const c = calls[idx];
      let input: Record<string, unknown>;
      try { input = c.args ? JSON.parse(c.args) : {}; }
      catch { throw new Error(`DeepSeek tool_call '${c.name}' returned invalid JSON arguments: ${c.args}`); }
      assistant.content.push({ type: "tool_use", id: c.id, name: c.name, input });
      // tool-call events are emitted at finalize (after finish_reason:"tool_calls"), never partial.
    }
  };

  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const ev = JSON.parse(payload);
      if (ev.usage) {
        usage.inputTokens = ev.usage.prompt_cache_miss_tokens ?? ev.usage.prompt_tokens ?? 0;
        usage.cacheReadTokens = ev.usage.prompt_cache_hit_tokens ?? 0;
        usage.cacheCreationTokens = 0;  // DeepSeek: no cache-write concept (R2)
        usage.outputTokens = ev.usage.completion_tokens ?? 0;
        sawUsage = true;
      }
      const choice = ev.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) { textBuf += delta.content; yield { type: "text-delta", delta: delta.content }; }
      // delta.reasoning_content is intentionally ignored (not streamed into chat).
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = calls[i] ?? (calls[i] = { id: "", name: "", args: "" });
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
        }
      }
      if (choice.finish_reason && !finished) {
        finished = true;
        for (const e of finalize()) yield e;
        for (const b of assistant.content) if (b.type === "tool_use") yield { type: "tool-call", id: b.id, name: b.name, input: b.input };
      }
    }
  }
  if (!finished) { for (const e of finalize()) yield e; for (const b of assistant.content) if (b.type === "tool_use") yield { type: "tool-call", id: b.id, name: b.name, input: b.input }; }
  if (sawUsage) yield { type: "usage", usage };
  yield { type: "turn-complete", assistant };
}

export class DeepSeekProvider implements LLMProvider {
  constructor(private apiKey: string, private baseUrl = "https://api.deepseek.com", private model = "deepseek-chat") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);  // R8: every provider fetch has a timeout
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "authorization": `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: opts?.model ?? this.model,
          stream: true,
          stream_options: { include_usage: true },   // R1: without this DeepSeek streams NO usage → $0 ledger
          max_tokens: 4096,
          n: 1,
          tools: toOpenAiTools(tools),
          messages: toOpenAiMessages(messages),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`);
      let any = false;
      for await (const ev of parseOpenAiStream(res.body)) {
        if (ev.type === "usage") any = true;
        yield ev;
      }
      // R1: a paid provider that returns no usage is an error, never a silent $0.
      if (!any) throw new Error("DeepSeek returned no usage block (stream_options.include_usage missing or upstream omitted it)");
    } finally { clearTimeout(timeout); }
  }
}
