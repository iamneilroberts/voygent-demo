import { describe, it, expect } from "vitest";
import { guardMutation, getCookieHeader, json } from "./http";

const ORIGIN = "https://demo.voygent.ai";
function post(headers: Record<string, string>): Request {
  return new Request(`${ORIGIN}/auth`, { method: "POST", headers });
}

describe("guardMutation", () => {
  it("allows a same-origin JSON POST", () => {
    expect(guardMutation(post({ origin: ORIGIN, "content-type": "application/json" }), ORIGIN)).toBeNull();
  });
  it("rejects a missing/foreign Origin", () => {
    expect(guardMutation(post({ "content-type": "application/json" }), ORIGIN)?.status).toBe(403);
    expect(guardMutation(post({ origin: "https://evil.test", "content-type": "application/json" }), ORIGIN)?.status).toBe(403);
  });
  it("rejects a non-JSON content type", () => {
    expect(guardMutation(post({ origin: ORIGIN, "content-type": "text/plain" }), ORIGIN)?.status).toBe(403);
  });
});

describe("helpers", () => {
  it("reads the Cookie header", () => {
    const r = new Request(ORIGIN, { headers: { cookie: "a=1; b=2" } });
    expect(getCookieHeader(r)).toBe("a=1; b=2");
  });
  it("json() sets content-type and no-store", () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
