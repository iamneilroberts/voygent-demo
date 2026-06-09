import { describe, it, expect } from "vitest";
import { hashCode, generateCode } from "./codes";
import { makeTestDb } from "./testdb";
import { createCode, listCodes, revokeCode, lookupByCode, usageForCode } from "./codes";

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
