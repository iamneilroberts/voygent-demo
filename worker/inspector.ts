import { estimateCostUsd } from "./llm/cost";
import type { TokenUsage } from "./llm/provider";
import type { ServerEvent } from "../shared/events";

/** Token ESTIMATE only (chars÷4). Never used for wire-byte accounting. */
export function estTokens(s: string): number { return Math.ceil(s.length / 4); }

const _enc = new TextEncoder();
/** Exact UTF-8 wire bytes (NOT UTF-16 String#length). */
export function utf8Bytes(s: string): number { return _enc.encode(s).length; }

const ADVISOR_KEY = /^(commission|commissionable|netRate|net_rate|markup|advisorNotes|advisor_only)/i;
const MAX_DEPTH = 8;

/** Defense-in-depth: drop advisor-economics keys anywhere in a value. Bounded recursion. */
export function scrubAdvisor(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[scrub: too deep]";
  if (Array.isArray(value)) return value.map((v) => scrubAdvisor(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ADVISOR_KEY.test(k)) continue;
      out[k] = scrubAdvisor(v, depth + 1);
    }
    return out;
  }
  return value;
}
export function scrubArgs(obj: Record<string, unknown>): Record<string, unknown> {
  return scrubAdvisor(obj) as Record<string, unknown>;
}
export function scrubResultText(raw: string): string {
  try { return JSON.stringify(scrubAdvisor(JSON.parse(raw))); }
  catch { return raw; }
}

/** Inject real USD into a zero-cost turn event; passthrough everything else. */
export function withInspectorCost(ev: ServerEvent, model: string): ServerEvent {
  if (ev.type === "inspector" && ev.kind === "turn" && ev.costUsd === 0) {
    return { ...ev, costUsd: estimateCostUsd(model, {
      inputTokens: ev.inputTokens, outputTokens: ev.outputTokens,
      cacheCreationTokens: ev.cacheCreationTokens, cacheReadTokens: ev.cacheReadTokens,
    }) };
  }
  return ev;
}

const COST_MODELS = { haiku: "claude-haiku-4-5", sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-8" } as const;
/** This session's real cost under each model tier (server-side; client never holds pricing). */
export function sessionCostByModel(u: TokenUsage): { haiku: number; sonnet: number; opus: number } {
  return {
    haiku: estimateCostUsd(COST_MODELS.haiku, u),
    sonnet: estimateCostUsd(COST_MODELS.sonnet, u),
    opus: estimateCostUsd(COST_MODELS.opus, u),
  };
}

export type OrchStage = "create" | "search" | "distill" | "stage" | "promote" | "render";
export function stageForTool(name: string): OrchStage | null {
  if (name === "save_trip") return "create";
  if (name === "flight_search" || name === "hotel_search") return "search";
  if (name === "flight_list" || name === "hotel_list") return "distill";
  if (name === "patch_trip") return "stage";
  if (name === "promote_flights" || name === "promote_hotels_to_lodging") return "promote";
  return null;
}
