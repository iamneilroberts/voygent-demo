import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db, BatchOp } from "../access/db";
import { getOverride, putOverride, deleteOverride } from "./overrides";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, "../../migrations/0002_info_overrides.sql");

function makeDb(applyMigration = true): Db {
  const sqlite = new Database(":memory:");
  if (applyMigration) sqlite.exec(readFileSync(MIGRATION, "utf8"));
  return {
    async run(sql, params = []) { const r = sqlite.prepare(sql).run(...(params as any[])); return { changes: r.changes }; },
    async first(sql, params = []) { return (sqlite.prepare(sql).get(...(params as any[])) as any) ?? null; },
    async all(sql, params = []) { return sqlite.prepare(sql).all(...(params as any[])) as any[]; },
    async batch(ops: BatchOp[]) { const tx = sqlite.transaction(() => { for (const o of ops) sqlite.prepare(o.sql).run(...((o.params ?? []) as any[])); }); tx(); },
  };
}

describe("info overrides", () => {
  it("put then get round-trips all fields", async () => {
    const db = makeDb();
    await putOverride(db, "subagents", { title: "T", subtitle: "S", body: "<p>B</p>" }, 1000);
    const ov = await getOverride(db, "subagents");
    expect(ov).not.toBeNull();
    expect(ov!.title).toBe("T");
    expect(ov!.subtitle).toBe("S");
    expect(ov!.body).toBe("<p>B</p>");
    expect(ov!.updated_at).toBe(1000);
  });

  it("upsert overwrites an existing row (no duplicate)", async () => {
    const db = makeDb();
    await putOverride(db, "subagents", { title: "one", subtitle: "", body: "x" }, 1);
    await putOverride(db, "subagents", { title: "two", subtitle: "", body: "y" }, 2);
    const ov = await getOverride(db, "subagents");
    expect(ov!.title).toBe("two");
    expect(ov!.body).toBe("y");
    expect(ov!.updated_at).toBe(2);
    const rows = await db.all("SELECT COUNT(*) AS n FROM info_page_overrides");
    expect(rows[0].n).toBe(1);
  });

  it("get returns null for an absent slug", async () => {
    const db = makeDb();
    expect(await getOverride(db, "nope")).toBeNull();
  });

  it("delete removes the override (revert)", async () => {
    const db = makeDb();
    await putOverride(db, "subagents", { title: "T", subtitle: "S", body: "B" }, 1);
    await deleteOverride(db, "subagents");
    expect(await getOverride(db, "subagents")).toBeNull();
  });

  it("getOverride swallows a missing-table error and returns null", async () => {
    const db = makeDb(false); // table never created
    expect(await getOverride(db, "subagents")).toBeNull();
  });
});
