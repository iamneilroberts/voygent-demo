import { describe, it, expect } from "vitest";
import { hashCode, generateCode } from "./codes";
import { makeTestDb } from "./testdb";
import { createCode, listCodes, revokeCode, lookupByCode, usageForCode } from "./codes";
import { admit, admissionReason } from "./codes";
import { reconcile } from "./codes";

describe("code crypto", () => {
  it("hashCode is deterministic and key-sensitive", async () => {
    const a = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-1");
    const b = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-1");
    const c = await hashCode("k7m2-9x4p-w3rq-h8tn", "key-2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // hex SHA-256
  });
  it("generateCode returns grouped high-entropy base32 (>=128 bits)", () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{4}(-[0-9a-hjkmnp-tv-z]{4}){3}$/i);
    const s = new Set(Array.from({ length: 200 }, () => generateCode()));
    expect(s.size).toBe(200); // no collisions across 200 draws
  });
});

const HASH_KEY = "test-hash-key";

describe("code store", () => {
  it("creates a code (storing only the hash) and lists it", async () => {
    const db = makeTestDb();
    const { code } = await createCode(db, {
      id: "advisor", label: "Advisor demo", view: "advisor",
      dailyMicros: 5_000_000, totalMicros: 25_000_000, expiresAt: null,
    }, HASH_KEY, "2026-06-09T00:00:00Z");
    expect(code).toMatch(/-/); // a real plaintext was returned
    const rows = await listCodes(db);
    expect(rows).toHaveLength(1);
    expect((rows[0] as any).code_hash).toBeUndefined(); // hash never leaves the store
    expect(rows[0].label).toBe("Advisor demo");
  });

  it("lookupByCode resolves a live code and rejects expired/revoked", async () => {
    const db = makeTestDb();
    const { code } = await createCode(db, {
      id: "c", label: "L", view: "default",
      dailyMicros: 1_000_000, totalMicros: 1_000_000, expiresAt: null,
    }, HASH_KEY, "2026-06-09T00:00:00Z");
    expect((await lookupByCode(db, code, HASH_KEY, "2026-06-09T12:00:00Z"))?.id).toBe("c");
    await revokeCode(db, "c");
    expect(await lookupByCode(db, code, HASH_KEY, "2026-06-09T12:00:00Z")).toBeNull();
  });

  it("usageForCode returns events since a timestamp", async () => {
    const db = makeTestDb();
    await createCode(db, { id: "c", label: "L", view: "default", dailyMicros: 1, totalMicros: 1, expiresAt: null }, HASH_KEY, "t");
    await db.run(
      "INSERT INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros) VALUES ('c','e1','2026-06-09T10:00:00Z',1,2)",
    );
    const events = await usageForCode(db, "c", "2026-06-09T00:00:00Z");
    expect(events).toHaveLength(1);
    expect(events[0].actual_micros).toBe(2);
  });
});

async function seed(db: Awaited<ReturnType<typeof makeTestDb>>, over: Partial<any> = {}) {
  await createCode(db, {
    id: "c", label: "L", view: "default",
    dailyMicros: over.dailyMicros ?? 1_000_000,   // $1/day
    totalMicros: over.totalMicros ?? 3_000_000,   // $3 lifetime
    expiresAt: over.expiresAt ?? null,
  }, HASH_KEY, "2026-06-09T00:00:00Z");
  if (over.revoked) await revokeCode(db, "c");
}

describe("admission", () => {
  // NOTE: better-sqlite3 serializes calls, so these tests prove the SEQUENTIAL cap
  // arithmetic + day rollover, NOT the concurrency property. Safety under concurrent
  // /chat rests on D1 routing all writes to the single primary (single-statement
  // conditional UPDATE) — exercise that with a real-D1 race test at deploy (Task 15).
  const NOW = "2026-06-09T12:00:00Z";
  const TODAY = "2026-06-09";
  const EST = 200_000; // $0.20 reservation

  it("admits up to the daily cap then refuses, bounded by the cap", async () => {
    const db = makeTestDb(); await seed(db); // $1/day, EST $0.20 → 5 admits
    let admitted = 0;
    for (let i = 0; i < 8; i++) if (await admit(db, "c", EST, NOW, TODAY)) admitted++;
    expect(admitted).toBe(5);
    expect(await admissionReason(db, "c", EST, NOW, TODAY)).toBe("daily");
  });

  it("rolls the daily window when day_date is stale without touching lifetime", async () => {
    const db = makeTestDb(); await seed(db);
    expect(await admit(db, "c", EST, "2026-06-08T23:00:00Z", "2026-06-08")).toBe(true);
    const next = await admit(db, "c", EST, NOW, TODAY); // new day → daily resets
    expect(next).toBe(true);
    const row = await db.first<{ day_spent: number; lifetime_spent: number }>(
      "SELECT day_spent, lifetime_spent FROM codes WHERE id='c'");
    expect(row?.day_spent).toBe(EST);        // window reset to just today's one booking
    expect(row?.lifetime_spent).toBe(2 * EST); // lifetime accumulates across days
  });

  it("refuses on lifetime cap even when daily has room", async () => {
    const db = makeTestDb(); await seed(db, { dailyMicros: 10_000_000, totalMicros: 500_000 });
    expect(await admit(db, "c", 300_000, NOW, TODAY)).toBe(true);
    expect(await admit(db, "c", 300_000, NOW, TODAY)).toBe(false); // 600k > 500k lifetime
    expect(await admissionReason(db, "c", 300_000, NOW, TODAY)).toBe("lifetime");
  });

  it("refuses revoked and expired codes", async () => {
    const db1 = makeTestDb(); await seed(db1, { revoked: true });
    expect(await admit(db1, "c", EST, NOW, TODAY)).toBe(false);
    expect(await admissionReason(db1, "c", EST, NOW, TODAY)).toBe("revoked");

    const db2 = makeTestDb(); await seed(db2, { expiresAt: "2026-06-09T06:00:00Z" });
    expect(await admit(db2, "c", EST, NOW, TODAY)).toBe(false); // NOW is after expiry
    expect(await admissionReason(db2, "c", EST, NOW, TODAY)).toBe("expired");
  });

  it("clamps a negative estimate to zero (never refunds budget)", async () => {
    const db = makeTestDb(); await seed(db, { dailyMicros: 1_000_000, totalMicros: 1_000_000 });
    await admit(db, "c", 500_000, NOW, TODAY); // book $0.50
    expect(await admit(db, "c", -400_000, NOW, TODAY)).toBe(true); // clamped to 0 → admits, books nothing
    const row = await db.first<{ day_spent: number; lifetime_spent: number }>("SELECT day_spent, lifetime_spent FROM codes WHERE id='c'");
    expect(row?.day_spent).toBe(500_000);      // unchanged — no refund
    expect(row?.lifetime_spent).toBe(500_000);
  });
});

describe("reconcile", () => {
  const NOW = "2026-06-09T12:00:00Z";
  const TODAY = "2026-06-09";

  it("trues the estimate to actual cost and records history", async () => {
    const db = makeTestDb(); await seed(db, { dailyMicros: 10_000_000, totalMicros: 10_000_000 });
    await admit(db, "c", 200_000, NOW, TODAY); // booked $0.20
    await reconcile(db, { codeId: "c", exchangeId: "e1", estMicros: 200_000, actualMicros: 50_000,
      model: "claude-haiku-4-5", inputTokens: 100, outputTokens: 20, ts: NOW });
    const row = await db.first<{ day_spent: number; lifetime_spent: number }>(
      "SELECT day_spent, lifetime_spent FROM codes WHERE id='c'");
    expect(row?.day_spent).toBe(50_000);      // 200k - 200k + 50k
    expect(row?.lifetime_spent).toBe(50_000);
    const events = await usageForCode(db, "c", "2026-06-09T00:00:00Z");
    expect(events[0].actual_micros).toBe(50_000);
  });

  it("is idempotent: a duplicate reconcile does not double-apply", async () => {
    const db = makeTestDb(); await seed(db, { dailyMicros: 10_000_000, totalMicros: 10_000_000 });
    await admit(db, "c", 200_000, NOW, TODAY);
    const args = { codeId: "c", exchangeId: "e1", estMicros: 200_000, actualMicros: 50_000,
      model: null, inputTokens: null, outputTokens: null, ts: NOW };
    await reconcile(db, args);
    await reconcile(db, args); // second call: UNIQUE(exchange_id) aborts the batch, swallowed
    const row = await db.first<{ day_spent: number }>("SELECT day_spent FROM codes WHERE id='c'");
    expect(row?.day_spent).toBe(50_000); // not 200k-400k+... — applied exactly once
  });
});
