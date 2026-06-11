import { describe, it, expect, vi, afterEach } from "vitest";
import { handleOnboard } from "./onboard";
import { makeTestDb } from "./testdb";
import { lookupByCode } from "./codes";

const ORIGIN = "http://localhost:8787";
afterEach(() => { vi.restoreAllMocks(); });

function env(extra: any = {}): any {
  return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, RESEND_API_KEY: "k", ONBOARD_IP_DAILY_CAP: "3", ...extra };
}
function req(body: unknown, ip = "1.2.3.4"): Request {
  return new Request(`${ORIGIN}/onboard`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}
function stubMailOk() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
}

describe("POST /onboard", () => {
  it("issues a public code, persists meta, emails, and returns the code", async () => {
    stubMailOk();
    const db = makeTestDb();
    const res = await handleOnboard(req({ name: "Jo", email: "jo@x.com", role: "travel-pro", note: "hi" }), env(), db);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; code: string }>();
    expect(body.ok).toBe(true);
    const hit = await lookupByCode(db, body.code, "hk", new Date().toISOString());
    expect(hit?.tier).toBe("public");
    const meta = await db.all<{ owner_email: string; source: string }>("SELECT owner_email, source FROM code_meta");
    expect(meta[0].owner_email).toBe("jo@x.com");
    expect(meta[0].source).toBe("self-serve");
  });

  it("rejects bad input with 400", async () => {
    const res = await handleOnboard(req({ name: "", email: "nope" }), env(), makeTestDb());
    expect(res.status).toBe(400);
  });

  it("rate-limits after the per-ip daily cap (429)", async () => {
    stubMailOk();
    const db = makeTestDb();
    for (let i = 0; i < 3; i++) {
      const ok = await handleOnboard(req({ name: `U${i}`, email: `u${i}@x.com` }), env(), db);
      expect(ok.status).toBe(200);
    }
    const blocked = await handleOnboard(req({ name: "U4", email: "u4@x.com" }), env(), db);
    expect(blocked.status).toBe(429);
  });

  it("still issues the code when email fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const db = makeTestDb();
    const res = await handleOnboard(req({ name: "Jo", email: "jo@x.com" }), env(), db);
    expect(res.status).toBe(200);
    const body = await res.json<{ code: string }>();
    expect(body.code).toMatch(/-/);
  });
});
