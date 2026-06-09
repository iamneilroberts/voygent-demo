import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db, BatchOp } from "./db";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, "../../migrations/0001_access_control.sql");

/** A faithful in-memory Db for tests — real SQLite, same dialect as D1. */
export function makeTestDb(): Db {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(MIGRATION, "utf8"));
  return {
    async run(sql, params = []) {
      const r = sqlite.prepare(sql).run(...(params as any[]));
      return { changes: r.changes };
    },
    async first(sql, params = []) {
      return (sqlite.prepare(sql).get(...(params as any[])) as any) ?? null;
    },
    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...(params as any[])) as any[];
    },
    async batch(ops: BatchOp[]) {
      const tx = sqlite.transaction(() => {
        for (const o of ops) sqlite.prepare(o.sql).run(...((o.params ?? []) as any[]));
      });
      tx(); // throws (and rolls back) if any statement violates a constraint
    },
  };
}
