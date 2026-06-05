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
  content: Array<{ type: "tool_result"; tool_use_id: string; content: string }>;
}
export type ConversationMessage =
  | { role: "user"; content: string }
  | AssistantMessage
  | UserToolResult;

export type ProviderEvent =
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "turn-complete"; assistant: AssistantMessage };

export interface LLMProvider {
  stream(messages: ConversationMessage[], tools: ToolSchema[]): AsyncIterable<ProviderEvent>;
}
