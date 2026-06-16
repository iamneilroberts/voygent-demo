import { describe, it, expect } from "vitest";
import { makeTestDb } from "../access/testdb";
import { handleShowcase, handleShowcaseComment, SHOWCASE_CSP } from "./routes";
import { listPending } from "./comments";

const ORIGIN = "http://localhost:8787";

function env(extra: Record<string, unknown> = {}): any {
  return { SHOWCASE_ENABLED: "1", COMMENT_IP_SALT: "test-salt", APP_ORIGIN: ORIGIN, ...extra };
}

function getReq(): Request {
  return new Request(`${ORIGIN}/showcase`, { method: "GET" });
}

function postForm(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request(`${ORIGIN}/showcase/comments`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "9.9.9.9", ...headers },
    body,
  });
}

// A Db whose every method throws — simulates a missing showcase_comments table / D1 outage.
const throwingDb: any = {
  run: async () => { throw new Error("no such table: showcase_comments"); },
  first: async () => { throw new Error("no such table: showcase_comments"); },
  all: async () => { throw new Error("no such table: showcase_comments"); },
  batch: async () => { throw new Error("no such table: showcase_comments"); },
};

describe("GET /showcase", () => {
  it("404s when SHOWCASE_ENABLED is unset (inert)", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env({ SHOWCASE_ENABLED: undefined }), db);
    expect(res.status).toBe(404);
  });

  it("renders 200 HTML with the strict CSP header when enabled", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env(), db);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toBe(SHOWCASE_CSP);
  });

  it("still renders 200 (no comment form) when the salt is missing — fail-closed UX", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env({ COMMENT_IP_SALT: undefined }), db);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('action="/showcase/comments"');
  });

  it("degrades to no-comments (still 200) when D1 throws", async () => {
    const res = await handleShowcase(getReq(), env(), throwingDb);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('action="/showcase/comments"');
  });
});

describe("POST /showcase/comments", () => {
  it("404s when disabled (inert)", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env({ SHOWCASE_ENABLED: undefined }), db);
    expect(res.status).toBe(404);
  });

  it("503s fail-closed when COMMENT_IP_SALT is missing; nothing is written", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env({ COMMENT_IP_SALT: undefined }), db);
    expect(res.status).toBe(503);
    expect((await listPending(db, 10)).length).toBe(0);
  });

  it("503s fail-closed (not 500) when the comments table/D1 is unavailable", async () => {
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env(), throwingDb);
    expect(res.status).toBe(503);
  });

  it("415s on wrong content-type", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(
      new Request(`${ORIGIN}/showcase/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      env(),
      db,
    );
    expect(res.status).toBe(415);
  });

  it("413s when Content-Length exceeds the cap", async () => {
    const db = makeTestDb();
    const req = postForm({ name: "n", body: "b", website: "" }, { "content-length": "999999" });
    const res = await handleShowcaseComment(req, env(), db);
    expect(res.status).toBe(413);
  });

  it("stores a valid comment as pending and returns a neutral 200", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "Neil", body: "great", website: "" }), env(), db);
    expect(res.status).toBe(200);
    const pend = await listPending(db, 10);
    expect(pend.length).toBe(1);
    expect(pend[0].author_name).toBe("Neil");
  });

  it("silently drops a honeypot hit with the same neutral 200 (no write)", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "bot", body: "spam", website: "http://x" }), env(), db);
    expect(res.status).toBe(200);
    expect((await listPending(db, 10)).length).toBe(0);
  });

  it("rejects empty/over-length with 400", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "", body: "", website: "" }), env(), db);
    expect(res.status).toBe(400);
  });
});
