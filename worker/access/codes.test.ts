import { describe, it, expect } from "vitest";
import { hashCode, generateCode } from "./codes";

describe("code crypto", () => {
  it("hashCode is deterministic and key-sensitive", async () => {
    const a = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-1");
    const b = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-1");
    const c = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256
  });
  it("generateCode returns grouped high-entropy base32 (>=128 bits)", () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{4}(-[0-9a-hjkmnp-tv-z]{4}){3}$/i);
    const s = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(s.size).toBe(200); // no collisions across 200 draws
  });
});
