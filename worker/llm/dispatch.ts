import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema } from "./provider";

// One LLMProvider that picks a concrete provider PER CALL from opts.model. The
// agent loop already resolves a per-turn model (loop.ts nextModel) and passes it
// as opts.model; this makes per-turn provider selection require NO loop change.
// `resolve` is injected (the worker passes providerFor bound to env) so this stays
// env-free and unit-testable.
export class DispatchProvider implements LLMProvider {
  constructor(private resolve: (modelId: string) => LLMProvider, private defaultModel: string) {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const modelId = opts?.model || this.defaultModel;
    const concrete = this.resolve(modelId);
    // Always pass the resolved model downstream so the concrete provider sends the right id.
    yield* concrete.stream(messages, tools, { model: modelId });
  }
}
