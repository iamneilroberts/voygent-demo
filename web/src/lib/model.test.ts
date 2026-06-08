import { describe, it, expect } from "vitest";
import { resolveSelector, selectorToRouting, routingBody } from "./model";
import { DEFAULT_SMART_MAP } from "../../../shared/models";

describe("resolveSelector", () => {
  it("param wins, then storage, default smart", () => {
    expect(resolveSelector("claude-haiku-4-5", "smart")).toBe("claude-haiku-4-5");
    expect(resolveSelector(null, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(resolveSelector("smart", "claude-haiku-4-5")).toBe("smart");
    expect(resolveSelector(null, null)).toBe("smart");
    expect(resolveSelector("garbage", null)).toBe("smart");
  });
});

describe("selectorToRouting", () => {
  it("smart carries the map", () => {
    const r = selectorToRouting("smart", DEFAULT_SMART_MAP);
    expect(r.mode).toBe("smart");
    expect(r.map).toEqual(DEFAULT_SMART_MAP);
  });
  it("single carries the chosen model", () => {
    const r = selectorToRouting("claude-haiku-4-5", DEFAULT_SMART_MAP);
    expect(r.mode).toBe("single");
    expect(r.model).toBe("claude-haiku-4-5");
  });
});

describe("routingBody", () => {
  it("smart → {routing}, single → {model}", () => {
    expect(routingBody("smart", DEFAULT_SMART_MAP)).toEqual({ routing: DEFAULT_SMART_MAP });
    expect(routingBody("claude-sonnet-4-6", DEFAULT_SMART_MAP)).toEqual({ model: "claude-sonnet-4-6" });
  });
});

import { applyOptimize, modelsByProvider } from "./model";
import { enabledModels } from "../../../shared/models";

describe("applyOptimize", () => {
  it("returns a routing whose models are all enabled", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    const r = applyOptimize("cost", enabled);
    const ids = r.mode === "single" ? [r.model] : Object.values(r.map);
    for (const id of ids) expect(enabled).toContain(id);
  });
});

describe("modelsByProvider", () => {
  it("groups enabled + grayed models by provider with Ollama present but unavailable", () => {
    const groups = modelsByProvider(enabledModels({ opus: false, deepseek: true }));
    const ollama = groups.find((g) => g.provider === "ollama");
    expect(ollama).toBeTruthy();
    expect(ollama!.models.every((m) => !m.available)).toBe(true);
  });
});
