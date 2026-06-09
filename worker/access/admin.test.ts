import { describe, it, expect } from "vitest";
import { handleAdmin } from "./admin";
import { makeTestDb } from "./testdb";

const ORIGIN = "http://localhost:8787";
function env(): any { return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret" }; }
function adminReq(path: string, method: string, body?: unknown, token = "secret"): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin API", () => {
  it("rejects a missing/incorrect admin token", async () => {
    const db = makeTestDb();
    const res = await handleAdmin(adminReq("/admin/codes", "GET", undefined, "wrong"), env(), db);
    expect(res.status).toBe(401);
  });

  it("creates a code, lists it, and revokes it", async () => {
    const db = makeTestDb();
    const created = await handleAdmin(
      adminReq("/admin/codes", "POST", { id: "advisor", label: "Advisor", view: "advisor", dailyUsd: 5, totalUsd: 25 }),
      env(), db);
    expect(created.status).toBe(200);
    const body = await created.json<{ code: string; link: string }>();
    expect(body.code).toMatch(/-/);
    expect(body.link).toContain(`#code=${body.code}`);

    const listed = await (await handleAdmin(adminReq("/admin/codes", "GET"), env(), db)).json<{ codes: any[] }>();
    expect(listed.codes).toHaveLength(1);
    expect(listed.codes[0].daily_micros).toBe(5_000_000);

    const revoked = await handleAdmin(adminReq("/admin/codes/advisor/revoke", "POST"), env(), db);
    expect(revoked.status).toBe(200);
    const after = await (await handleAdmin(adminReq("/admin/codes", "GET"), env(), db)).json<{ codes: any[] }>();
    expect(after.codes[0].revoked).toBe(1);
  });

  it("serves the admin HTML page at GET /admin", async () => {
    const res = await handleAdmin(adminReq("/admin", "GET"), env(), makeTestDb());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Voygent Demo — Admin");
  });
});
