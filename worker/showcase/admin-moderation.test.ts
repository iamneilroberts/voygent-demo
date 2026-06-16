import { describe, it, expect } from "vitest";
import { makeTestDb } from "../access/testdb";
import { handleAdminComments } from "./admin-moderation";
import { insertPending, listApproved } from "./comments";

const ORIGIN = "http://localhost:8787";
function env(): any { return { APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret" }; }

function listReq(): Request {
  return new Request(`${ORIGIN}/admin/comments`, { method: "GET" });
}
function actionReq(id: string, action: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/admin/comments/${id}/${action}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: "{}",
  });
}

describe("admin moderation routes", () => {
  it("GET /admin/comments lists pending rows as escaped HTML", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "<b>n</b>", body: "<script>x</script>", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(listReq(), env(), db);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });

  it("approve transitions a pending row and returns ok", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "n", body: "b", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(actionReq("p1", "approve"), env(), db);
    expect(res.status).toBe(200);
    expect((await listApproved(db, 10)).map((r) => r.id)).toEqual(["p1"]);
  });

  it("rejects a cross-site Origin (CSRF defense via guardMutation)", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "n", body: "b", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(actionReq("p1", "approve", { origin: "https://evil.example" }), env(), db);
    expect(res.status).toBe(403);
    expect((await listApproved(db, 10)).length).toBe(0); // not approved
  });

  it("returns 404 for an unmatched /admin/comments path", async () => {
    const db = makeTestDb();
    const res = await handleAdminComments(new Request(`${ORIGIN}/admin/comments/x/y/z`, { method: "POST" }), env(), db);
    expect(res.status).toBe(404);
  });
});
