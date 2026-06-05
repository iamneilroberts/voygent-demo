import type { LLMProvider, ToolSchema, ConversationMessage, TokenUsage } from "../llm/provider";
import type { ServerEvent } from "../../shared/events";
import { isTripMutating } from "./folio-sync";

export interface AgentLoopArgs {
  provider: LLMProvider;
  tools: ToolSchema[];
  messages: ConversationMessage[];           // mutated in place as the turn progresses
  callTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  onFolio: (lastTool: string, input: Record<string, unknown>) => Promise<void>;
  emit: (ev: ServerEvent) => void;
  onUsage?: (usage: TokenUsage) => void;     // server-side cost telemetry (NOT sent to the client)
  maxTurns?: number;
  maxToolCalls?: number;
}

export async function runAgentLoop(args: AgentLoopArgs): Promise<void> {
  const { provider, tools, messages, callTool, onFolio, emit } = args;
  const maxTurns = args.maxTurns ?? 12;
  const maxToolCalls = args.maxToolCalls ?? 24;
  let totalToolCalls = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pendingTools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for await (const ev of provider.stream(messages, tools)) {
      if (ev.type === "text-delta") {
        emit({ type: "text", delta: ev.delta });
      } else if (ev.type === "tool-call") {
        pendingTools.push({ id: ev.id, name: ev.name, input: ev.input });
      } else if (ev.type === "usage") {
        args.onUsage?.(ev.usage);
      } else if (ev.type === "turn-complete") {
        messages.push(ev.assistant);
      }
    }

    if (pendingTools.length === 0) { emit({ type: "turn-complete" }); return; }

    const results: { role: "user"; content: Array<{ type: "tool_result"; tool_use_id: string; content: string }> } = {
      role: "user", content: [],
    };
    for (const t of pendingTools) {
      emit({ type: "tool", tool: t.name, phase: "start" });
      let content: string;
      try { content = await callTool(t.name, t.input); }
      catch (e) { content = `ERROR: ${(e as Error).message}`; }
      emit({ type: "tool", tool: t.name, phase: "done", summary: content.slice(0, 120) });
      results.content.push({ type: "tool_result", tool_use_id: t.id, content });
      if (isTripMutating(t.name, t.input)) {
        try { await onFolio(t.name, t.input); }
        catch { /* folio refresh is best-effort; a failed refresh must never abort the turn */ }
      }
    }
    messages.push(results);
    totalToolCalls += pendingTools.length;
    if (totalToolCalls >= maxToolCalls) { emit({ type: "turn-complete" }); return; }
  }
  emit({ type: "turn-complete" });
}
