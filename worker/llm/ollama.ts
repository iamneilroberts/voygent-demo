import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema } from "./provider";
import { parseOpenAiStream, toOpenAiMessages, toOpenAiTools } from "./deepseek";

// Minimal, LOCAL-DEV-ONLY provider. Never reachable from the deployed edge Worker
// (a Worker can't hit your localhost) — its registry entry is available:false, so
// coerceModel never lets it execute in prod. Present so the cross-LLM seam is
// provably N-way (see /info/llm-options). Ollama's /v1/chat/completions endpoint
// is OpenAI-compatible, so it reuses the DeepSeek stream parser/translators.
export class OllamaProvider implements LLMProvider {
  constructor(private baseUrl: string, private model = "llama3.1:8b") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts?.model ?? this.model, stream: true, stream_options: { include_usage: true },
          n: 1, tools: toOpenAiTools(tools), messages: toOpenAiMessages(messages),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      yield* parseOpenAiStream(res.body);  // local: missing-usage is tolerated (no paid ledger)
    } finally { clearTimeout(timeout); }
  }
}
