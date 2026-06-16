import { describe, it, expect } from "vitest";
import worker from "../index";
import { makeTestDb } from "../access/testdb";

const ORIGIN = "http://localhost:8787";
function baseEnv(extra: Record<string, unknown> = {}): any {
  return { __db: makeTestDb(), APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret", ...extra };
}

describe("showcase routing through worker.fetch", () => {
  it("GET /showcase is inert (404) when SHOWCASE_ENABLED is unset", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/showcase`, { method: "GET" }), baseEnv());
    expect(res.status).toBe(404);
  });

  it("GET /showcase renders 200 when enabled", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/showcase`, { method: "GET" }), baseEnv({ SHOWCASE_ENABLED: "1", COMMENT_IP_SALT: "s" }));
    expect(res.status).toBe(200);
  });

  it("unauthenticated POST /admin/comments/x/approve is 401 (handleAdmin gate)", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/admin/comments/x/approve`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" }),
      baseEnv(),
    );
    expect(res.status).toBe(401);
  });
});
