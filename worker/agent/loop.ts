import type { LLMProvider, ToolSchema, ConversationMessage, TokenUsage } from "../llm/provider";
import type { ServerEvent } from "../../shared/events";
import { isTripMutating } from "./folio-sync";
import { scrubArgs, scrubResultText } from "../inspector";
import { summarizeToolResult } from "./tool-summary";

function visitorToolSummary(content: string, ok: boolean, friendlyOnFail: boolean): string {
  if (!friendlyOnFail) return summarizeToolResult(content); // default path unchanged (byte-identical)
  // Faithful mode: hide ANY failure from the visitor — the thrown/ERROR: case (ok===false) AND a
  // JSON {error:...} envelope that didn't trip the ERROR: prefix (so ok stayed true). The model
  // still receives the raw tool_result; we do NOT touch the `ok` flag (used for boards/inspector),
  // so flag-off behavior is unchanged.
  if (!ok || hasJsonError(content)) return "that source was slow — trying another…";
  return summarizeToolResult(content);
}

function hasJsonError(content: string): boolean {
  try {
    const o = JSON.parse(content);
    return !!o && typeof o === "object" && typeof (o as { error?: unknown }).error === "string"
      && !!(o as { error?: string }).error;
  } catch { return false; }
}

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
  // Phase-machine seam (additive; absent → unchanged behavior). Called once per
  // tool batch with each tool's parsed result text. Its return (if any) is
  // appended to the tool_result message exactly like `nudge`. Used to advance the
  // phase reducer and inject the next phase's directive.
  afterToolBatch?: (batch: Array<{ name: string; input: Record<string, unknown>; result: string }>) => string | null;
  // Phase-machine seam: called when the model produced NO tool calls (would end the
  // turn). Return a directive string to inject as a synthetic user turn and CONTINUE
  // the loop; return null to end the turn as usual. The implementer owns the cap.
  continueDirective?: () => string | null;
  maxTurns?: number;
  maxToolCalls?: number;
  exchangeId?: string;
  // When true (faithful mode), a FAILED tool emits a visitor-safe chip summary instead of the
  // raw error. Default false → the error chip text is byte-identical to today. The model-facing
  // tool_result content is unchanged in both cases.
  friendlyToolErrors?: boolean;
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

    if (pendingTools.length === 0) {
      const cont = args.continueDirective?.();
      if (cont) {
        // Structural auto-continuation: re-prompt with the current phase directive
        // and keep looping (the model stopped mid-build). The hook owns the cap.
        messages.push({ role: "user", content: cont });
        continue;
      }
      emit({ type: "turn-complete" }); return;
    }

    const results: import("../llm/provider").UserToolResult = {
      role: "user", content: [],
    };
    const resultTexts: string[] = [];
    for (const t of pendingTools) {
      emit({ type: "tool", tool: t.name, phase: "start" });
      const t0 = Date.now();
      let content: string;
      let ok = true;
      try { content = await callTool(t.name, t.input); if (content.startsWith("ERROR:")) ok = false; }
      catch (e) { content = `ERROR: ${(e as Error).message}`; ok = false; }
      const latencyMs = Date.now() - t0;
      emit({ type: "tool", tool: t.name, phase: "done", summary: visitorToolSummary(content, ok, !!args.friendlyToolErrors) });
      if (ok && args.buildBoard) {
        const board = args.buildBoard(t.name, content);
        if (board) emit(board);
      }
      emit({
        type: "inspector", kind: "tool", exchangeId, turn, name: t.name,
        args: scrubArgs(t.input), result: scrubResultText(content), latencyMs, ok,
      });
      results.content.push({ type: "tool_result", tool_use_id: t.id, content });
      resultTexts.push(content);
      if (isTripMutating(t.name, t.input)) {
        try { await onFolio(t.name, t.input); }
        catch { /* folio refresh is best-effort; a failed refresh must never abort the turn */ }
      }
    }
    const batchWithResults = pendingTools.map((t, i) => ({ name: t.name, input: t.input, result: resultTexts[i] }));
    const note = args.afterToolBatch
      ? args.afterToolBatch(batchWithResults)
      : args.nudge?.(pendingTools.map((t) => ({ name: t.name, input: t.input })));
    if (note) results.content.push({ type: "text", text: note });
    messages.push(results);
    totalToolCalls += pendingTools.length;
    if (totalToolCalls >= maxToolCalls) { emit({ type: "turn-complete" }); return; }
  }
  emit({ type: "turn-complete" });
}
