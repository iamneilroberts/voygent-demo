import { describe, it, expect, beforeEach } from "vitest";
import worker from "../index";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db, BatchOp } from "../access/db";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "http://localhost:8787";
const ADMIN_TOKEN = "secret-admin";

// A db with the info_page_overrides table (the access makeTestDb doesn't have it).
function makeDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(join(HERE, "../../migrations/0002_info_overrides.sql"), "utf8"));
  return {
    async run(sql, params = []) { const r = sqlite.prepare(sql).run(...(params as any[])); return { changes: r.changes }; },
    async first(sql, params = []) { return (sqlite.prepare(sql).get(...(params as any[])) as any) ?? null; },
    async all(sql, params = []) { return sqlite.prepare(sql).all(...(params as any[])) as any[]; },
    async batch(ops: BatchOp[]) { const tx = sqlite.transaction(() => { for (const o of ops) sqlite.prepare(o.sql).run(...((o.params ?? []) as any[])); }); tx(); },
  };
}
function envFor(db: Db): any {
  return { DEMO_DB: {}, APP_ORIGIN: ORIGIN, ADMIN_TOKEN, __db: db };
}
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
function get(path: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: { origin: ORIGIN } });
}
const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };

describe("/info edit routes", () => {
  let db: Db;
  beforeEach(() => { db = makeDb(); });

  it("rejects save without admin auth (401)", async () => {
    const res = await worker.fetch(post("/info/subagents/save", { body: "<p>x</p>" }), envFor(db));
    expect(res.status).toBe(401);
  });

  it("rejects cross-origin save (403) even with auth", async () => {
    const res = await worker.fetch(post("/info/subagents/save", { body: "<p>x</p>" }, { ...auth, origin: "https://evil.test" }), envFor(db));
    expect(res.status).toBe(403);
  });

  it("404s save for an unknown slug", async () => {
    const res = await worker.fetch(post("/info/not-a-page/save", { body: "x" }, auth), envFor(db));
    expect(res.status).toBe(404);
  });

  it("saves an override and a later GET reflects it", async () => {
    const save = await worker.fetch(post("/info/subagents/save", { title: "Edited Title", subtitle: "Edited sub", body: "<p>edited body marker</p>" }, auth), envFor(db));
    expect(save.status).toBe(200);

    const page = await worker.fetch(get("/info/subagents"), envFor(db));
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    expect(html).toContain("Edited Title");
    expect(html).toContain("edited body marker");
    expect(html).toContain("overridden"); // edited chip
  });

  it("revert deletes the override and GET falls back to the source default", async () => {
    await worker.fetch(post("/info/subagents/save", { title: "Edited Title", subtitle: "s", body: "<p>edited body marker</p>" }, auth), envFor(db));
    const rev = await worker.fetch(post("/info/subagents/revert", {}, auth), envFor(db));
    expect(rev.status).toBe(200);

    const html = await (await worker.fetch(get("/info/subagents"), envFor(db))).text();
    expect(html).not.toContain("edited body marker");
    expect(html).toContain("Subagents for the drudge work"); // source default title
    expect(html).toContain("source default"); // chip back to default
  });

  it("GET renders default (no throw) when the overrides table is absent", async () => {
    // access makeTestDb-style db without the overrides table → getOverride swallows.
    const sqlite = new Database(":memory:");
    const bareDb: Db = {
      async run(sql, params = []) { const r = sqlite.prepare(sql).run(...(params as any[])); return { changes: r.changes }; },
      async first(sql, params = []) { return (sqlite.prepare(sql).get(...(params as any[])) as any) ?? null; },
      async all(sql, params = []) { return sqlite.prepare(sql).all(...(params as any[])) as any[]; },
      async batch() {},
    };
    const res = await worker.fetch(get("/info/subagents"), envFor(bareDb));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Subagents for the drudge work");
  });
});
