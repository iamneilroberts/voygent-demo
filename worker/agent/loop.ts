import type { LLMProvider, ToolSchema, ConversationMessage } from "../llm/provider";
import type { ServerEvent } from "../../shared/events";
import { isTripMutating } from "./folio-sync";

export interface AgentLoopArgs {
  provider: LLMProvider;
  tools: ToolSchema[];
  messages: ConversationMessage[];           // mutated in place as the turn progresses
  callTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  onFolio: (lastTool: string, input: Record<string, unknown>) => Promise<void>;
  emit: (ev: ServerEvent) => void;
  maxTurns?: number;
}

export async function runAgentLoop(args: AgentLoopArgs): Promise<void> {
  const { provider, tools, messages, callTool, onFolio, emit } = args;
  const maxTurns = args.maxTurns ?? 12;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pendingTools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for await (const ev of provider.stream(messages, tools)) {
      if (ev.type === "text-delta") {
        emit({ type: "text", delta: ev.delta });
      } else if (ev.type === "tool-call") {
        pendingTools.push({ id: ev.id, name: ev.name, input: ev.input });
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
      if (isTripMutating(t.name, t.input)) await onFolio(t.name, t.input);
    }
    messages.push(results);
  }
  emit({ type: "turn-complete" });
}
