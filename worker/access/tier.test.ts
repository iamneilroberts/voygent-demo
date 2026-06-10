import { describe, it, expect } from "vitest";
import { pickBearer, resolveLiveBearer } from "./tier";

const env = { VOYGENT_MCP_BEARER: "public-bearer", VOYGENT_MCP_BEARER_PRO: "pro-bearer" };

describe("pickBearer", () => {
  it("returns the public bearer for public tier", () => {
    expect(pickBearer("public", env)).toBe("public-bearer");
  });
  it("returns the pro bearer for pro tier", () => {
    expect(pickBearer("pro", env)).toBe("pro-bearer");
  });
  it("returns null for pro tier when the pro bearer is unset (fail closed)", () => {
    expect(pickBearer("pro", { VOYGENT_MCP_BEARER: "public-bearer" })).toBeNull();
  });
});

describe("resolveLiveBearer", () => {
  it("allows a public live session only when DEMO_PUBLIC_LIVE_ENABLED is set", () => {
    const r = resolveLiveBearer("public", { ...env, DEMO_PUBLIC_LIVE_ENABLED: "1" });
    expect(r).toEqual({ ok: true, bearer: "public-bearer" });
  });

  it("refuses public live when the flag is unset (fail closed — public live stays dark)", () => {
    const r = resolveLiveBearer("public", env); // no DEMO_PUBLIC_LIVE_ENABLED
    expect(r.ok).toBe(false);
  });

  it("allows pro live with a configured pro bearer, regardless of the public flag", () => {
    const r = resolveLiveBearer("pro", env); // flag unset, but pro is gated on its own bearer
    expect(r).toEqual({ ok: true, bearer: "pro-bearer" });
  });

  it("refuses pro live when the pro bearer is unset (fail closed)", () => {
    const r = resolveLiveBearer("pro", { VOYGENT_MCP_BEARER: "public-bearer", DEMO_PUBLIC_LIVE_ENABLED: "1" });
    expect(r.ok).toBe(false);
  });
});
