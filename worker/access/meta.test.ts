import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";
import { createCode } from "./codes";
import { insertCodeMeta, countSignupsByIpHashSince } from "./meta";

const HASH_KEY = "hk";

async function seedCode(db: any, id: string) {
  await createCode(db, { id, label: id, view: "default",
    dailyMicros: 2_000_000, totalMicros: 20_000_000, expiresAt: null },
    HASH_KEY, "2026-06-10T00:00:00Z");
}

describe("code_meta", () => {
  it("inserts and is countable by ip_hash since a cutoff", async () => {
    const db = makeTestDb();
    await seedCode(db, "c1"); await seedCode(db, "c2");
    await insertCodeMeta(db, { codeId: "c1", ownerName: "A", ownerEmail: "a@x.com",
      role: "pro", note: "hi", source: "self-serve", ipHash: "IP1", createdAt: "2026-06-10T09:00:00Z" });
    await insertCodeMeta(db, { codeId: "c2", ownerName: "B", ownerEmail: "b@x.com",
      role: "", note: "", source: "self-serve", ipHash: "IP1", createdAt: "2026-06-10T10:00:00Z" });
    const n = await countSignupsByIpHashSince(db, "IP1", "2026-06-10T00:00:00Z");
    expect(n).toBe(2);
    const none = await countSignupsByIpHashSince(db, "IP2", "2026-06-10T00:00:00Z");
    expect(none).toBe(0);
  });
});
