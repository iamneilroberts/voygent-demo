import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";

describe("makeTestDb schema", () => {
  it("includes the tier column on codes", async () => {
    const db = makeTestDb();
    const cols = await db.all<{ name: string }>("PRAGMA table_info(codes)");
    expect(cols.map((c) => c.name)).toContain("tier");
  });
  it("includes code_meta and pro_requests tables", async () => {
    const db = makeTestDb();
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'");
    const names = tables.map((t) => t.name);
    expect(names).toContain("code_meta");
    expect(names).toContain("pro_requests");
  });
});
