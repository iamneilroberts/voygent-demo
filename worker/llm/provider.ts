// One assistant turn, streamed. Slice 1 has one impl (Claude); the interface
// is the seam the cross-LLM flex plugs into later.
export interface ToolSchema { name: string; description?: string; input_schema: unknown; }

export interface AssistantMessage {
  role: "assistant";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
}
export interface UserToolResult {
  role: "user";
  content: Array<
    | { type: "tool_result"; tool_use_id: string; content: string }
    // Harness-injected nudge note (see loop.ts) — rides in the same user bundle
    // after the tool_result blocks; the API accepts mixed blocks.
    | { type: "text"; text: string }
  >;
}
export type ConversationMessage =
  | { role: "user"; content: string }
  | AssistantMessage
  | UserToolResult;

export interface TokenUsage {
  inputTokens: number;        // uncached input
  outputTokens: number;
  cacheCreationTokens: number; // written to cache this turn (billed ~1.25x)
  cacheReadTokens: number;     // read from cache this turn (billed ~0.1x)
}

export type ProviderEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "usage"; usage: TokenUsage }
  | { type: "turn-complete"; assistant: AssistantMessage };

export interface LLMProvider {
  // opts.model overrides the provider's default model for THIS call (per-turn routing).
  stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent>;
}
