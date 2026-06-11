import { describe, it, expect, vi, afterEach } from "vitest";
import { handleProRequest } from "./pro-request-handler";
import { makeTestDb } from "./testdb";
import { listPending } from "./pro-requests";

const ORIGIN = "http://localhost:8787";
afterEach(() => { vi.restoreAllMocks(); });
function env(): any { return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, RESEND_API_KEY: "k", NEIL_NOTIFY_EMAIL: "neil@x.com" }; }
function req(body: unknown): Request {
  return new Request(`${ORIGIN}/pro-request`, { method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" },
    body: JSON.stringify(body) });
}

describe("POST /pro-request", () => {
  it("captures a pending request and emails Neil, without issuing a code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
    const db = makeTestDb();
    const res = await handleProRequest(req({ name: "Jo", email: "jo@x.com", company: "Acme", role: "VP", useCase: "eval" }), env(), db);
    expect(res.status).toBe(200);
    expect(await listPending(db)).toHaveLength(1);
    const codes = await db.all("SELECT * FROM codes");
    expect(codes).toHaveLength(0); // NO code issued
  });

  it("rejects bad input", async () => {
    const res = await handleProRequest(req({ name: "", email: "nope" }), env(), makeTestDb());
    expect(res.status).toBe(400);
  });
});
