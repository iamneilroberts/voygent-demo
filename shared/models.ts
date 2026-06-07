// Model ids + per-phase routing — shared by the worker (authoritative coercion)
// and the web UI (selector). Pure + testable; no env, no DOM.

export type ModelId = "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-8";
export const MODEL_IDS: ModelId[] = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"];
export const MODEL_LABELS: Record<ModelId, string> = {
  "claude-haiku-4-5": "Haiku",
  "claude-sonnet-4-6": "Sonnet",
  "claude-opus-4-8": "Opus",
};

// Trip phases the smart router distinguishes (milestone-derived server-side).
export type Phase = "discovery" | "enrichment";
export const PHASES: Phase[] = ["discovery", "enrichment"];
export const PHASE_LABELS: Record<Phase, string> = {
  discovery: "search & recommend",
  enrichment: "enrichment",
};

export type PhaseModelMap = Record<Phase, ModelId>;

// Default smart map: reasoning-heavy discovery on Sonnet, recipe-driven
// enrichment on cheaper Haiku. Opus is never a default.
export const DEFAULT_SMART_MAP: PhaseModelMap = {
  discovery: "claude-sonnet-4-6",
  enrichment: "claude-haiku-4-5",
};

export type RoutingMode = "single" | "smart";
export interface ModelRouting {
  mode: RoutingMode;
  model: ModelId;        // used when mode === "single"
  map: PhaseModelMap;    // used when mode === "smart"
}

export const DEFAULT_ROUTING: ModelRouting = {
  mode: "smart",
  model: "claude-sonnet-4-6",
  map: { ...DEFAULT_SMART_MAP },
};

/** The model set the demo will accept/offer. Opus only when explicitly enabled. */
export function enabledModels(opusEnabled: boolean): ModelId[] {
  return opusEnabled ? [...MODEL_IDS] : ["claude-haiku-4-5", "claude-sonnet-4-6"];
}

/** Coerce an untrusted model id to an enabled one (fallback otherwise). The real Opus gate. */
export function coerceModel(id: unknown, enabled: ModelId[], fallback: ModelId): ModelId {
  return typeof id === "string" && (enabled as string[]).includes(id) ? (id as ModelId) : fallback;
}

/** Build a validated ModelRouting from untrusted client input, coercing every model id. */
export function buildRouting(
  raw: { model?: unknown; routing?: { discovery?: unknown; enrichment?: unknown } } | null | undefined,
  enabled: ModelId[],
  fallback: ModelId,
): ModelRouting {
  const r = raw ?? {};
  // A single model id present (and no routing map) → single mode.
  if (r.model != null && r.routing == null) {
    return { mode: "single", model: coerceModel(r.model, enabled, fallback), map: { ...DEFAULT_SMART_MAP } };
  }
  if (r.routing) {
    return {
      mode: "smart",
      model: coerceModel(r.model, enabled, fallback),
      map: {
        discovery: coerceModel(r.routing.discovery, enabled, DEFAULT_SMART_MAP.discovery),
        enrichment: coerceModel(r.routing.enrichment, enabled, DEFAULT_SMART_MAP.enrichment),
      },
    };
  }
  // Nothing specified → default smart routing (coerced so a disabled default still resolves).
  return {
    mode: "smart",
    model: coerceModel(DEFAULT_ROUTING.model, enabled, fallback),
    map: {
      discovery: coerceModel(DEFAULT_SMART_MAP.discovery, enabled, fallback),
      enrichment: coerceModel(DEFAULT_SMART_MAP.enrichment, enabled, fallback),
    },
  };
}

/** Resolve the model for the upcoming turn given the trip's milestone phase. */
export function resolveRoutingModel(r: ModelRouting, hotelsPromoted: boolean): ModelId {
  if (r.mode === "single") return r.model;
  return r.map[hotelsPromoted ? "enrichment" : "discovery"];
}
