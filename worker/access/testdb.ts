import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Db, BatchOp } from "./db";

const HERE = dirname(fileURLToPath(import.meta.url));
// DEMO_DB migrations, in apply order. (0002_info_overrides targets a different
// table set and 0002_stats_code_id targets STATS_DB — neither belongs here.)
const MIGRATIONS = [
  "0001_access_control.sql",
  "0003_tier.sql",
  "0004_onboarding.sql",
  "0005_pro_requests.sql",
].map((f) => join(HERE, "../../migrations", f));

/** A faithful in-memory Db for tests — real SQLite, same dialect as D1. */
export function makeTestDb(): Db {
  const sqlite = new Database(":memory:");
  for (const m of MIGRATIONS) sqlite.exec(readFileSync(m, "utf8"));
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
