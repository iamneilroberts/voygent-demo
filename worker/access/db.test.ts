import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";

describe("Db (test adapter)", () => {
  it("applies the migration and round-trips a row", async () => {
    const db = makeTestDb();
    const r = await db.run(
      "INSERT INTO codes (id, code_hash, label, daily_micros, total_micros, created_at) VALUES (?,?,?,?,?,?)",
      ["c1", "h", "L", 1_000_000, 5_000_000, "2026-06-09T00:00:00Z"],
    );
    expect(r.changes).toBe(1);
    const row = await db.first<{ id: string }>("SELECT id FROM codes WHERE id=?", ["c1"]);
    expect(row?.id).toBe("c1");
  });
  it("batch rolls back atomically on a constraint violation", async () => {
    const db = makeTestDb();
    await db.run(
      "INSERT INTO codes (id, code_hash, label, daily_micros, total_micros, created_at) VALUES ('c1','h','L',1,1,'t')",
    );
    await expect(db.batch([
      { sql: "UPDATE codes SET label='X' WHERE id='c1'" },
      { sql: "INSERT INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros) VALUES ('c1','e1','t',1,1)" },
      { sql: "INSERT INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros) VALUES ('c1','e1','t',1,1)" },
    ])).rejects.toThrow();
    const row = await db.first<{ label: string }>("SELECT label FROM codes WHERE id='c1'");
    expect(row?.label).toBe("L"); // rolled back — the UPDATE did not stick
  });
});
