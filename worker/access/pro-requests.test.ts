import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";
import { createCode } from "./codes";
import { insertProRequest, listPending, getRequest, markGranted, markDenied } from "./pro-requests";

describe("pro_requests store", () => {
  it("inserts a pending request, lists it, grants it", async () => {
    const db = makeTestDb();
    await insertProRequest(db, { id: "r1", name: "Jo", email: "jo@x.com",
      company: "Acme", role: "VP", useCase: "evaluate", note: "", ipHash: "IP",
      createdAt: "2026-06-10T00:00:00Z" });
    const pending = await listPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe("jo@x.com");

    // granted_code_id REFERENCES codes(id) — a real code must exist first (as in production grant).
    await createCode(db, { id: "self-xyz", label: "Jo", view: "default", tier: "pro",
      dailyMicros: 1, totalMicros: 1, expiresAt: null }, "hk", "2026-06-10T00:30:00Z");
    await markGranted(db, "r1", "self-xyz", "2026-06-10T01:00:00Z");
    const after = await getRequest(db, "r1");
    expect(after?.status).toBe("granted");
    expect(after?.granted_code_id).toBe("self-xyz");
    expect(await listPending(db)).toHaveLength(0);
  });

  it("denies a request", async () => {
    const db = makeTestDb();
    await insertProRequest(db, { id: "r2", name: "K", email: "k@x.com",
      company: "", role: "", useCase: "", note: "", ipHash: "IP", createdAt: "2026-06-10T00:00:00Z" });
    await markDenied(db, "r2", "2026-06-10T01:00:00Z");
    expect((await getRequest(db, "r2"))?.status).toBe("denied");
  });
});
