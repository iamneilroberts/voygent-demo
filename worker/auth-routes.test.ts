import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { makeTestDb } from "./access/testdb";
import { createCode } from "./access/codes";
import { COOKIE_NAME_INSECURE } from "./access/session";
import type { Db } from "./access/db";

const ORIGIN = "http://localhost:8787";
const HASH_KEY = "hk"; const RING = '{"1":"sign"}';

function envFor(db: Db): any {
  return {
    DEMO_DB: {}, CODE_HASH_KEY: HASH_KEY, SESSION_SIGN_KEY: RING, APP_ORIGIN: ORIGIN,
    __db: db,
  };
}
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/auth", () => {
  let db: Db; let code: string;
  beforeEach(async () => {
    db = makeTestDb();
    ({ code } = await createCode(db, { id: "c", label: "L", view: "advisor", dailyMicros: 5_000_000, totalMicros: 25_000_000, expiresAt: null }, HASH_KEY, "2026-06-09T00:00:00Z"));
  });

  it("issues a session cookie for a valid code", async () => {
    const res = await worker.fetch(post("/auth", { code }), envFor(db));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(COOKIE_NAME_INSECURE);
  });
  it("returns a uniform 401 for an invalid code", async () => {
    const res = await worker.fetch(post("/auth", { code: "0000-0000-0000-0000" }), envFor(db));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("rejects a cross-origin POST with 403", async () => {
    const res = await worker.fetch(post("/auth", { code }, { origin: "https://evil.test" }), envFor(db));
    expect(res.status).toBe(403);
  });
  it("/auth/me reports authed=false without a cookie", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { origin: ORIGIN } }), envFor(db));
    expect(res.status).toBe(401);
  });
});
