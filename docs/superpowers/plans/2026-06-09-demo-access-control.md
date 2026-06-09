# Demo Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the public `voygent-demo` Worker behind shareable high-entropy passcodes, each with its own daily + lifetime USD budget enforced *before* spend, plus a Cloudflare-Access-gated admin console to mint/revoke/monitor codes — without losing the existing global $5/day backstop.

**Architecture:** A passcode hashes to a D1 row carrying its own budget ledger. `/auth` validates the code and issues an HMAC-signed `__Host-` cookie containing a **server-issued** session id. `/chat` admits an exchange via a *single conditional `UPDATE`* routed to D1's primary that atomically checks live/budget and books a conservative estimate (reserve), then the Durable Object trues the estimate to actual cost in a D1 `batch()` (reconcile). The Durable Object is keyed by the trusted session id, not a client param. Admin is a Worker-served HTML page + JSON API behind Cloudflare Access.

**Tech Stack:** Cloudflare Workers + Durable Objects + **D1 (SQLite)**, TypeScript, Web Crypto (HMAC-SHA256), React SPA (Vite), vitest. Tests exercise real SQL via an in-memory `better-sqlite3` adapter behind a tiny `Db` port (D1 is SQLite, so the SQL semantics — including `meta.changes` and `batch()` atomicity — are faithful).

**Money is integer micro-USD everywhere** (1 USD = 1,000,000 micros). No floats in the ledger.

---

## Shared interfaces (defined here, used across tasks — keep names exact)

```ts
// worker/access/db.ts
export interface DbResult { changes: number }
export interface BatchOp { sql: string; params?: unknown[] }
export interface Db {
  run(sql: string, params?: unknown[]): Promise<DbResult>;
  first<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  batch(ops: BatchOp[]): Promise<void>;
}

// worker/access/codes.ts
export interface CodeRow {
  id: string; label: string; view: string;
  daily_micros: number; total_micros: number;
  day_date: string | null; day_spent: number; lifetime_spent: number;
  expires_at: string | null; revoked: number; created_at: string;
}
export interface SpendEvent {
  exchange_id: string; ts: string; est_micros: number; actual_micros: number;
  model: string | null; input_tokens: number | null; output_tokens: number | null;
}
export type AdmissionReason = "ok" | "revoked" | "expired" | "daily" | "lifetime";

// worker/access/session.ts
export interface SessionClaims { sid: string; codeId: string }
```

## File structure

| File | Responsibility |
|---|---|
| `migrations/0001_access_control.sql` | D1 schema (`codes`, `spend_events`) |
| `worker/access/money.ts` | micro-USD conversions + formatting |
| `worker/access/db.ts` | `Db` port + `D1Db` adapter over `D1Database` |
| `worker/access/testdb.ts` | test-only in-memory `Db` over `better-sqlite3` + migration loader |
| `worker/access/codes.ts` | hashing, code generation, admit/reconcile, admin CRUD |
| `worker/access/session.ts` | signed-cookie issue/verify, key ring, sid |
| `worker/access/http.ts` | Origin/CSRF guard, cookie header read/serialize, JSON helpers |
| `worker/access/admin.ts` | admin JSON API handlers |
| `worker/access/admin-page.ts` | self-contained admin HTML (vanilla JS) |
| `worker/index.ts` (modify) | routes: `/auth`, `/auth/me`, `/chat` guard+admission, `/admin*`; remove CORS |
| `worker/session-do.ts` (modify) | session id from trusted header; reconcile in `finally` |
| `web/src/lib/gate.ts` | read code from URL fragment (+strip), authenticate, session check |
| `web/src/Gate.tsx` | passcode gate UI |
| `web/src/App.tsx` (modify) | render Gate until authed; drop client session param |
| `web/src/sse-client.ts` (modify) | same-origin credentialed `/chat`, 401 → typed error |
| `wrangler.toml` (modify) | `DEMO_DB` binding, `APP_ORIGIN` var |

---

## Task 1: D1 binding, migration, and Env wiring

**Files:**
- Create: `migrations/0001_access_control.sql`
- Modify: `wrangler.toml`
- Modify: `worker/index.ts:4` (Env interface), `worker/session-do.ts:15-22` (Env interface)

- [ ] **Step 1: Write the migration**

Create `migrations/0001_access_control.sql`:

```sql
CREATE TABLE codes (
  id             TEXT PRIMARY KEY,
  code_hash      TEXT NOT NULL,
  label          TEXT NOT NULL,
  view           TEXT NOT NULL DEFAULT 'default',
  daily_micros   INTEGER NOT NULL,
  total_micros   INTEGER NOT NULL,
  day_date       TEXT,
  day_spent      INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT,
  revoked        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_codes_hash ON codes(code_hash);

CREATE TABLE spend_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id       TEXT NOT NULL REFERENCES codes(id),
  exchange_id   TEXT NOT NULL UNIQUE,
  ts            TEXT NOT NULL,
  est_micros    INTEGER NOT NULL,
  actual_micros INTEGER NOT NULL,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER
);
CREATE INDEX idx_spend_code_ts ON spend_events(code_id, ts);
```

- [ ] **Step 2: Add the D1 binding + APP_ORIGIN var to `wrangler.toml`**

Append to `wrangler.toml` (top-level, after the existing `[assets]` block):

```toml
[[d1_databases]]
binding = "DEMO_DB"
database_name = "voygent-demo"
database_id = "PLACEHOLDER_SET_AFTER_d1_create"  # filled in during deploy (Task 15)

[vars]
# The exact origin the SPA is served from. Used by the Origin/CSRF guard.
# Local: http://localhost:8787 (wrangler dev). Prod: set to the deployed origin.
APP_ORIGIN = "http://localhost:8787"
```

Also extend the `# Secrets` comment list to include `CODE_HASH_KEY`, `SESSION_SIGN_KEY`, optional `ADMIN_TOKEN`, optional `EST_EXCHANGE_MICROS`.

- [ ] **Step 3: Extend both Env interfaces**

In `worker/index.ts`, replace the Env interface (line 4):

```ts
interface Env {
  SESSION: DurableObjectNamespace;
  DEMO_DISABLED?: string;
  DEMO_DB: D1Database;
  CODE_HASH_KEY: string;
  SESSION_SIGN_KEY: string;
  ADMIN_TOKEN?: string;
  APP_ORIGIN: string;
  EST_EXCHANGE_MICROS?: string;
}
```

In `worker/session-do.ts`, add to the existing `interface Env` (after line 21):

```ts
  DEMO_DB: D1Database;
  EST_EXCHANGE_MICROS?: string;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no references to undefined types; `D1Database` comes from `@cloudflare/workers-types`).

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_access_control.sql wrangler.toml worker/index.ts worker/session-do.ts
git commit -m "feat(access): add D1 binding, access-control migration, Env wiring"
```

---

## Task 2: micro-USD money helpers

**Files:**
- Create: `worker/access/money.ts`
- Test: `worker/access/money.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/access/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { usdToMicros, microsToUsd, formatUsd } from "./money";

describe("money", () => {
  it("converts USD to integer micros and back", () => {
    expect(usdToMicros(5)).toBe(5_000_000);
    expect(usdToMicros(0.0123)).toBe(12_300);
    expect(microsToUsd(2_500_000)).toBeCloseTo(2.5, 6);
  });
  it("rounds to the nearest micro (no float drift)", () => {
    expect(Number.isInteger(usdToMicros(0.1 + 0.2))).toBe(true);
  });
  it("formats micros as a dollar string", () => {
    expect(formatUsd(4_100_000)).toBe("$4.10");
    expect(formatUsd(0)).toBe("$0.00");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run worker/access/money.test.ts`
Expected: FAIL — `Cannot find module './money'`.

- [ ] **Step 3: Implement `money.ts`**

Create `worker/access/money.ts`:

```ts
export function usdToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}
export function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}
export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run worker/access/money.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/money.ts worker/access/money.test.ts
git commit -m "feat(access): micro-USD money helpers"
```

---

## Task 3: Db port + D1 adapter + in-memory test Db

**Files:**
- Create: `worker/access/db.ts`
- Create: `worker/access/testdb.ts`
- Modify: `package.json` (add `better-sqlite3` + `@types/better-sqlite3` devDeps)
- Test: `worker/access/db.test.ts`

- [ ] **Step 1: Install the test sqlite driver**

Run: `npm i -D better-sqlite3 @types/better-sqlite3`
Expected: added to devDependencies.

- [ ] **Step 2: Write `db.ts` (port + D1 adapter)**

Create `worker/access/db.ts`:

```ts
export interface DbResult { changes: number }
export interface BatchOp { sql: string; params?: unknown[] }
export interface Db {
  run(sql: string, params?: unknown[]): Promise<DbResult>;
  first<T = any>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  batch(ops: BatchOp[]): Promise<void>;
}

/** Production adapter over Cloudflare D1. Writes always hit the primary. */
export class D1Db implements Db {
  constructor(private d1: D1Database) {}
  async run(sql: string, params: unknown[] = []): Promise<DbResult> {
    const r = await this.d1.prepare(sql).bind(...params).run();
    return { changes: r.meta.changes ?? 0 };
  }
  async first<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.d1.prepare(sql).bind(...params).first<T>()) ?? null;
  }
  async all<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.d1.prepare(sql).bind(...params).all<T>();
    return r.results ?? [];
  }
  async batch(ops: BatchOp[]): Promise<void> {
    await this.d1.batch(ops.map((o) => this.d1.prepare(o.sql).bind(...(o.params ?? []))));
  }
}
```

- [ ] **Step 3: Write `testdb.ts` (in-memory adapter + migration loader)**

Create `worker/access/testdb.ts`:

```ts
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
```

- [ ] **Step 4: Write the round-trip test**

Create `worker/access/db.test.ts`:

```ts
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
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run worker/access/db.test.ts`
Expected: PASS (2 tests). Confirms migration loads and `batch()` is atomic (the property the reconcile step relies on).

- [ ] **Step 6: Commit**

```bash
git add worker/access/db.ts worker/access/testdb.ts worker/access/db.test.ts package.json package-lock.json
git commit -m "feat(access): Db port, D1 adapter, in-memory test adapter"
```

---

## Task 4: code hashing + high-entropy generation

**Files:**
- Modify: `worker/access/codes.ts` (create)
- Test: `worker/access/codes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/access/codes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashCode, generateCode } from "./codes";

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
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: FAIL — `Cannot find module './codes'`.

- [ ] **Step 3: Implement the crypto half of `codes.ts`**

Create `worker/access/codes.ts`:

```ts
import type { Db } from "./db";

export interface CodeRow {
  id: string; label: string; view: string;
  daily_micros: number; total_micros: number;
  day_date: string | null; day_spent: number; lifetime_spent: number;
  expires_at: string | null; revoked: number; created_at: string;
}
export interface SpendEvent {
  exchange_id: string; ts: string; est_micros: number; actual_micros: number;
  model: string | null; input_tokens: number | null; output_tokens: number | null;
}
export type AdmissionReason = "ok" | "revoked" | "expired" | "daily" | "lifetime";

const enc = new TextEncoder();

export async function hashCode(plaintext: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(plaintext));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Crockford base32 alphabet (no I, L, O, U — unambiguous).
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** 20 chars of base32 ≈ 100 bits printed, drawn from 160 random bits → grouped 4-4-4-4. */
export function generateCode(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] & 31];
  return out.replace(/(.{4})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4");
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/codes.ts worker/access/codes.test.ts
git commit -m "feat(access): passcode hashing + high-entropy code generation"
```

---

## Task 5: code CRUD + auth lookup

**Files:**
- Modify: `worker/access/codes.ts`
- Test: `worker/access/codes.test.ts`

- [ ] **Step 1: Add failing CRUD tests**

Append to `worker/access/codes.test.ts`:

```ts
import { makeTestDb } from "./testdb";
import { createCode, listCodes, revokeCode, lookupByCode, usageForCode } from "./codes";

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
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: FAIL — `createCode` etc. not exported.

- [ ] **Step 3: Implement CRUD in `codes.ts`**

Append to `worker/access/codes.ts`:

```ts
export interface NewCode {
  id: string; label: string; view: string;
  dailyMicros: number; totalMicros: number; expiresAt: string | null;
}

export async function createCode(
  db: Db, input: NewCode, hashKey: string, nowIso: string,
): Promise<{ code: string }> {
  const code = generateCode();
  const code_hash = await hashCode(code, hashKey);
  await db.run(
    `INSERT INTO codes (id, code_hash, label, view, daily_micros, total_micros, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [input.id, code_hash, input.label, input.view, input.dailyMicros, input.totalMicros, nowIso],
  );
  if (input.expiresAt) {
    await db.run("UPDATE codes SET expires_at=? WHERE id=?", [input.expiresAt, input.id]);
  }
  return { code };
}

export async function revokeCode(db: Db, id: string): Promise<void> {
  await db.run("UPDATE codes SET revoked=1 WHERE id=?", [id]);
}

/** Admin list — deliberately omits code_hash so the secret material never leaves the store. */
export async function listCodes(db: Db): Promise<CodeRow[]> {
  return db.all<CodeRow>(
    `SELECT id, label, view, daily_micros, total_micros, day_date, day_spent,
            lifetime_spent, expires_at, revoked, created_at FROM codes ORDER BY created_at DESC`,
  );
}

export async function usageForCode(db: Db, id: string, sinceTs: string): Promise<SpendEvent[]> {
  return db.all<SpendEvent>(
    `SELECT exchange_id, ts, est_micros, actual_micros, model, input_tokens, output_tokens
     FROM spend_events WHERE code_id=? AND ts>=? ORDER BY ts DESC`,
    [id, sinceTs],
  );
}

/** /auth lookup: live (not revoked, not expired) code by plaintext. */
export async function lookupByCode(
  db: Db, plaintext: string, hashKey: string, nowIso: string,
): Promise<{ id: string; view: string } | null> {
  const code_hash = await hashCode(plaintext, hashKey);
  return db.first<{ id: string; view: string }>(
    `SELECT id, view FROM codes
      WHERE code_hash=? AND revoked=0 AND (expires_at IS NULL OR expires_at > ?)`,
    [code_hash, nowIso],
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: PASS (all code-store tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/codes.ts worker/access/codes.test.ts
git commit -m "feat(access): code CRUD + live-code auth lookup"
```

---

## Task 6: admission — the conditional write (concurrency crux)

**Files:**
- Modify: `worker/access/codes.ts`
- Test: `worker/access/codes.test.ts`

- [ ] **Step 1: Add failing admission tests**

Append to `worker/access/codes.test.ts`:

```ts
import { admit, admissionReason } from "./codes";

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
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: FAIL — `admit` / `admissionReason` not exported.

- [ ] **Step 3: Implement admission**

Append to `worker/access/codes.ts`:

```ts
/**
 * Reserve budget for one exchange. A single conditional UPDATE (always routed to
 * D1's primary) atomically verifies live+budget and books `estMicros`. SQLite/D1
 * evaluate SET/WHERE against the PRE-update row, so the CASE correctly resets the
 * daily window when day_date is stale. Returns true iff exactly one row changed.
 */
export async function admit(
  db: Db, codeId: string, estMicros: number, nowIso: string, today: string,
): Promise<boolean> {
  const r = await db.run(
    `UPDATE codes
        SET day_spent      = (CASE WHEN day_date = ? THEN day_spent ELSE 0 END) + ?,
            day_date       = ?,
            lifetime_spent = lifetime_spent + ?
      WHERE id = ?
        AND revoked = 0
        AND (expires_at IS NULL OR expires_at > ?)
        AND (CASE WHEN day_date = ? THEN day_spent ELSE 0 END) + ? <= daily_micros
        AND lifetime_spent + ? <= total_micros`,
    [today, estMicros, today, estMicros, codeId, nowIso, today, estMicros, estMicros],
  );
  return r.changes === 1;
}

/** Only called after admit() returns false — classifies the 503 message. */
export async function admissionReason(
  db: Db, codeId: string, estMicros: number, nowIso: string, today: string,
): Promise<AdmissionReason> {
  const row = await db.first<CodeRow>("SELECT * FROM codes WHERE id=?", [codeId]);
  if (!row) return "revoked";
  if (row.revoked) return "revoked";
  if (row.expires_at && row.expires_at <= nowIso) return "expired";
  const dayBase = row.day_date === today ? row.day_spent : 0;
  if (dayBase + estMicros > row.daily_micros) return "daily";
  if (row.lifetime_spent + estMicros > row.total_micros) return "lifetime";
  return "ok";
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: PASS — including the bounded-admits test (proves spend is reserved before the exchange, fixing the Critical finding).

- [ ] **Step 5: Commit**

```bash
git add worker/access/codes.ts worker/access/codes.test.ts
git commit -m "feat(access): reserve-then-admit conditional write + reason classifier"
```

---

## Task 7: reconcile — atomic true-up + idempotency

**Files:**
- Modify: `worker/access/codes.ts`
- Test: `worker/access/codes.test.ts`

- [ ] **Step 1: Add failing reconcile tests**

Append to `worker/access/codes.test.ts`:

```ts
import { reconcile } from "./codes";

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
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: FAIL — `reconcile` not exported.

- [ ] **Step 3: Implement reconcile**

Append to `worker/access/codes.ts`:

```ts
export interface ReconcileArgs {
  codeId: string; exchangeId: string; estMicros: number; actualMicros: number;
  model: string | null; inputTokens: number | null; outputTokens: number | null; ts: string;
}

/**
 * Replace the reserved estimate with the real cost AND record history in one
 * atomic batch(). The plain INSERT (no OR IGNORE) on a UNIQUE exchange_id means a
 * duplicate reconcile throws → the whole batch rolls back → the UPDATE can't
 * double-apply. We swallow that specific case so retries are safe no-ops.
 */
export async function reconcile(db: Db, a: ReconcileArgs): Promise<void> {
  try {
    await db.batch([
      {
        sql: `UPDATE codes SET day_spent = day_spent - ? + ?, lifetime_spent = lifetime_spent - ? + ? WHERE id = ?`,
        params: [a.estMicros, a.actualMicros, a.estMicros, a.actualMicros, a.codeId],
      },
      {
        sql: `INSERT INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros, model, input_tokens, output_tokens)
              VALUES (?,?,?,?,?,?,?,?)`,
        params: [a.codeId, a.exchangeId, a.ts, a.estMicros, a.actualMicros, a.model, a.inputTokens, a.outputTokens],
      },
    ]);
  } catch (e) {
    // UNIQUE(exchange_id) violation = already reconciled. Any other error rethrows.
    if (!String((e as Error)?.message ?? "").toUpperCase().includes("UNIQUE")) throw e;
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: PASS (reconcile + idempotency).

- [ ] **Step 5: Commit**

```bash
git add worker/access/codes.ts worker/access/codes.test.ts
git commit -m "feat(access): atomic reconcile with idempotent spend history"
```

---

## Task 8: signed session cookie + key ring

**Files:**
- Create: `worker/access/session.ts`
- Test: `worker/access/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/access/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { issueCookie, verifyCookie, newSid, COOKIE_NAME } from "./session";

const RING = '{"1":"signing-key-one"}';

describe("session cookie", () => {
  it("round-trips claims through a valid signed cookie", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, 43200, true);
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    const claims = await verifyCookie(`${COOKIE_NAME}=${value}`, RING);
    expect(claims).toEqual({ sid: "s1", codeId: "c1" });
  });

  it("rejects tampered, wrong-key, and absent cookies", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, 43200, true);
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    expect(await verifyCookie(`${COOKIE_NAME}=${value}x`, RING)).toBeNull();          // tampered
    expect(await verifyCookie(`${COOKIE_NAME}=${value}`, '{"1":"other"}')).toBeNull(); // wrong key
    expect(await verifyCookie(null, RING)).toBeNull();                                 // absent
    expect(await verifyCookie("unrelated=1", RING)).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, -1, true); // already expired
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    expect(await verifyCookie(`${COOKIE_NAME}=${value}`, RING)).toBeNull();
  });

  it("newSid yields unique 128-bit ids", () => {
    const s = new Set(Array.from({ length: 100 }, () => newSid()));
    expect(s.size).toBe(100);
    expect(newSid()).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implement `session.ts`**

Create `worker/access/session.ts`:

```ts
export const COOKIE_NAME = "__Host-demo_session";
export interface SessionClaims { sid: string; codeId: string }

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlToStr = (s: string): string =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/"));

function parseRing(ring: string): Record<string, string> {
  try { const o = JSON.parse(ring); if (o && typeof o === "object") return o; } catch { /* plain */ }
  return { "0": ring }; // a bare secret string is kid "0"
}
function activeKid(ring: Record<string, string>): string {
  return Object.keys(ring).sort().pop()!; // highest kid is current
}
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function newSid(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function issueCookie(
  claims: SessionClaims, ring: string, ttlSec: number, secure: boolean, nowMs = Date.now(),
): Promise<string> {
  const r = parseRing(ring); const kid = activeKid(r);
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const payload = b64url(enc.encode(JSON.stringify({ sid: claims.sid, codeId: claims.codeId, exp, kid })));
  const sig = await hmac(r[kid], payload);
  const value = `${payload}.${sig}`;
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.max(0, ttlSec)}`];
  if (secure) attrs.push("Secure");
  return `${COOKIE_NAME}=${value}; ${attrs.join("; ")}`;
}

export async function verifyCookie(cookieHeader: string | null, ring: string, nowMs = Date.now()): Promise<SessionClaims | null> {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  let claims: { sid: string; codeId: string; exp: number; kid: string };
  try { claims = JSON.parse(b64urlToStr(payload)); } catch { return null; }
  const r = parseRing(ring);
  const key = r[claims.kid]; if (!key) return null;
  const expected = await hmac(key, payload);
  if (!timingSafeEqual(expected, sig)) return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(nowMs / 1000)) return null;
  return { sid: claims.sid, codeId: claims.codeId };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/session.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/session.ts worker/access/session.test.ts
git commit -m "feat(access): HMAC-signed __Host session cookie with key ring"
```

---

## Task 9: Origin/CSRF guard + HTTP helpers

**Files:**
- Create: `worker/access/http.ts`
- Test: `worker/access/http.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/access/http.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { guardMutation, getCookieHeader, json } from "./http";

const ORIGIN = "https://demo.voygent.ai";
function post(headers: Record<string, string>): Request {
  return new Request(`${ORIGIN}/auth`, { method: "POST", headers });
}

describe("guardMutation", () => {
  it("allows a same-origin JSON POST", () => {
    expect(guardMutation(post({ origin: ORIGIN, "content-type": "application/json" }), ORIGIN)).toBeNull();
  });
  it("rejects a missing/foreign Origin", () => {
    expect(guardMutation(post({ "content-type": "application/json" }), ORIGIN)?.status).toBe(403);
    expect(guardMutation(post({ origin: "https://evil.test", "content-type": "application/json" }), ORIGIN)?.status).toBe(403);
  });
  it("rejects a non-JSON content type", () => {
    expect(guardMutation(post({ origin: ORIGIN, "content-type": "text/plain" }), ORIGIN)?.status).toBe(403);
  });
});

describe("helpers", () => {
  it("reads the Cookie header", () => {
    const r = new Request(ORIGIN, { headers: { cookie: "a=1; b=2" } });
    expect(getCookieHeader(r)).toBe("a=1; b=2");
  });
  it("json() sets content-type and no-store", () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/http.test.ts`
Expected: FAIL — `Cannot find module './http'`.

- [ ] **Step 3: Implement `http.ts`**

Create `worker/access/http.ts`:

```ts
export function getCookieHeader(req: Request): string | null {
  return req.headers.get("cookie");
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export function text(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...extra } });
}

/** Returns a 403 Response if the mutation is cross-origin or not JSON; null if OK. */
export function guardMutation(req: Request, appOrigin: string): Response | null {
  if (req.headers.get("origin") !== appOrigin) return text("bad origin", 403);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return text("bad content-type", 403);
  return null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run worker/access/http.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/http.ts worker/access/http.test.ts
git commit -m "feat(access): Origin/CSRF mutation guard + HTTP helpers"
```

---

## Task 10: wire `/auth`, `/auth/me`, remove CORS

**Files:**
- Modify: `worker/index.ts`
- Test: `worker/auth-routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `worker/auth-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { makeTestDb } from "./access/testdb";
import { createCode } from "./access/codes";
import { COOKIE_NAME } from "./access/session";
import type { Db } from "./access/db";

const ORIGIN = "http://localhost:8787";
const HASH_KEY = "hk"; const RING = '{"1":"sign"}';

// Minimal Env for auth routes (no DO needed for /auth or /auth/me).
function envFor(db: Db): any {
  return {
    DEMO_DB: { /* admin uses our Db port via D1Db; here we pass a shim */ },
    CODE_HASH_KEY: HASH_KEY, SESSION_SIGN_KEY: RING, APP_ORIGIN: ORIGIN,
    __db: db, // index.ts uses makeDb(env) which returns env.__db in test (see Step 3)
  };
}
function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/auth", () => {
  let db: Db; let code: string;
  beforeEach(async () => {
    db = makeTestDb();
    ({ code } = await createCode(db, { id: "c", label: "L", view: "advisor", dailyMicros: 5_000_000, totalMicros: 25_000_000, expiresAt: null }, HASH_KEY, "2026-06-09T00:00:00Z"));
  });

  it("issues a session cookie for a valid code", async () => {
    const res = await worker.fetch(post("/auth", { code }), envFor(db));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(COOKIE_NAME);
  });
  it("returns a uniform 401 for an invalid code", async () => {
    const res = await worker.fetch(post("/auth", { code: "0000-0000-0000-0000" }), envFor(db));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("rejects a cross-origin POST with 403", async () => {
    const res = await worker.fetch(post("/auth", { code }, { origin: "https://evil.test" }), envFor(db));
    expect(res.status).toBe(403);
  });
  it("/auth/me reports authed=false without a cookie", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/auth/me`, { headers: { origin: ORIGIN } }), envFor(db));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/auth-routes.test.ts`
Expected: FAIL — routes not implemented / `makeDb` not present.

- [ ] **Step 3: Rewrite `worker/index.ts`**

Replace the entire body of `worker/index.ts` with:

```ts
export { SessionDO } from "./session-do";
import { buildPresets } from "./presets";
import { D1Db, type Db } from "./access/db";
import { lookupByCode, admit, admissionReason } from "./access/codes";
import { issueCookie, verifyCookie, newSid, COOKIE_NAME } from "./access/session";
import { guardMutation, getCookieHeader, json, text } from "./access/http";
import { handleAdmin } from "./access/admin";

interface Env {
  SESSION: DurableObjectNamespace;
  DEMO_DISABLED?: string;
  DEMO_DB: D1Database;
  CODE_HASH_KEY: string;
  SESSION_SIGN_KEY: string;
  ADMIN_TOKEN?: string;
  APP_ORIGIN: string;
  EST_EXCHANGE_MICROS?: string;
  __db?: Db; // test seam: inject an in-memory Db
}

const COOKIE_TTL_SEC = 43200; // 12h
const DEFAULT_EST_MICROS = 250_000; // $0.25 conservative per-exchange reservation

function makeDb(env: Env): Db { return env.__db ?? new D1Db(env.DEMO_DB); }
function estMicros(env: Env): number { return Number(env.EST_EXCHANGE_MICROS ?? DEFAULT_EST_MICROS); }
function utcDate(): string { return new Date().toISOString().slice(0, 10); }

async function dailyBudgetExceeded(env: Env): Promise<boolean> {
  try {
    const stub = env.SESSION.get(env.SESSION.idFromName("__budget__"));
    const res = await stub.fetch("https://do/__budget/status");
    return !!(await res.json<{ over: boolean }>()).over;
  } catch { return false; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const db = makeDb(env);
    const secure = env.APP_ORIGIN.startsWith("https://");

    // Public, no-auth endpoints.
    if (url.pathname === "/presets" && req.method === "GET") {
      return json(buildPresets(req));
    }

    // --- Auth ---
    if (url.pathname === "/auth" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      let code = "";
      try { code = (await req.json<{ code?: string }>()).code ?? ""; } catch { /* uniform 401 below */ }
      const hit = code ? await lookupByCode(db, code, env.CODE_HASH_KEY, new Date().toISOString()) : null;
      if (!hit) return text("this code isn't valid", 401); // uniform — no oracle
      const setCookie = await issueCookie({ sid: newSid(), codeId: hit.id }, env.SESSION_SIGN_KEY, COOKIE_TTL_SEC, secure);
      return json({ ok: true, view: hit.view }, 200, { "set-cookie": setCookie });
    }
    if (url.pathname === "/auth/me" && req.method === "GET") {
      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      return claims ? json({ ok: true }) : text("no session", 401);
    }

    // --- Admin (Cloudflare Access in front; ADMIN_TOKEN fallback inside) ---
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(req, env, db);
    }

    // --- Chat (authed + per-code admission) ---
    if (url.pathname === "/chat" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      if (env.DEMO_DISABLED) return text("The Voygent demo is paused right now. Check back soon.", 503);

      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      if (!claims) return text("unauthorized", 401);

      if (await dailyBudgetExceeded(env)) {
        return text("The Voygent demo has hit its daily limit. Check back tomorrow.", 503);
      }

      const est = estMicros(env);
      const admitted = await admit(db, claims.codeId, est, new Date().toISOString(), utcDate());
      if (!admitted) {
        const reason = await admissionReason(db, claims.codeId, est, new Date().toISOString(), utcDate());
        const msg = reason === "lifetime"
          ? "This demo code's total budget is used up."
          : reason === "daily"
          ? "This demo code's daily limit is reached — try again tomorrow."
          : "This demo code is no longer active.";
        return text(msg, 503);
      }

      // Route to the DO keyed by the TRUSTED server-issued sid (never a client param).
      const id = env.SESSION.idFromName(claims.sid);
      const forward = new Request(req.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-code-id": claims.codeId, "x-est-micros": String(est) },
        body: req.body,
      });
      return env.SESSION.get(id).fetch(forward);
    }

    return new Response("ok");
  },
};
```

> Note: CORS helper and `?session=` handling are intentionally gone (same-origin SPA, server-issued sid).

- [ ] **Step 4: Create a stub admin handler so index compiles**

Create `worker/access/admin.ts` (full impl in Task 12; stub now so Task 10 compiles & tests run):

```ts
import type { Db } from "./db";
import { text } from "./http";
export async function handleAdmin(_req: Request, _env: unknown, _db: Db): Promise<Response> {
  return text("admin not yet implemented", 501);
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run worker/auth-routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add worker/index.ts worker/access/admin.ts worker/auth-routes.test.ts
git commit -m "feat(access): /auth + /auth/me routes, server-issued sid, CORS removed"
```

---

## Task 11: `/chat` admission wiring + DO reconcile

**Files:**
- Modify: `worker/session-do.ts`
- Test: `worker/chat-admission.test.ts`

- [ ] **Step 1: Write the failing admission-gate test**

Create `worker/chat-admission.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { makeTestDb } from "./access/testdb";
import { createCode, admit } from "./access/codes";
import { issueCookie, COOKIE_NAME } from "./access/session";
import type { Db } from "./access/db";

const ORIGIN = "http://localhost:8787";
const HASH_KEY = "hk"; const RING = '{"1":"sign"}';

function fakeSessionNamespace() {
  return {
    idFromName: (n: string) => ({ name: n }),
    get: (_id: any) => ({ fetch: async () => new Response("stream", { status: 200 }) }),
  };
}
function envFor(db: Db): any {
  return {
    SESSION: fakeSessionNamespace(),
    DEMO_DB: {}, CODE_HASH_KEY: HASH_KEY, SESSION_SIGN_KEY: RING, APP_ORIGIN: ORIGIN,
    EST_EXCHANGE_MICROS: "200000", __db: db,
  };
}
async function chatReq(db: Db, codeId: string): Promise<Request> {
  const cookie = (await issueCookie({ sid: "s1", codeId }, RING, 43200, false)).split(";")[0];
  return new Request(`${ORIGIN}/chat`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", cookie },
    body: JSON.stringify({ message: "hi" }),
  });
}

describe("/chat admission", () => {
  let db: Db;
  beforeEach(async () => {
    db = makeTestDb();
    await createCode(db, { id: "c", label: "L", view: "default", dailyMicros: 400_000, totalMicros: 10_000_000, expiresAt: null }, HASH_KEY, "2026-06-09T00:00:00Z");
  });

  it("401s without a cookie", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/chat`, {
      method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}",
    }), envFor(db));
    expect(res.status).toBe(401);
  });

  it("admits within budget and forwards to the DO", async () => {
    const res = await worker.fetch(await chatReq(db, "c"), envFor(db));
    expect(res.status).toBe(200); // fake DO returns 200
  });

  it("503s once the daily cap is exhausted", async () => {
    // $0.40 daily, EST $0.20 → 2 admits then refuse
    await admit(db, "c", 200_000, new Date().toISOString(), new Date().toISOString().slice(0, 10));
    await admit(db, "c", 200_000, new Date().toISOString(), new Date().toISOString().slice(0, 10));
    const res = await worker.fetch(await chatReq(db, "c"), envFor(db));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("daily limit");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/chat-admission.test.ts`
Expected: FAIL — admission already wired in Task 10, but the DO reconcile change isn't; the first two tests should pass, and this confirms the gate. If all three pass already, proceed (the DO change in Step 3 is still required for spend truing).

- [ ] **Step 3: Wire reconcile into the DO**

In `worker/session-do.ts`:

(a) Add imports at the top (after line 13):

```ts
import { D1Db } from "./access/db";
import { reconcile } from "./access/codes";
```

(b) In `handleChat`, read the forwarded headers near the top of the method (just after `const { message, mode } = ...` at line 128):

```ts
    const codeId = req.headers.get("x-code-id");
    const estForReconcile = Number(req.headers.get("x-est-micros") ?? "0");
```

(c) In the `finally` block, right after the existing global-ledger add (`session-do.ts:277-280`), append the per-code reconcile using the cost already computed (`sessionCost` USD → micros):

```ts
        if (codeId && estForReconcile > 0) {
          try {
            await reconcile(new D1Db(this.env.DEMO_DB), {
              codeId,
              exchangeId,                       // the id already minted at the top of handleChat
              estMicros: estForReconcile,
              actualMicros: Math.round(sessionCost * 1_000_000),
              model,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              ts: new Date().toISOString(),
            });
          } catch { /* reconcile is best-effort; the reserved est stays booked (conservative) */ }
        }
```

- [ ] **Step 4: Run admission tests + full suite**

Run: `npx vitest run worker/chat-admission.test.ts`
Expected: PASS (3 tests).

Run: `npm run test`
Expected: PASS — all existing tests plus the new access tests. (The existing `presets.test.ts`, inspector, llm, agent, mcp suites are untouched.)

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add worker/session-do.ts worker/chat-admission.test.ts
git commit -m "feat(access): /chat admission gate + per-code reconcile in the DO"
```

---

## Task 12: admin JSON API + admin HTML page

**Files:**
- Modify: `worker/access/admin.ts` (replace stub)
- Create: `worker/access/admin-page.ts`
- Test: `worker/access/admin.test.ts`

- [ ] **Step 1: Write the failing admin API test**

Create `worker/access/admin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handleAdmin } from "./admin";
import { makeTestDb } from "./testdb";
import type { Db } from "./db";

const ORIGIN = "http://localhost:8787";
function env(): any { return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret" }; }
function adminReq(path: string, method: string, body?: unknown, token = "secret"): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { origin: ORIGIN, "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin API", () => {
  it("rejects a missing/incorrect admin token", async () => {
    const db = makeTestDb();
    const res = await handleAdmin(adminReq("/admin/codes", "GET", undefined, "wrong"), env(), db);
    expect(res.status).toBe(401);
  });

  it("creates a code, lists it, and revokes it", async () => {
    const db = makeTestDb();
    const created = await handleAdmin(
      adminReq("/admin/codes", "POST", { id: "advisor", label: "Advisor", view: "advisor", dailyUsd: 5, totalUsd: 25 }),
      env(), db);
    expect(created.status).toBe(200);
    const body = await created.json<{ code: string; link: string }>();
    expect(body.code).toMatch(/-/);
    expect(body.link).toContain(`#code=${body.code}`);

    const listed = await (await handleAdmin(adminReq("/admin/codes", "GET"), env(), db)).json<{ codes: any[] }>();
    expect(listed.codes).toHaveLength(1);
    expect(listed.codes[0].daily_micros).toBe(5_000_000);

    const revoked = await handleAdmin(adminReq("/admin/codes/advisor/revoke", "POST"), env(), db);
    expect(revoked.status).toBe(200);
    const after = await (await handleAdmin(adminReq("/admin/codes", "GET"), env(), db)).json<{ codes: any[] }>();
    expect(after.codes[0].revoked).toBe(1);
  });

  it("serves the admin HTML page at GET /admin", async () => {
    const res = await handleAdmin(adminReq("/admin", "GET"), env(), makeTestDb());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("Voygent Demo — Admin");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run worker/access/admin.test.ts`
Expected: FAIL — stub returns 501.

- [ ] **Step 3: Implement the admin handler**

Replace `worker/access/admin.ts` with:

```ts
import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { createCode, listCodes, revokeCode, usageForCode } from "./codes";
import { usdToMicros } from "./money";
import { ADMIN_HTML } from "./admin-page";

interface AdminEnv {
  CODE_HASH_KEY: string;
  APP_ORIGIN: string;
  ADMIN_TOKEN?: string;
}

/**
 * Cloudflare Access is the preferred gate (configured on the /admin* route at the
 * edge). As defense-in-depth / local fallback we also accept a Bearer ADMIN_TOKEN.
 * If neither an Access JWT nor a correct token is present, 401.
 */
function adminAuthed(req: Request, env: AdminEnv): boolean {
  if (req.headers.get("cf-access-jwt-assertion")) return true; // Access already vouched
  const tok = env.ADMIN_TOKEN;
  if (!tok) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${tok}`;
}

export async function handleAdmin(req: Request, env: AdminEnv, db: Db): Promise<Response> {
  const url = new URL(req.url);

  if (!adminAuthed(req, env)) return text("unauthorized", 401);

  // Admin UI page.
  if (url.pathname === "/admin" && req.method === "GET") {
    return new Response(ADMIN_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  // List codes.
  if (url.pathname === "/admin/codes" && req.method === "GET") {
    return json({ codes: await listCodes(db) });
  }

  // Create code.
  if (url.pathname === "/admin/codes" && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    const b = await req.json<{ id: string; label: string; view?: string; dailyUsd: number; totalUsd: number; expiresAt?: string }>();
    const { code } = await createCode(db, {
      id: b.id, label: b.label, view: b.view ?? "default",
      dailyMicros: usdToMicros(b.dailyUsd), totalMicros: usdToMicros(b.totalUsd),
      expiresAt: b.expiresAt ?? null,
    }, env.CODE_HASH_KEY, new Date().toISOString());
    const link = `${env.APP_ORIGIN}/#code=${code}`;
    return json({ ok: true, code, link });
  }

  // Revoke code.
  const rev = url.pathname.match(/^\/admin\/codes\/([^/]+)\/revoke$/);
  if (rev && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    await revokeCode(db, decodeURIComponent(rev[1]));
    return json({ ok: true });
  }

  // Per-code usage.
  const use = url.pathname.match(/^\/admin\/codes\/([^/]+)\/usage$/);
  if (use && req.method === "GET") {
    const since = url.searchParams.get("since") ?? "1970-01-01T00:00:00Z";
    return json({ events: await usageForCode(db, decodeURIComponent(use[1]), since) });
  }

  return text("not found", 404);
}
```

- [ ] **Step 4: Implement the admin HTML page**

Create `worker/access/admin-page.ts`:

```ts
// Self-contained admin console. No build step, no React — a single HTML string the
// Worker serves at GET /admin (behind Cloudflare Access). Talks to /admin/codes.
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voygent Demo — Admin</title>
<style>
 body{font:14px system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;color:#111}
 h1{font-size:1.2rem} form{display:grid;grid-template-columns:repeat(6,1fr);gap:.5rem;align-items:end;margin:1rem 0}
 label{display:flex;flex-direction:column;font-size:.75rem;gap:.2rem} input{padding:.4rem;border:1px solid #ccc;border-radius:6px}
 button{padding:.45rem .7rem;border:0;border-radius:6px;background:#2b6;color:#fff;cursor:pointer}
 table{width:100%;border-collapse:collapse;margin-top:1rem} td,th{padding:.4rem;border-bottom:1px solid #eee;text-align:left;font-size:.8rem}
 .bar{height:6px;background:#eee;border-radius:3px;overflow:hidden} .bar>i{display:block;height:100%;background:#2b6}
 .link{font-family:monospace;font-size:.72rem;word-break:break-all} .revoked{opacity:.45}
 .new{background:#efe;padding:.6rem;border-radius:6px;margin:.5rem 0;font-family:monospace;font-size:.78rem;display:none}
</style></head><body>
<h1>Voygent Demo — Admin</h1>
<div class="new" id="new"></div>
<form id="f">
 <label>id<input name="id" required placeholder="acme-partner"></label>
 <label>label<input name="label" required placeholder="Acme partner"></label>
 <label>view<input name="view" value="default"></label>
 <label>daily $<input name="dailyUsd" type="number" step="0.01" value="5" required></label>
 <label>total $<input name="totalUsd" type="number" step="0.01" value="25" required></label>
 <button>Mint</button>
</form>
<table id="t"><thead><tr><th>code</th><th>view</th><th>daily</th><th>lifetime</th><th>expires</th><th></th></tr></thead><tbody></tbody></table>
<script>
const fmt = m => '$' + (m/1e6).toFixed(2);
async function load(){
 const r = await fetch('/admin/codes'); const {codes} = await r.json();
 const tb = document.querySelector('#t tbody'); tb.innerHTML='';
 for(const c of codes){
   const dpct = Math.min(100, c.daily_micros? (c.day_spent/c.daily_micros*100):0);
   const lpct = Math.min(100, c.total_micros? (c.lifetime_spent/c.total_micros*100):0);
   const tr = document.createElement('tr'); if(c.revoked) tr.className='revoked';
   tr.innerHTML = '<td><b>'+c.id+'</b><br><span style="color:#888">'+c.label+'</span></td>'
     +'<td>'+c.view+'</td>'
     +'<td>'+fmt(c.day_spent)+' / '+fmt(c.daily_micros)+'<div class=bar><i style="width:'+dpct+'%"></i></div></td>'
     +'<td>'+fmt(c.lifetime_spent)+' / '+fmt(c.total_micros)+'<div class=bar><i style="width:'+lpct+'%"></i></div></td>'
     +'<td>'+(c.expires_at||'—')+'</td>'
     +'<td>'+(c.revoked?'revoked':'<button data-id="'+c.id+'">revoke</button>')+'</td>';
   tb.appendChild(tr);
 }
 tb.querySelectorAll('button[data-id]').forEach(b=>b.onclick=async()=>{
   await fetch('/admin/codes/'+encodeURIComponent(b.dataset.id)+'/revoke',{method:'POST',headers:{'content-type':'application/json'}}); load();
 });
}
document.querySelector('#f').onsubmit = async e => {
 e.preventDefault(); const d=Object.fromEntries(new FormData(e.target));
 d.dailyUsd=+d.dailyUsd; d.totalUsd=+d.totalUsd;
 const r = await fetch('/admin/codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
 const j = await r.json();
 if(j.link){ const n=document.querySelector('#new'); n.style.display='block'; n.textContent='Invite link (copy now): '+j.link; e.target.reset(); load(); }
 else alert('error: '+JSON.stringify(j));
};
load();
</script></body></html>`;
```

- [ ] **Step 5: Run admin tests, verify pass**

Run: `npx vitest run worker/access/admin.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` → PASS

```bash
git add worker/access/admin.ts worker/access/admin-page.ts worker/access/admin.test.ts
git commit -m "feat(access): admin JSON API + self-contained admin console page"
```

---

## Task 13: SPA gate library (fragment read + strip + auth)

**Files:**
- Create: `web/src/lib/gate.ts`
- Test: `web/src/lib/gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/gate.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { readCodeFromHash } from "./gate";

describe("readCodeFromHash", () => {
  it("extracts the code and strips the fragment via replaceState", () => {
    const replaceState = vi.fn();
    const loc = { hash: "#code=k7m2-9x4p-w3rq-h8tn", pathname: "/", search: "" };
    const code = readCodeFromHash(loc as any, { replaceState } as any);
    expect(code).toBe("k7m2-9x4p-w3rq-h8tn");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });
  it("returns null when there is no code fragment", () => {
    const replaceState = vi.fn();
    expect(readCodeFromHash({ hash: "", pathname: "/", search: "" } as any, { replaceState } as any)).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run web/src/lib/gate.test.ts`
Expected: FAIL — `Cannot find module './gate'`.

- [ ] **Step 3: Implement `gate.ts`**

Create `web/src/lib/gate.ts`:

```ts
/** Read `#code=...` from the URL, then immediately strip it from the address bar. */
export function readCodeFromHash(
  loc: Pick<Location, "hash" | "pathname" | "search">,
  hist: Pick<History, "replaceState">,
): string | null {
  const m = loc.hash.match(/[#&]code=([^&]+)/);
  if (!m) return null;
  const code = decodeURIComponent(m[1]);
  hist.replaceState(null, "", `${loc.pathname}${loc.search}`); // drop the secret from history/screenshots
  return code;
}

export async function authenticate(apiBase: string, code: string): Promise<boolean> {
  const res = await fetch(`${apiBase}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });
  return res.ok;
}

export async function hasSession(apiBase: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    return res.ok;
  } catch { return false; }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run web/src/lib/gate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/gate.ts web/src/lib/gate.test.ts
git commit -m "feat(web): gate lib — fragment code read/strip + auth calls"
```

---

## Task 14: SPA gate UI + App integration + credentialed `/chat`

**Files:**
- Create: `web/src/Gate.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/sse-client.ts`

- [ ] **Step 1: Update `sse-client.ts` (same-origin, credentialed, no client session, typed 401)**

Replace the `fetch` call and signature in `web/src/sse-client.ts`. New top of file through the fetch:

```ts
import type { ServerEvent } from "../../shared/events";

export class UnauthorizedError extends Error {}

export async function streamChat(
  apiBase: string, message: string, onEvent: (e: ServerEvent) => void,
  mode?: "boards",
): Promise<void> {
  const res = await fetch(`${apiBase}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(mode ? { message, mode } : { message }),
  });
  if (res.status === 401) throw new UnauthorizedError("session expired");
  if (!res.ok) throw new Error(`chat request failed: HTTP ${res.status}`);
  // ...rest of the function (reader/drain loop) is UNCHANGED...
```

Leave the body of the function (the `reader`/`drain` streaming loop, lines 12-32) exactly as-is.

- [ ] **Step 2: Create the gate component**

Create `web/src/Gate.tsx`:

```tsx
import { useState } from "react";

export function Gate({ initialCode, onSubmit }: { initialCode: string; onSubmit: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const ok = await onSubmit(code.trim());
    setBusy(false);
    if (!ok) setError("That passcode isn't valid. Check your invite link or ask for a new one.");
  }

  return (
    <div style={{ maxWidth: 360, margin: "12vh auto", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: ".25rem" }}>Voygent Demo</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Enter your passcode to start.</p>
      <form onSubmit={submit}>
        <input
          autoFocus value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="passcode" aria-label="passcode"
          style={{ width: "100%", padding: ".6rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }}
        />
        <button disabled={busy || !code.trim()} style={{ marginTop: ".6rem", padding: ".55rem 1rem", border: 0, borderRadius: 8, background: "#2b6", color: "#fff", cursor: "pointer", width: "100%" }}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Integrate into `App.tsx`**

Make these edits in `web/src/App.tsx`:

(a) Add imports near the top:

```tsx
import { Gate } from "./Gate";
import { readCodeFromHash, authenticate, hasSession } from "./lib/gate";
import { UnauthorizedError } from "./sse-client";
```

(b) Remove the client session id. Delete the line `const sessionId = useRef(crypto.randomUUID()).current;` (line 25) and add auth state:

```tsx
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [pendingCode, setPendingCode] = useState("");
```

(c) Add an auth bootstrap effect (place after the existing presets effect):

```tsx
  useEffect(() => {
    const code = readCodeFromHash(window.location, window.history);
    (async () => {
      if (code && (await authenticate(API_BASE, code))) { setAuthed(true); return; }
      if (code) setPendingCode(code); // pre-fill the gate but it was invalid/expired
      setAuthed(await hasSession(API_BASE));
    })();
  }, []);
```

(d) Update the `streamChat` call inside `send` (remove `sessionId`, handle 401):

```tsx
      await streamChat(API_BASE, text, (e) => {
        // ...existing onEvent handler unchanged...
      }, claude ? "boards" : undefined);
```

Wrap the existing `try { await streamChat(...) }` so a 401 returns to the gate — in the `catch`:

```tsx
    } catch (err) {
      if (err instanceof UnauthorizedError) { setAuthed(false); return; }
      showError((err as Error).message);
    } finally {
      setBusy(false);
    }
```

(e) Gate the render. At the top of the returned JSX (before the main app shell):

```tsx
  if (authed === null) return <div style={{ margin: "12vh auto", textAlign: "center", color: "#888" }}>Loading…</div>;
  if (!authed) return <Gate initialCode={pendingCode} onSubmit={async (c) => {
    const ok = await authenticate(API_BASE, c);
    if (ok) setAuthed(true);
    return ok;
  }} />;
```

- [ ] **Step 4: Typecheck + run the web test suite**

Run: `npm run typecheck`
Expected: PASS (no remaining `sessionId` references; `streamChat` calls updated).

Run: `npx vitest run web/src/`
Expected: PASS (existing web tests + gate test).

- [ ] **Step 5: Build the SPA to confirm it compiles**

Run: `VITE_API_BASE= npm run build:web`
Expected: build succeeds, emits `dist-web/`.

- [ ] **Step 6: Commit**

```bash
git add web/src/Gate.tsx web/src/App.tsx web/src/sse-client.ts
git commit -m "feat(web): passcode gate UI, credentialed same-origin chat, 401→gate"
```

---

## Task 15: deploy, Cloudflare Access, and manual E2E

**Files:** none (operational). This task is a checklist — run it from a clean checkout.

- [ ] **Step 1: Create the D1 database and wire the id**

Run:
```bash
cd ~/dev/voygent-demo
npx wrangler d1 create voygent-demo
```
Copy the printed `database_id` into `wrangler.toml`'s `[[d1_databases]]` block (replace `PLACEHOLDER_SET_AFTER_d1_create`). Commit that one-line change.

- [ ] **Step 2: Apply the migration (remote)**

Run:
```bash
npx wrangler d1 migrations apply voygent-demo --remote
```
Expected: `0001_access_control.sql` applied. Verify: `npx wrangler d1 execute voygent-demo --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists `codes` + `spend_events`.

- [ ] **Step 3: Set secrets**

Generate two random hex keys and set them (run each line separately, paste the value when prompted):
```bash
openssl rand -hex 32   # use as CODE_HASH_KEY
openssl rand -hex 32   # use as SESSION_SIGN_KEY (or {"1":"<hex>"} JSON for a ring)
npx wrangler secret put CODE_HASH_KEY
npx wrangler secret put SESSION_SIGN_KEY
npx wrangler secret put ADMIN_TOKEN
```

- [ ] **Step 4: Set `APP_ORIGIN` for production**

In `wrangler.toml`, set `APP_ORIGIN` under `[vars]` to the deployed origin (e.g. `https://voygent-demo.somotravel.workers.dev` until the `voygent.ai` route is sorted). Commit.

- [ ] **Step 5: Build + deploy**

Run:
```bash
VITE_API_BASE= npm run build:web
npm run deploy
```
Expected: Worker deploys; SPA served same-origin.

- [ ] **Step 6: Configure Cloudflare Access on `/admin*`**

In the Cloudflare dashboard → Zero Trust → Access → Applications: add a self-hosted app for the demo host, path `/admin*`, policy = allow only `dneilroberts@gmail.com` (email OTP). This gates the admin console at the edge with no Worker code. (`ADMIN_TOKEN` remains as a fallback for local/dev.)

- [ ] **Step 7: Manual E2E smoke**

1. Visit `/admin` → authenticate via Access → mint a code with daily $0.50 / total $1.00 → copy the invite link.
2. Open the invite link in a fresh browser profile → gate pre-fills → Enter → demo loads.
3. Run a normal trip-build exchange → confirm the folio renders (spend recorded).
4. In `/admin`, confirm the code's daily + lifetime bars moved.
5. Hammer exchanges until the daily cap trips → expect the "daily limit" message.
6. Revoke the code in `/admin` → next exchange in the guest tab → expect "no longer active" / bounce to gate.
7. Confirm `DEMO_DISABLED` still pauses everything, and the global `BUDGET_DAILY_USD` cap still trips independently.

- [ ] **Step 8: Tail logs to verify cost attribution**

Run: `npx wrangler tail` and confirm `[cost] …` lines appear and the per-code `spend_events` grows (`wrangler d1 execute voygent-demo --remote --command "SELECT code_id, count(*), sum(actual_micros) FROM spend_events GROUP BY code_id"`).

> **Separate, non-blocking infra task:** resolve the `*.voygent.ai` wildcard (it routes every subdomain to the prod `voygent` Worker — see the comment in `wrangler.toml`) so the demo can serve at a `voygent.ai` URL. Until then `APP_ORIGIN` and the deploy stay on `voygent-demo.somotravel.workers.dev`.

---

## Self-review notes (spec coverage)

- **Reserve-then-reconcile** → Tasks 6 (admit) + 7 (reconcile) + 11 (DO wiring). ✔
- **Single conditional primary write / no TOCTOU** → Task 6 `admit` is one `UPDATE`. ✔
- **Server-issued sid, ignore client param** → Task 10 (`newSid` in cookie) + Task 11 (DO keyed by `claims.sid`) + Task 14 (client no longer sends `?session=`). ✔
- **Wildcard CORS removed** → Task 10 (no `cors()` helper). ✔
- **Origin/CSRF on POSTs** → Task 9 + applied in Tasks 10/12. ✔
- **High-entropy codes, uniform 401, hash-at-rest** → Tasks 4/5/10. (Rate-limiting `/auth` is noted as a follow-up — see below.) ✔ (partial)
- **Integer micro-USD + batch()** → Tasks 2/3/7. ✔
- **`__Host-` cookie, key ring, 12h TTL** → Task 8 + Task 10 `COOKIE_TTL_SEC`. ✔
- **Fail-closed auth/admission** → Task 10 (no cookie → 401; admit false → 503). ✔
- **Admin mint/revoke/usage + live bars** → Task 12. ✔
- **`view` tag carried through** → stored (Task 5), returned by `/auth` (Task 10). Branching on it is the documented follow-up. ✔
- **Deferred:** per-IP `/auth` rate limiting was in the spec as a brute-force mitigation. High-entropy ~100-bit codes make online guessing infeasible within any practical window, so this is **explicitly deferred** to a follow-up (would add a small KV/DO counter). Flagging rather than silently dropping.
```
