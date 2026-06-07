// Browser-side model-selector state. Wire types + coercion live in shared/models.ts
// (one source of truth with the worker); this adds URL/localStorage resolution and
// the small helpers the UI needs. Mirrors lib/mode.ts / lib/advisor.ts.
import {
  type ModelId, type RoutingMode, type PhaseModelMap, type ModelRouting,
  MODEL_IDS, DEFAULT_SMART_MAP, DEFAULT_ROUTING, coerceModel,
} from "../../../shared/models";

export type { ModelId, RoutingMode, PhaseModelMap, ModelRouting };
export { MODEL_IDS, DEFAULT_SMART_MAP, coerceModel };
export { MODEL_LABELS, PHASES, PHASE_LABELS, resolveRoutingModel } from "../../../shared/models";

export const MODEL_STORAGE_KEY = "voygent-demo-model";

// The selector's "mode" the visitor picks: a single model id, or "smart".
export type SelectorMode = ModelId | "smart";

export function resolveSelector(param: string | null | undefined, stored: string | null | undefined): SelectorMode {
  for (const v of [param, stored]) {
    if (v === "smart") return "smart";
    if (v && (MODEL_IDS as string[]).includes(v)) return v as ModelId;
  }
  return "smart"; // default
}

export function persistSelector(mode: SelectorMode): void {
  try { localStorage.setItem(MODEL_STORAGE_KEY, mode); } catch { /* storage blocked — ignore */ }
}

export function resolveInitialSelector(): SelectorMode {
  let param: string | null = null;
  let stored: string | null = null;
  try { param = new URLSearchParams(window.location.search).get("model"); } catch { /* default */ }
  try { stored = localStorage.getItem(MODEL_STORAGE_KEY); } catch { /* ignore */ }
  return resolveSelector(param, stored);
}

/** Build the ModelRouting sent to the worker from the selector mode + the current smart map. */
export function selectorToRouting(mode: SelectorMode, map: PhaseModelMap): ModelRouting {
  if (mode === "smart") return { mode: "smart", model: DEFAULT_ROUTING.model, map };
  return { mode: "single", model: mode, map };
}

/** What the /chat body carries (only the fields the worker reads). */
export function routingBody(mode: SelectorMode, map: PhaseModelMap): { model?: ModelId; routing?: PhaseModelMap } {
  return mode === "smart" ? { routing: map } : { model: mode };
}
