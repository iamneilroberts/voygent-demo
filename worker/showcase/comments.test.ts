import { describe, it, expect } from "vitest";
import { makeTestDb } from "../access/testdb";
import {
  validateComment,
  hashIp,
  withinRateLimit,
  insertPending,
  listApproved,
  listPending,
  moderate,
  pruneOld,
  normalizeSectionRef,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  COMMENT_TTL_MS,
} from "./comments";

const KNOWN = new Set(["overview", "comments"]);

describe("validateComment", () => {
  it("rejects a filled honeypot", () => {
    expect(validateComment({ name: "a", body: "b", website: "x" })).toEqual({ ok: false, reason: "honeypot" });
  });
  it("rejects empty name or body", () => {
    expect(validateComment({ name: "  ", body: "b", website: "" }).ok).toBe(false);
    expect(validateComment({ name: "a", body: "", website: "" }).ok).toBe(false);
  });
  it("rejects over-length", () => {
    expect(validateComment({ name: "x".repeat(81), body: "b", website: "" })).toEqual({ ok: false, reason: "too_long" });
    expect(validateComment({ name: "a", body: "y".repeat(2001), website: "" })).toEqual({ ok: false, reason: "too_long" });
  });
  it("trims and accepts a valid comment", () => {
    expect(validateComment({ name: " Neil ", body: " hi ", website: "" })).toEqual({ ok: true, name: "Neil", body: "hi" });
  });
});

describe("hashIp", () => {
  it("is stable for the same normalized IP and differs across IPs; never returns the raw IP", async () => {
    const a1 = await hashIp("1.2.3.4", "salt");
    const a2 = await hashIp("1.2.3.4", "salt");
    const b = await hashIp("5.6.7.8", "salt");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).not.toContain("1.2.3.4");
    expect(a1).toMatch(/^[0-9a-f]{64}$/);
  });
  it("normalizes IPv6 zone/brackets/case", async () => {
    const x = await hashIp("[2001:DB8::1]%eth0", "salt");
    const y = await hashIp("2001:db8::1", "salt");
    expect(x).toBe(y);
  });
});

describe("normalizeSectionRef", () => {
  it("passes a known id, nulls an unknown id, nulls empty", () => {
    expect(normalizeSectionRef("overview", KNOWN)).toBe("overview");
    expect(normalizeSectionRef("evil", KNOWN)).toBeNull();
    expect(normalizeSectionRef("", KNOWN)).toBeNull();
    expect(normalizeSectionRef(null, KNOWN)).toBeNull();
  });
});

describe("comment store (real SQLite)", () => {
  it("insertPending -> listPending shows it; listApproved does not", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "c1", createdAt: 1000, name: "N", body: "B", ipHash: "h", sectionRef: "overview" });
    expect((await listApproved(db, 10)).length).toBe(0);
    const pend = await listPending(db, 10);
    expect(pend.map((r) => r.id)).toEqual(["c1"]);
  });

  it("moderate approve makes it visible and stamps moderated_at/by; rejecting a non-pending row is a no-op", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "c1", createdAt: 1000, name: "N", body: "B", ipHash: "h", sectionRef: null });
    expect(await moderate(db, "c1", "approve", "admin", 2000)).toBe(true);
    const ok = await listApproved(db, 10);
    expect(ok.map((r) => r.id)).toEqual(["c1"]);
    expect(await moderate(db, "c1", "reject", "admin", 3000)).toBe(false);
    expect((await listApproved(db, 10)).length).toBe(1);
  });

  it("withinRateLimit counts inserts in the window", async () => {
    const db = makeTestDb();
    const now = 1_000_000;
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await insertPending(db, { id: `r${i}`, createdAt: now - 1000, name: "N", body: "B", ipHash: "ip", sectionRef: null });
    }
    expect(await withinRateLimit(db, "ip", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)).toBe(false);
    expect(await withinRateLimit(db, "other", now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)).toBe(true);
  });

  it("pruneOld deletes old pending/rejected but keeps approved", async () => {
    const db = makeTestDb();
    const now = COMMENT_TTL_MS + 10_000;
    await insertPending(db, { id: "old-pending", createdAt: 1, name: "N", body: "B", ipHash: "h", sectionRef: null });
    await insertPending(db, { id: "old-approved", createdAt: 1, name: "N", body: "B", ipHash: "h", sectionRef: null });
    await moderate(db, "old-approved", "approve", "admin", 2);
    await insertPending(db, { id: "fresh", createdAt: now - 1000, name: "N", body: "B", ipHash: "h", sectionRef: null });
    await pruneOld(db, now, COMMENT_TTL_MS);
    const pend = (await listPending(db, 100)).map((r) => r.id);
    const appr = (await listApproved(db, 100)).map((r) => r.id);
    expect(pend).toEqual(["fresh"]);
    expect(appr).toEqual(["old-approved"]);
  });
});
