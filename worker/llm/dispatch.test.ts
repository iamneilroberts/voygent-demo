import { describe, it, expect } from "vitest";
import { DispatchProvider } from "./dispatch";
import type { LLMProvider, ProviderEvent } from "./provider";

function fake(tag: string): LLMProvider {
  return { async *stream() { yield { type: "text-delta", delta: tag } as ProviderEvent; yield { type: "turn-complete", assistant: { role: "assistant", content: [] } } as ProviderEvent; } };
}

describe("DispatchProvider", () => {
  it("routes per call by the opts.model's provider", async () => {
    const seen: string[] = [];
    const d = new DispatchProvider((id) => { seen.push(id); return id.startsWith("deepseek") ? fake("DS") : fake("CL"); }, "claude-sonnet-4-6");
    const out1: string[] = [];
    for await (const e of d.stream([], [], { model: "deepseek-chat" })) if (e.type === "text-delta") out1.push(e.delta);
    const out2: string[] = [];
    for await (const e of d.stream([], [], { model: "claude-haiku-4-5" })) if (e.type === "text-delta") out2.push(e.delta);
    expect(out1).toEqual(["DS"]);
    expect(out2).toEqual(["CL"]);
    expect(seen).toEqual(["deepseek-chat", "claude-haiku-4-5"]);
  });
  it("uses the default model id when opts.model is absent", async () => {
    const seen: string[] = [];
    const d = new DispatchProvider((id) => { seen.push(id); return fake("X"); }, "claude-sonnet-4-6");
    for await (const _ of d.stream([], [])) { /* drain */ }
    expect(seen).toEqual(["claude-sonnet-4-6"]);
  });
});
