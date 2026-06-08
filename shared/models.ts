// Model ids + per-phase routing — shared by the worker (authoritative coercion)
// and the web UI (selector). Pure + testable; no env, no DOM.

export type ModelId = string;  // was the Claude union; now any registry id (coerceModel still gates execution)
export const MODEL_IDS: ModelId[] = ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"];
export const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku",
  "claude-sonnet-4-6": "Sonnet",
  "claude-opus-4-8": "Opus",
};

export type ProviderId = "anthropic" | "deepseek" | "ollama";

export interface ModelEntry {
  id: string;
  provider: ProviderId;
  label: string;
  available: boolean;            // false ⇒ rendered grayed, never executed
  reason?: string;               // why unavailable (tooltip)
  hints: { speed: 1 | 2 | 3; cost: 1 | 2 | 3; capability: 1 | 2 | 3 }; // 3 = best on that axis
}

// Claude ids stay VERBATIM (persisted in SessRecord.routing + localStorage). New
// providers ADD ids; they never rename the Claude trio (R4).
export const MODEL_REGISTRY: ModelEntry[] = [
  // cost hint ranks cheapness (3 = cheapest). DeepSeek (~$0.27/M in) is strictly
  // cheaper than Haiku (~$1/M in), so Haiku is cost:2 — keeps DeepSeek the unique
  // cheapest so the "cost" optimize preset routes to it (plan A1.1 used 3/3, which
  // tied and stable-sorted to Haiku; corrected to match the OPTIMIZE_PRESETS spec).
  { id: "claude-haiku-4-5",  provider: "anthropic", label: "Haiku",  available: true,  hints: { speed: 3, cost: 2, capability: 1 } },
  { id: "claude-sonnet-4-6", provider: "anthropic", label: "Sonnet", available: true,  hints: { speed: 2, cost: 2, capability: 2 } },
  { id: "claude-opus-4-8",   provider: "anthropic", label: "Opus",   available: true,  hints: { speed: 1, cost: 1, capability: 3 } },
  { id: "deepseek-chat",     provider: "deepseek",  label: "DeepSeek V4", available: true, hints: { speed: 3, cost: 3, capability: 2 } },
  { id: "llama3.1:8b",       provider: "ollama",    label: "Llama 3.1 8B (local)", available: false,
    reason: "Runs on your machine — unreachable from this edge Worker.", hints: { speed: 2, cost: 3, capability: 1 } },
];

export function modelEntry(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}
export function providerOf(id: string): ProviderId {
  return modelEntry(id)?.provider ?? "anthropic";
}

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

export interface EnabledFlags { opus?: boolean; deepseek?: boolean; ollama?: boolean }

/** The model ids the demo will accept/offer, given per-provider gates. */
export function enabledModels(flags: EnabledFlags | boolean): ModelId[] {
  // Back-compat: a bare boolean is the old opus flag.
  const f: EnabledFlags = typeof flags === "boolean" ? { opus: flags } : flags;
  return MODEL_REGISTRY.filter((m) => {
    if (m.provider === "anthropic") return m.id === "claude-opus-4-8" ? !!f.opus : true;
    if (m.provider === "deepseek") return !!f.deepseek;
    if (m.provider === "ollama") return !!f.ollama; // never set from the edge Worker
    return false;
  }).map((m) => m.id as ModelId);
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

function cheapest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.cost ?? 0) - (modelEntry(a)?.hints.cost ?? 0))[0];
}
function fastest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.speed ?? 0) - (modelEntry(a)?.hints.speed ?? 0))[0];
}
function strongest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.capability ?? 0) - (modelEntry(a)?.hints.capability ?? 0))[0];
}

export type OptimizeKey = "speed" | "cost" | "capability";
export const OPTIMIZE_PRESETS: Record<OptimizeKey, (enabled: ModelId[]) => ModelRouting> = {
  speed: (enabled) => ({ mode: "single", model: fastest(enabled), map: { ...DEFAULT_SMART_MAP } }),
  cost: (enabled) => ({ mode: "single", model: cheapest(enabled), map: { ...DEFAULT_SMART_MAP } }),
  capability: (enabled) => ({
    mode: "smart", model: strongest(enabled),
    map: { discovery: strongest(enabled), enrichment: cheapest(enabled) },
  }),
};
