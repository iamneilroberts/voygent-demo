import type { LLMProvider, ToolSchema, ConversationMessage, TokenUsage } from "../llm/provider";
import type { ServerEvent } from "../../shared/events";
import { isTripMutating } from "./folio-sync";
import { scrubArgs, scrubResultText } from "../inspector";
import { summarizeToolResult } from "./tool-summary";

export interface AgentLoopArgs {
  provider: LLMProvider;
  tools: ToolSchema[];
  messages: ConversationMessage[];           // mutated in place as the turn progresses
  callTool: (name: string, input: Record<string, unknown>) => Promise<string>;
  onFolio: (lastTool: string, input: Record<string, unknown>) => Promise<void>;
  emit: (ev: ServerEvent) => void;
  onUsage?: (usage: TokenUsage, model: string) => void;  // server-side cost telemetry (NOT sent to the client); model = the turn's resolved model
  // Per-turn model routing: resolved BEFORE each provider.stream() (model choice
  // must precede the call). Returns the model id for the upcoming turn; absent →
  // the provider's default model drives every turn.
  nextModel?: () => string;
  // Boards mode (claude skin): map a list-tool result to an inline chooser
  // `board` event, or null. Absent → no board events (default path unchanged).
  buildBoard?: (toolName: string, resultText: string) => ServerEvent | null;
  // Deterministic workflow nudge: called once per tool batch with the batch's
  // tool names; a returned string is appended as a text block AFTER the
  // tool_result blocks (harness-injected reminder, like a host system note).
  // Used to force same-turn enrichment after the hotel promote — prompt-only
  // compliance proved flaky once the full 120-tool catalog landed.
  nudge?: (batch: Array<{ name: string; input: Record<string, unknown> }>) => string | null;
  maxTurns?: number;
  maxToolCalls?: number;
  exchangeId?: string;
}

export async function runAgentLoop(args: AgentLoopArgs): Promise<void> {
  const { provider, tools, messages, callTool, onFolio, emit } = args;
  const exchangeId = args.exchangeId ?? "";
  const maxTurns = args.maxTurns ?? 12;
  const maxToolCalls = args.maxToolCalls ?? 24;
  let totalToolCalls = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pendingTools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const tu: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
    // Resolve the model for THIS turn (phase routing happens before the call).
    const turnModel = args.nextModel?.() ?? "";

    for await (const ev of provider.stream(messages, tools, turnModel ? { model: turnModel } : undefined)) {
      if (ev.type === "text-delta") {
        emit({ type: "text", delta: ev.delta });
      } else if (ev.type === "tool-call") {
        pendingTools.push({ id: ev.id, name: ev.name, input: ev.input });
      } else if (ev.type === "usage") {
        args.onUsage?.(ev.usage, turnModel);
        tu.inputTokens += ev.usage.inputTokens;
        tu.outputTokens += ev.usage.outputTokens;
        tu.cacheCreationTokens += ev.usage.cacheCreationTokens;
        tu.cacheReadTokens += ev.usage.cacheReadTokens;
      } else if (ev.type === "turn-complete") {
        messages.push(ev.assistant);
      }
    }

    // Exactly one turn event per provider call (incl. the final no-tool answer turn).
    // costUsd:0 is filled by session-do's emit wrapper (loop stays pricing-agnostic).
    emit({
      type: "inspector", kind: "turn", exchangeId, turn,
      inputTokens: tu.inputTokens, outputTokens: tu.outputTokens,
      cacheReadTokens: tu.cacheReadTokens, cacheCreationTokens: tu.cacheCreationTokens, costUsd: 0,
      ...(turnModel ? { model: turnModel } : {}),
    });

    if (pendingTools.length === 0) { emit({ type: "turn-complete" }); return; }

    const results: import("../llm/provider").UserToolResult = {
      role: "user", content: [],
    };
    for (const t of pendingTools) {
      emit({ type: "tool", tool: t.name, phase: "start" });
      const t0 = Date.now();
      let content: string;
      let ok = true;
      try { content = await callTool(t.name, t.input); if (content.startsWith("ERROR:")) ok = false; }
      catch (e) { content = `ERROR: ${(e as Error).message}`; ok = false; }
      const latencyMs = Date.now() - t0;
      emit({ type: "tool", tool: t.name, phase: "done", summary: summarizeToolResult(content) });
      if (ok && args.buildBoard) {
        const board = args.buildBoard(t.name, content);
        if (board) emit(board);
      }
      emit({
        type: "inspector", kind: "tool", exchangeId, turn, name: t.name,
        args: scrubArgs(t.input), result: scrubResultText(content), latencyMs, ok,
      });
      results.content.push({ type: "tool_result", tool_use_id: t.id, content });
      if (isTripMutating(t.name, t.input)) {
        try { await onFolio(t.name, t.input); }
        catch { /* folio refresh is best-effort; a failed refresh must never abort the turn */ }
      }
    }
    const note = args.nudge?.(pendingTools.map((t) => ({ name: t.name, input: t.input })));
    if (note) results.content.push({ type: "text", text: note });
    messages.push(results);
    totalToolCalls += pendingTools.length;
    if (totalToolCalls >= maxToolCalls) { emit({ type: "turn-complete" }); return; }
  }
  emit({ type: "turn-complete" });
}
