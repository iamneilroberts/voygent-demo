import { describe, it, expect } from "vitest";
import { enabledModels, coerceModel, buildRouting, resolveRoutingModel, DEFAULT_SMART_MAP } from "./models";

describe("enabledModels", () => {
  it("excludes Opus unless enabled", () => {
    expect(enabledModels({ opus: false })).toEqual(["claude-haiku-4-5", "claude-sonnet-4-6"]);
    expect(enabledModels({ opus: true })).toContain("claude-opus-4-8");
  });
});

describe("coerceModel", () => {
  const enabled = enabledModels({ opus: false });
  it("keeps an enabled id", () => {
    expect(coerceModel("claude-haiku-4-5", enabled, "claude-sonnet-4-6")).toBe("claude-haiku-4-5");
  });
  it("falls back for a disabled or junk id (the Opus gate)", () => {
    expect(coerceModel("claude-opus-4-8", enabled, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(coerceModel("gpt-4", enabled, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(coerceModel(undefined, enabled, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });
});

describe("buildRouting", () => {
  const enabled = enabledModels({ opus: false });
  it("single mode when only a model id is given", () => {
    const r = buildRouting({ model: "claude-haiku-4-5" }, enabled, "claude-sonnet-4-6");
    expect(r.mode).toBe("single");
    expect(r.model).toBe("claude-haiku-4-5");
  });
  it("smart mode coerces each phase, Opus→Sonnet when disabled", () => {
    const r = buildRouting({ routing: { discovery: "claude-opus-4-8", enrichment: "claude-haiku-4-5" } }, enabled, "claude-sonnet-4-6");
    expect(r.mode).toBe("smart");
    expect(r.map.discovery).toBe("claude-sonnet-4-6"); // opus coerced away
    expect(r.map.enrichment).toBe("claude-haiku-4-5");
  });
  it("defaults to smart with the default map when nothing is sent", () => {
    const r = buildRouting(undefined, enabled, "claude-sonnet-4-6");
    expect(r.mode).toBe("smart");
    expect(r.map).toEqual(DEFAULT_SMART_MAP);
  });
});

describe("resolveRoutingModel", () => {
  it("single mode ignores phase", () => {
    const r = buildRouting({ model: "claude-haiku-4-5" }, enabledModels({ opus: false }), "claude-sonnet-4-6");
    expect(resolveRoutingModel(r, false)).toBe("claude-haiku-4-5");
    expect(resolveRoutingModel(r, true)).toBe("claude-haiku-4-5");
  });
  it("smart mode picks by milestone", () => {
    const r = buildRouting(undefined, enabledModels({ opus: false }), "claude-sonnet-4-6");
    expect(resolveRoutingModel(r, false)).toBe("claude-sonnet-4-6"); // discovery
    expect(resolveRoutingModel(r, true)).toBe("claude-haiku-4-5");   // enrichment
  });
});

import { MODEL_REGISTRY, modelEntry, providerOf, OPTIMIZE_PRESETS } from "./models";

describe("model registry", () => {
  it("keeps the three Claude ids verbatim and tags their provider", () => {
    expect(modelEntry("claude-sonnet-4-6")?.provider).toBe("anthropic");
    expect(providerOf("claude-haiku-4-5")).toBe("anthropic");
  });
  it("includes a DeepSeek entry and a grayed Ollama entry", () => {
    expect(modelEntry("deepseek-chat")?.provider).toBe("deepseek");
    const ollama = MODEL_REGISTRY.find((m) => m.provider === "ollama");
    expect(ollama).toBeTruthy();
    expect(ollama!.available).toBe(false);
  });
  it("providerOf falls back to anthropic for unknown ids", () => {
    expect(providerOf("totally-unknown")).toBe("anthropic");
  });
});

describe("OPTIMIZE_PRESETS", () => {
  it("resolves every preset to an enabled model only", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    for (const key of ["speed", "cost", "capability"] as const) {
      const r = OPTIMIZE_PRESETS[key](enabled);
      const ids = r.mode === "single" ? [r.model] : [r.map.discovery, r.map.enrichment];
      for (const id of ids) expect(enabled).toContain(id);
    }
  });
  it("cost preset prefers DeepSeek when enabled", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    const r = OPTIMIZE_PRESETS.cost(enabled);
    expect(r.mode === "single" ? r.model : r.map.enrichment).toBe("deepseek-chat");
  });
});
