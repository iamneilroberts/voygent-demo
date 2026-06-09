import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { makeTestDb } from "./access/testdb";
import { createCode, admit } from "./access/codes";
import { issueCookie } from "./access/session";
import type { Db } from "./access/db";

const ORIGIN = "http://localhost:8787";
const HASH_KEY = "hk"; const RING = '{"1":"sign"}';

function fakeSessionNamespace() {
  return {
    idFromName: (n: string) => ({ name: n }),
    get: (_id: any) => ({ fetch: async () => new Response("stream", { status: 200 }) }),
  };
}
function envFor(db: Db): any {
  return {
    SESSION: fakeSessionNamespace(),
    DEMO_DB: {}, CODE_HASH_KEY: HASH_KEY, SESSION_SIGN_KEY: RING, APP_ORIGIN: ORIGIN,
    EST_EXCHANGE_MICROS: "200000", __db: db,
  };
}
async function chatReq(db: Db, codeId: string): Promise<Request> {
  const cookie = (await issueCookie({ sid: "s1", codeId }, RING, 43200, false)).split(";")[0];
  return new Request(`${ORIGIN}/chat`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", cookie },
    body: JSON.stringify({ message: "hi" }),
  });
}

describe("/chat admission", () => {
  let db: Db;
  beforeEach(async () => {
    db = makeTestDb();
    await createCode(db, { id: "c", label: "L", view: "default", dailyMicros: 400_000, totalMicros: 10_000_000, expiresAt: null }, HASH_KEY, "2026-06-09T00:00:00Z");
  });

  it("401s without a cookie", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/chat`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}",
    }), envFor(db));
    expect(res.status).toBe(401);
  });

  it("admits within budget and forwards to the DO", async () => {
    const res = await worker.fetch(await chatReq(db, "c"), envFor(db));
    expect(res.status).toBe(200); // fake DO returns 200
  });

  it("503s once the daily cap is exhausted", async () => {
    // $0.40 daily, EST $0.20 → 2 admits then refuse
    await admit(db, "c", 200_000, new Date().toISOString(), new Date().toISOString().slice(0, 10));
    await admit(db, "c", 200_000, new Date().toISOString(), new Date().toISOString().slice(0, 10));
    const res = await worker.fetch(await chatReq(db, "c"), envFor(db));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("daily limit");
  });
});
