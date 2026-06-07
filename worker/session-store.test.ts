import { describe, it, expect } from "vitest";
import { msgKey, shrinkForStorage } from "./session-store";
import type { ConversationMessage } from "./llm/provider";

describe("msgKey", () => {
  it("zero-pads so lexicographic list order = insertion order", () => {
    expect(msgKey(0)).toBe("msg:00000");
    expect(msgKey(123)).toBe("msg:00123");
    expect(msgKey(99) < msgKey(100)).toBe(true);
  });
});

describe("shrinkForStorage", () => {
  const big = (n: number) => "x".repeat(n);

  it("returns small messages unchanged (same reference)", () => {
    const m: ConversationMessage = { role: "user", content: "hello" };
    expect(shrinkForStorage(m)).toBe(m);
  });

  it("elides the largest tool_result first, keeps small ones, never mutates the original", () => {
    const m: ConversationMessage = {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: big(120_000) },
        { type: "tool_result", tool_use_id: "b", content: "small result" },
      ],
    };
    const out = shrinkForStorage(m);
    expect(out).not.toBe(m);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(90_000);
    const blocks = out.content as Array<{ tool_use_id: string; content: string }>;
    expect(blocks.find((b) => b.tool_use_id === "a")!.content).toContain("elided");
    expect(blocks.find((b) => b.tool_use_id === "b")!.content).toBe("small result");
    // original untouched
    expect((m.content as Array<{ content: string }>)[0].content.length).toBe(120_000);
  });

  it("stops eliding once under the cap", () => {
    const m: ConversationMessage = {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: big(60_000) },
        { type: "tool_result", tool_use_id: "b", content: big(60_000) },
      ],
    };
    const out = shrinkForStorage(m);
    const blocks = out.content as Array<{ content: string }>;
    const elided = blocks.filter((b) => b.content.includes("elided")).length;
    expect(elided).toBe(1); // eliding one of the two is enough
  });
});
