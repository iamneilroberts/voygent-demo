# Public Showcase + Moderated Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public "follow the build" page at `GET /showcase` on demo.voygent.ai (curated sections + a safe build-log + moderated comments), with a self-hosted no-login comment system whose submissions stay invisible until an admin approves them.

**Architecture:** A new self-contained `worker/showcase/` module (config, build-log parser, comment store/validation, render, routes). Comments live in the existing `DEMO_DB` D1 (new migration `0006`). The public page is server-rendered amber-CRT HTML reusing `worker/info/layout.ts`'s `renderInfoPage`. Public comment submission is a plain HTML form (no JS, strict CSP); admin moderation is wired into the existing `handleAdmin` if-chain and submits via JSON fetch like the existing in-place editor. The whole feature is inert (404) unless `SHOWCASE_ENABLED` is set, and fails closed (503) if `COMMENT_IP_SALT` or D1 are missing.

**Tech Stack:** Cloudflare Workers (TypeScript), D1 (via the repo's `Db` interface), vitest with `makeTestDb()` (better-sqlite3 in-memory), Web Crypto HMAC-SHA256 for IP pseudonymity.

---

## Decisions resolved from the spec's Open Items (read before starting)

These were left open in the design spec; they are now decided so the plan has no placeholders. If you disagree, raise it before coding — do not silently diverge.

- **D1 binding = `DEMO_DB`** (the access-control DB, `database_id` in `wrangler.toml`), NOT `STATS_DB`/`voygent-demo-stats`. Rationale: it is where access/moderation state already lives, it is exposed through the clean `Db` interface (`worker/access/db.ts`), and `makeTestDb()` (`worker/access/testdb.ts`) applies `migrations/` at construction, so tests get the table automatically. Migration file: `migrations/0006_showcase_comments.sql`.
- **CSRF on moderation POSTs (finding #1) is satisfied by the existing `guardMutation(req, env.APP_ORIGIN)`** in `worker/access/http.ts`, which exact-matches the `Origin` header against `APP_ORIGIN` and requires `content-type: application/json`. **The real CSRF defense here is the strict `Origin === APP_ORIGIN` check** — NOT a content-type/preflight barrier. (Correction from codex review: the top-level worker answers `OPTIONS` with permissive CORS — `worker/index.ts:72`, `cors()` allows `POST, OPTIONS` — so do not rely on "cross-site JSON needs a preflight." The Origin exact-match is what stops a forged cross-site POST, and `handleAdmin` already gates `adminAuthed` on top of it.) Admin moderation submits via JSON `fetch()` (same pattern as the existing in-place editor; the browser sets `Origin` automatically and it must equal `APP_ORIGIN`). A separate per-request CSRF token is **not** added in v1 — the Origin match plus `adminAuthed` is sufficient; documented here as a conscious decision, not an omission.
- **Public comment form uses `application/x-www-form-urlencoded`** (a plain `<form>`, no JavaScript). This keeps the `/showcase` CSP at `script-src 'none'`. The public POST handler does its own validation (it does NOT call `guardMutation`, since that would force JSON).
- **Build-log source = `worker/showcase/changelog.json`** (a committed JSON array of `{ "date": "YYYY-MM-DD", "text": "..." }`), imported into the worker bundle exactly like `worker/info/content.json` (native JSON import — no bundler text-loader needed). This is the spec's "single committed source the author controls"; `.json` instead of `.md` because the repo already imports JSON natively and content.json sets the precedent. The author appends one object to publish a build-log line. Nothing else feeds the build-log.
- **Rate limit = best-effort COUNT-then-INSERT**, max **5 inserts per IP-hash per rolling 10 minutes** (`RATE_LIMIT_MAX = 5`, `RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000`). The COUNT-then-INSERT race (finding #8) is accepted for v1 because manual moderation is the real backstop; documented in code. Escalation lever (atomic bucket table or Turnstile) is out of scope for v1.
- **Retention/TTL (finding #2/#3) = 30 days** (`COMMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000`), enforced as a delete-on-read sweep at the top of `GET /showcase` (prune `pending` + `rejected` rows older than TTL; approved rows persist). No scheduled job in v1. **Tradeoff (codex review, accepted for v1):** delete-on-read means every public `GET /showcase` issues a D1 write. Acceptable at this traffic; if `/showcase` ever gets hot, move pruning to a scheduled `cron` trigger or throttle it (e.g. probabilistic sweep). Noted as a v1 limitation, not a silent cap.
- **Body-size cap = 8 KB** (`MAX_BODY_BYTES = 8192`), checked against `Content-Length` before reading the body (finding #2).

---

## File Structure

**Create:**
- `migrations/0006_showcase_comments.sql` — the `showcase_comments` table.
- `worker/showcase/config.ts` — section types, the v1 section list, `KNOWN_SECTION_IDS`, `enabledSections()`.
- `worker/showcase/changelog.json` — committed build-log source (seed with one entry).
- `worker/showcase/buildlog.ts` — `BuildLogEntry`, `parseBuildLog()` (pure).
- `worker/showcase/comments.ts` — `CommentRow`, `validateComment()`, `hashIp()`, `withinRateLimit()`, `insertPending()`, `listApproved()`, `listPending()`, `moderate()`, `pruneOld()`, `normalizeSectionRef()`, plus the limit/TTL/size constants.
- `worker/showcase/render.ts` — `renderShowcasePage()`, `renderModerationPage()`, escape-first helpers.
- `worker/showcase/routes.ts` — `handleShowcase()`, `handleShowcaseComment()`, the CSP constant.
- `worker/showcase/admin-moderation.ts` — `handleAdminComments()` (dispatches the `/admin/comments*` routes), `moderatorId()`.
- Test files alongside each: `worker/showcase/config.test.ts`, `buildlog.test.ts`, `comments.test.ts`, `render.test.ts`, `routes.test.ts`, `admin-moderation.test.ts`.

**Modify:**
- `worker/info/layout.ts` — add `export` to the existing `esc()` so the showcase module can reuse it (DRY; finding #5 escaping).
- `worker/index.ts` — add `SHOWCASE_ENABLED` + `COMMENT_IP_SALT` to the `Env` interface; wire `GET /showcase` and `POST /showcase/comments` before the bottom fallthrough.
- `worker/access/admin.ts` — add the `/admin/comments` + `/admin/comments/:id/{approve,reject}` route matches inside `handleAdmin`, delegating to `handleAdminComments`.
- `wrangler.toml` — document `SHOWCASE_ENABLED` (a `[vars]` flag) and note `COMMENT_IP_SALT` is a secret (`wrangler secret put`).

---

## Task 1: Migration + Env wiring

**Files:**
- Create: `migrations/0006_showcase_comments.sql`
- Modify: `worker/index.ts` (Env interface)
- Modify: `wrangler.toml`

- [ ] **Step 1: Write the migration**

Create `migrations/0006_showcase_comments.sql`:

```sql
-- 0006_showcase_comments.sql
-- Public showcase moderated comments. Apply with:
--   wrangler d1 migrations apply voygent-demo --remote
-- (or: wrangler d1 execute voygent-demo --remote --file migrations/0006_showcase_comments.sql)
CREATE TABLE IF NOT EXISTS showcase_comments (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,          -- epoch ms
  author_name   TEXT NOT NULL CHECK (length(author_name) <= 80),
  body          TEXT NOT NULL CHECK (length(body) <= 2000),
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  ip_hash       TEXT NOT NULL,             -- HMAC-SHA256(COMMENT_IP_SALT, normalized_ip)
  section_ref   TEXT,                      -- validated against known section ids, else NULL
  moderated_at  INTEGER,                   -- epoch ms, set on approve/reject
  moderated_by  TEXT                       -- moderator identity, set on approve/reject
);
-- DB-layer length CHECKs (codex review): defense-in-depth so any future write path
-- cannot bypass the app-layer name<=80 / body<=2000 caps.
CREATE INDEX IF NOT EXISTS idx_showcase_comments_status_created
  ON showcase_comments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_showcase_comments_iphash_created
  ON showcase_comments (ip_hash, created_at);
```

- [ ] **Step 2: Add the migration to `makeTestDb()`'s hardcoded list (REQUIRED — verified)**

`makeTestDb()` (`worker/access/testdb.ts`) does NOT glob the migrations directory — it applies a **hardcoded `MIGRATIONS` array** (around lines 8–15) mapped to `../../migrations`. So `0006` will NOT be picked up automatically; you MUST add it or every comment-store test fails with `no such table: showcase_comments`.

Edit the `MIGRATIONS` array in `worker/access/testdb.ts` to append the new file (keep apply order):

```ts
const MIGRATIONS = [
  // ...existing entries (0001, 0003, 0004, 0005 — note 0002 is intentionally excluded; it targets a different DB)...
  "0006_showcase_comments.sql",
].map((f) => join(HERE, "../../migrations", f));
```

Run: `grep -n "MIGRATIONS" worker/access/testdb.ts` to confirm `0006_showcase_comments.sql` is in the list before proceeding.

- [ ] **Step 3: Add env fields to the `Env` interface**

In `worker/index.ts`, find the `Env` interface (around line 20-30, where `STATS_DB?: D1Database` is declared) and add:

```ts
  SHOWCASE_ENABLED?: string;
  COMMENT_IP_SALT?: string;
```

- [ ] **Step 4: Document the vars in wrangler.toml**

In `wrangler.toml`, under the existing `[vars]` section add:

```toml
# Showcase page master toggle. Unset => /showcase + /showcase/comments are inert (404).
# SHOWCASE_ENABLED = "1"   # uncomment to enable
```

And add a comment near the secrets notes (do NOT put the salt value in the file — it is a secret):

```toml
# COMMENT_IP_SALT is a secret (HMAC key for comment IP pseudonymity):
#   wrangler secret put COMMENT_IP_SALT
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no references to the table yet; only Env fields added).

- [ ] **Step 6: Commit**

```bash
git add migrations/0006_showcase_comments.sql worker/index.ts wrangler.toml worker/access/testdb.ts
git commit -m "feat(showcase): add showcase_comments migration + env wiring + testdb migration"
```

---

## Task 2: Section config

**Files:**
- Create: `worker/showcase/config.ts`
- Test: `worker/showcase/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/showcase/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SECTIONS, KNOWN_SECTION_IDS, enabledSections, type Section } from "./config";

describe("showcase config", () => {
  it("KNOWN_SECTION_IDS contains every section id", () => {
    for (const s of SECTIONS) expect(KNOWN_SECTION_IDS.has(s.id)).toBe(true);
  });

  it("enabledSections returns only enabled sections in ascending order", () => {
    const input: Section[] = [
      { id: "c", type: "comments", title: "C", enabled: true, order: 30 },
      { id: "a", type: "overview", title: "A", enabled: true, order: 10 },
      { id: "b", type: "architecture", title: "B", enabled: false, order: 20 },
    ];
    const out = enabledSections(input);
    expect(out.map((s) => s.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/showcase/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write the implementation**

Create `worker/showcase/config.ts`:

```ts
export type SectionType =
  | "overview"
  | "architecture"
  | "milestones"
  | "buildlog"
  | "comments";

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  enabled: boolean;
  order: number;
  /** Curated, TRUSTED HTML fragment for prose sections (overview/architecture/milestones). */
  bodyHtml?: string;
}

/**
 * v1 section list. Toggle/reorder by editing this file + redeploy (YAGNI: no runtime UI).
 * Curated bodyHtml is author-trusted (NOT escaped on render). buildlog + comments are
 * data-driven and rendered with escaping.
 */
export const SECTIONS: Section[] = [
  { id: "overview", type: "overview", title: "Overview", enabled: true, order: 10,
    bodyHtml: "<p>Placeholder overview — curated copy added during content authoring.</p>" },
  { id: "architecture", type: "architecture", title: "Architecture", enabled: false, order: 20,
    bodyHtml: "<p>Placeholder architecture section.</p>" },
  { id: "milestones", type: "milestones", title: "Milestones", enabled: false, order: 30,
    bodyHtml: "<p>Placeholder milestones section.</p>" },
  { id: "buildlog", type: "buildlog", title: "Build log", enabled: true, order: 40 },
  { id: "comments", type: "comments", title: "Comments", enabled: true, order: 50 },
];

export const KNOWN_SECTION_IDS: ReadonlySet<string> = new Set(SECTIONS.map((s) => s.id));

export function enabledSections(sections: Section[]): Section[] {
  return sections.filter((s) => s.enabled).slice().sort((a, b) => a.order - b.order);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/showcase/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/showcase/config.ts worker/showcase/config.test.ts
git commit -m "feat(showcase): section config + enabledSections"
```

---

## Task 3: Build-log parser + source file

**Files:**
- Create: `worker/showcase/buildlog.ts`
- Create: `worker/showcase/changelog.json`
- Test: `worker/showcase/buildlog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/showcase/buildlog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseBuildLog, type RawEntry } from "./buildlog";

describe("parseBuildLog", () => {
  it("keeps well-formed entries and sorts newest first", () => {
    const raw: RawEntry[] = [
      { date: "2026-06-10", text: "older" },
      { date: "2026-06-16", text: "newer" },
    ];
    const out = parseBuildLog(raw);
    expect(out.map((e) => e.text)).toEqual(["newer", "older"]);
  });

  it("drops malformed entries (bad date, empty text, missing fields)", () => {
    const raw = [
      { date: "2026-06-16", text: "good" },
      { date: "not-a-date", text: "bad date" },
      { date: "2026-01-01", text: "   " },
      { date: "2026-02-02" },
      { text: "no date" },
      null,
      "garbage",
    ] as unknown as RawEntry[];
    const out = parseBuildLog(raw);
    expect(out.map((e) => e.text)).toEqual(["good"]);
  });

  it("returns [] for non-array input", () => {
    expect(parseBuildLog(undefined as unknown as RawEntry[])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/showcase/buildlog.test.ts`
Expected: FAIL — cannot find module `./buildlog`.

- [ ] **Step 3: Write the implementation + source file**

Create `worker/showcase/buildlog.ts`:

```ts
export interface RawEntry {
  date?: unknown;
  text?: unknown;
}

export interface BuildLogEntry {
  date: string; // YYYY-MM-DD
  text: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the committed build-log source (changelog.json) into clean, sorted entries.
 * This is the ONLY input to the build-log. Malformed rows are dropped (defensive).
 */
export function parseBuildLog(raw: RawEntry[]): BuildLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BuildLogEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const date = (row as RawEntry).date;
    const text = (row as RawEntry).text;
    if (typeof date !== "string" || !DATE_RE.test(date)) continue;
    if (typeof text !== "string" || text.trim() === "") continue;
    out.push({ date, text: text.trim() });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
```

Create `worker/showcase/changelog.json`:

```json
[
  { "date": "2026-06-16", "text": "Public showcase page goes live." }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/showcase/buildlog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/showcase/buildlog.ts worker/showcase/changelog.json worker/showcase/buildlog.test.ts
git commit -m "feat(showcase): build-log parser + committed changelog source"
```

---

## Task 4: Comment store + validation

**Files:**
- Create: `worker/showcase/comments.ts`
- Test: `worker/showcase/comments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/showcase/comments.test.ts`:

```ts
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
    // already approved -> moderate again returns false
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
    expect(pend).toEqual(["fresh"]);          // old-pending pruned
    expect(appr).toEqual(["old-approved"]);   // approved kept despite age
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/showcase/comments.test.ts`
Expected: FAIL — cannot find module `./comments` (and, if Task 1 Step 2 was skipped, a "no such table: showcase_comments" error — fix the migration loading first).

- [ ] **Step 3: Write the implementation**

Create `worker/showcase/comments.ts`:

```ts
import type { Db } from "../access/db";

export const NAME_MAX = 80;
export const BODY_MAX = 2000;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;     // 10 minutes
export const COMMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CommentInput {
  name: string;
  body: string;
  website: string; // honeypot — must be empty
}

export type ValidationResult =
  | { ok: true; name: string; body: string }
  | { ok: false; reason: "honeypot" | "empty" | "too_long" };

export function validateComment(input: CommentInput): ValidationResult {
  if ((input.website ?? "").trim() !== "") return { ok: false, reason: "honeypot" };
  const name = (input.name ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!name || !body) return { ok: false, reason: "empty" };
  if (name.length > NAME_MAX || body.length > BODY_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, name, body };
}

/** HMAC-SHA256(salt, normalized_ip) hex. Pseudonymous, NOT anonymized. Never store the raw IP. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const norm = (ip || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split("%")[0]
    .split("]")[0];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(norm));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeSectionRef(
  ref: string | null | undefined,
  known: ReadonlySet<string>,
): string | null {
  if (!ref) return null;
  return known.has(ref) ? ref : null;
}

export interface CommentRow {
  id: string;
  created_at: number;
  author_name: string;
  body: string;
  section_ref: string | null;
}

/**
 * Best-effort rate limit (finding #8): COUNT-then-INSERT can be beaten by concurrent
 * requests. Accepted for v1 because manual moderation is the real backstop.
 */
export async function withinRateLimit(
  db: Db,
  ipHash: string,
  now: number,
  windowMs: number,
  maxN: number,
): Promise<boolean> {
  const row = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM showcase_comments WHERE ip_hash = ? AND created_at > ?",
    [ipHash, now - windowMs],
  );
  return (row?.n ?? 0) < maxN;
}

export async function insertPending(
  db: Db,
  c: { id: string; createdAt: number; name: string; body: string; ipHash: string; sectionRef: string | null },
): Promise<void> {
  await db.run(
    "INSERT INTO showcase_comments (id, created_at, author_name, body, status, ip_hash, section_ref) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [c.id, c.createdAt, c.name, c.body, c.ipHash, c.sectionRef],
  );
}

export async function listApproved(db: Db, limit: number): Promise<CommentRow[]> {
  return db.all<CommentRow>(
    "SELECT id, created_at, author_name, body, section_ref FROM showcase_comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export async function listPending(db: Db, limit: number): Promise<CommentRow[]> {
  return db.all<CommentRow>(
    "SELECT id, created_at, author_name, body, section_ref FROM showcase_comments WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
}

/**
 * Atomic transition (codex review): one conditional UPDATE guarded by status='pending',
 * trusting DbResult.changes. Avoids the SELECT-then-UPDATE race where two admins both
 * transition the same row and both see success. `DbResult { changes: number }` is
 * provided by the repo's Db adapter (worker/access/db.ts).
 * Returns true iff exactly this call transitioned a pending row.
 */
export async function moderate(
  db: Db,
  id: string,
  action: "approve" | "reject",
  by: string,
  now: number,
): Promise<boolean> {
  const status = action === "approve" ? "approved" : "rejected";
  const res = await db.run(
    "UPDATE showcase_comments SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND status = 'pending'",
    [status, now, by, id],
  );
  return (res.changes ?? 0) > 0;
}

/** Retention sweep (finding #2/#3): drop old pending+rejected; keep approved. */
export async function pruneOld(db: Db, now: number, ttlMs: number): Promise<void> {
  await db.run(
    "DELETE FROM showcase_comments WHERE status IN ('pending','rejected') AND created_at < ?",
    [now - ttlMs],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/showcase/comments.test.ts`
Expected: PASS. (If "no such table", revisit Task 1 Step 2.)

- [ ] **Step 5: Commit**

```bash
git add worker/showcase/comments.ts worker/showcase/comments.test.ts
git commit -m "feat(showcase): comment validation, HMAC IP hash, D1 store, rate limit, prune"
```

---

## Task 5: Export `esc()` + render the showcase and moderation pages

**Files:**
- Modify: `worker/info/layout.ts` (export `esc`)
- Create: `worker/showcase/render.ts`
- Test: `worker/showcase/render.test.ts`

- [ ] **Step 1: Export `esc` from layout.ts**

In `worker/info/layout.ts`, change the existing private declaration:

```ts
function esc(s: string): string {
```

to:

```ts
export function esc(s: string): string {
```

(No other change — `renderInfoPage` keeps using it.)

- [ ] **Step 2: Write the failing test**

Create `worker/showcase/render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderShowcasePage, renderModerationPage } from "./render";
import type { Section } from "./config";
import type { CommentRow } from "./comments";

const SECTIONS: Section[] = [
  { id: "overview", type: "overview", title: "Overview", enabled: true, order: 10, bodyHtml: "<p>Curated &amp; safe</p>" },
  { id: "hidden", type: "architecture", title: "Hidden", enabled: false, order: 20, bodyHtml: "<p>nope</p>" },
  { id: "buildlog", type: "buildlog", title: "Build log", enabled: true, order: 30 },
  { id: "comments", type: "comments", title: "Comments", enabled: true, order: 40 },
];

describe("renderShowcasePage", () => {
  it("renders only enabled sections, keeps curated HTML, and includes the honeypot form", () => {
    const html = renderShowcasePage({
      sections: SECTIONS,
      buildlog: [{ date: "2026-06-16", text: "shipped" }],
      comments: [],
      showComments: true,
    });
    expect(html).toContain("<p>Curated &amp; safe</p>"); // curated bodyHtml passed through
    expect(html).not.toContain("nope");                  // disabled section excluded
    expect(html).toContain("2026-06-16");
    expect(html).toContain('name="website"');            // honeypot field present
    expect(html).toContain('action="/showcase/comments"');
  });

  it("escapes untrusted comment fields (escape-first, then <br>)", () => {
    const comments: CommentRow[] = [
      { id: "1", created_at: 1, author_name: '<b>x</b>', body: "line1\n<script>alert(1)</script>", section_ref: null },
    ];
    const html = renderShowcasePage({ sections: SECTIONS, buildlog: [], comments, showComments: true });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("line1<br>");                  // newline -> <br> AFTER escaping
  });

  it("hides the comments section when showComments is false (graceful degrade)", () => {
    const html = renderShowcasePage({ sections: SECTIONS, buildlog: [], comments: [], showComments: false });
    expect(html).not.toContain('action="/showcase/comments"');
  });
});

describe("renderModerationPage", () => {
  it("escapes pending comment bodies/names on the admin page too", () => {
    const pending: CommentRow[] = [
      { id: "p1", created_at: 1, author_name: '"><img onerror=1>', body: "<script>1</script>", section_ref: "overview" },
    ];
    const html = renderModerationPage(pending);
    expect(html).not.toContain("<script>1</script>");
    expect(html).not.toContain("<img onerror=1>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("p1"); // id present for the action target
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run worker/showcase/render.test.ts`
Expected: FAIL — cannot find module `./render`.

- [ ] **Step 4: Write the implementation**

Create `worker/showcase/render.ts`:

```ts
import { renderInfoPage, esc } from "../info/layout";
import { enabledSections, type Section } from "./config";
import type { BuildLogEntry } from "./buildlog";
import type { CommentRow } from "./comments";

/** Escape FIRST, then turn newlines into <br> (finding #5). Never the reverse. */
function escMultiline(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

/**
 * Attribute-context escaping (codex review): the shared esc() escapes &<> but NOT quotes,
 * so it is unsafe for `attr="${value}"`. Use this for any value interpolated into an
 * HTML attribute. (Today the only interpolated attrs are server UUIDs / trusted section
 * ids, so this is defense-in-depth, but it keeps the helper correct for future values.)
 */
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildlogHtml(entries: BuildLogEntry[]): string {
  if (entries.length === 0) return "<p>No build-log entries yet.</p>";
  const items = entries
    .map((e) => `<li><span class="stat">${esc(e.date)}</span> ${esc(e.text)}</li>`)
    .join("");
  return `<ul class="buildlog">${items}</ul>`;
}

function commentsHtml(comments: CommentRow[]): string {
  const list =
    comments.length === 0
      ? "<p>No comments yet — be the first.</p>"
      : `<ul class="comments">${comments
          .map(
            (c) =>
              `<li><strong>${esc(c.author_name)}</strong><div>${escMultiline(c.body)}</div></li>`,
          )
          .join("")}</ul>`;
  // Plain HTML form (no JS) -> /showcase CSP can keep script-src 'none'.
  const form = `
    <form method="POST" action="/showcase/comments" class="comment-form">
      <label>Name <input type="text" name="name" maxlength="80" required></label>
      <label>Comment <textarea name="body" maxlength="2000" required></textarea></label>
      <input type="text" name="website" autocomplete="off" tabindex="-1"
             aria-hidden="true" style="position:absolute;left:-9999px">
      <button type="submit">Submit for review</button>
      <p class="note">Comments are held for review before they appear.</p>
    </form>`;
  return list + form;
}

function sectionHtml(s: Section, buildlog: BuildLogEntry[], comments: CommentRow[], showComments: boolean): string {
  let inner: string;
  switch (s.type) {
    case "buildlog":
      inner = buildlogHtml(buildlog);
      break;
    case "comments":
      if (!showComments) return "";
      inner = commentsHtml(comments);
      break;
    default:
      // Curated, author-trusted HTML — intentionally NOT escaped.
      inner = s.bodyHtml ?? "";
  }
  return `<section id="${escAttr(s.id)}"><h2>${esc(s.title)}</h2>${inner}</section>`;
}

export interface ShowcaseRenderInput {
  sections: Section[];
  buildlog: BuildLogEntry[];
  comments: CommentRow[];
  showComments: boolean;
}

/**
 * Body-only composition (the showcase's OWN content: curated sections + build-log +
 * comments). Exposed separately so the no-leak test (Task 8) asserts against exactly
 * the showcase-controlled source allowlist, NOT the shared site chrome that
 * renderInfoPage adds (its nav legitimately contains words like "cost engineering",
 * which are already public on /info and are an allowed source — not a leak).
 */
export function renderShowcaseBody(input: ShowcaseRenderInput): string {
  return enabledSections(input.sections)
    .map((s) => sectionHtml(s, input.buildlog, input.comments, input.showComments))
    .join("\n");
}

export function renderShowcasePage(input: ShowcaseRenderInput): string {
  return renderInfoPage(
    { title: "Follow the build", subtitle: "Voygent — public showcase" },
    renderShowcaseBody(input),
    "showcase",
  );
}

export function renderModerationPage(pending: CommentRow[]): string {
  const rows =
    pending.length === 0
      ? "<p>No pending comments.</p>"
      : pending
          .map(
            (c) => `
      <div class="pending" data-id="${escAttr(c.id)}">
        <strong>${esc(c.author_name)}</strong>
        ${c.section_ref ? `<em>on ${esc(c.section_ref)}</em>` : ""}
        <div>${escMultiline(c.body)}</div>
        <button class="approve" data-id="${escAttr(c.id)}">Approve</button>
        <button class="reject" data-id="${escAttr(c.id)}">Reject</button>
      </div>`,
          )
          .join("");
  // Admin surface (not the public /showcase) — fetch()+JSON moderation, mirroring the
  // existing in-place editor. Origin + application/json content-type = CSRF defense.
  const script = `
    <script>
      document.querySelectorAll('.approve,.reject').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-id');
          var action = btn.classList.contains('approve') ? 'approve' : 'reject';
          var res = await fetch('/admin/comments/' + encodeURIComponent(id) + '/' + action, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
          });
          if (res.ok) { var el = btn.closest('.pending'); if (el) el.remove(); }
          else { alert('Action failed (' + res.status + ')'); }
        });
      });
    </script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Moderate comments</title></head>
    <body><h1>Pending comments</h1>${rows}${script}</body></html>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run worker/showcase/render.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite to confirm exporting `esc` broke nothing**

Run: `npm test`
Expected: PASS (existing `worker/info` tests still green).

- [ ] **Step 7: Commit**

```bash
git add worker/info/layout.ts worker/showcase/render.ts worker/showcase/render.test.ts
git commit -m "feat(showcase): render showcase + moderation pages; export esc() for reuse"
```

---

## Task 6: Public routes (`GET /showcase`, `POST /showcase/comments`)

**Files:**
- Create: `worker/showcase/routes.ts`
- Test: `worker/showcase/routes.test.ts`
- Modify: `worker/index.ts` (wire the routes)

- [ ] **Step 1: Write the failing test**

Create `worker/showcase/routes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "../access/testdb";
import { handleShowcase, handleShowcaseComment, SHOWCASE_CSP } from "./routes";
import { listPending } from "./comments";

const ORIGIN = "http://localhost:8787";

function env(extra: Record<string, unknown> = {}): any {
  return { SHOWCASE_ENABLED: "1", COMMENT_IP_SALT: "test-salt", APP_ORIGIN: ORIGIN, ...extra };
}

function getReq(): Request {
  return new Request(`${ORIGIN}/showcase`, { method: "GET" });
}

function postForm(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const body = new URLSearchParams(fields).toString();
  return new Request(`${ORIGIN}/showcase/comments`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "9.9.9.9", ...headers },
    body,
  });
}

// A Db whose every method throws — simulates a missing showcase_comments table / D1 outage.
const throwingDb: any = {
  run: async () => { throw new Error("no such table: showcase_comments"); },
  first: async () => { throw new Error("no such table: showcase_comments"); },
  all: async () => { throw new Error("no such table: showcase_comments"); },
  batch: async () => { throw new Error("no such table: showcase_comments"); },
};

describe("GET /showcase", () => {
  it("404s when SHOWCASE_ENABLED is unset (inert)", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env({ SHOWCASE_ENABLED: undefined }), db);
    expect(res.status).toBe(404);
  });

  it("renders 200 HTML with the strict CSP header when enabled", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env(), db);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toBe(SHOWCASE_CSP);
  });

  it("still renders 200 (no comment form) when the salt is missing — fail-closed UX", async () => {
    const db = makeTestDb();
    const res = await handleShowcase(getReq(), env({ COMMENT_IP_SALT: undefined }), db);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('action="/showcase/comments"');
  });

  it("degrades to no-comments (still 200) when D1 throws", async () => {
    const res = await handleShowcase(getReq(), env(), throwingDb);
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain('action="/showcase/comments"');
  });
});

describe("POST /showcase/comments", () => {
  it("404s when disabled (inert)", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env({ SHOWCASE_ENABLED: undefined }), db);
    expect(res.status).toBe(404);
  });

  it("503s fail-closed when COMMENT_IP_SALT is missing; nothing is written", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env({ COMMENT_IP_SALT: undefined }), db);
    expect(res.status).toBe(503);
    expect((await listPending(db, 10)).length).toBe(0);
  });

  it("503s fail-closed (not 500) when the comments table/D1 is unavailable", async () => {
    const res = await handleShowcaseComment(postForm({ name: "n", body: "b", website: "" }), env(), throwingDb);
    expect(res.status).toBe(503);
  });

  it("415s on wrong content-type", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(
      new Request(`${ORIGIN}/showcase/comments`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      env(),
      db,
    );
    expect(res.status).toBe(415);
  });

  it("413s when Content-Length exceeds the cap", async () => {
    const db = makeTestDb();
    const req = postForm({ name: "n", body: "b", website: "" }, { "content-length": "999999" });
    const res = await handleShowcaseComment(req, env(), db);
    expect(res.status).toBe(413);
  });

  it("stores a valid comment as pending and returns a neutral 200", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "Neil", body: "great", website: "" }), env(), db);
    expect(res.status).toBe(200);
    const pend = await listPending(db, 10);
    expect(pend.length).toBe(1);
    expect(pend[0].author_name).toBe("Neil");
  });

  it("silently drops a honeypot hit with the same neutral 200 (no write)", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "bot", body: "spam", website: "http://x" }), env(), db);
    expect(res.status).toBe(200);
    expect((await listPending(db, 10)).length).toBe(0);
  });

  it("rejects empty/over-length with 400", async () => {
    const db = makeTestDb();
    const res = await handleShowcaseComment(postForm({ name: "", body: "", website: "" }), env(), db);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/showcase/routes.test.ts`
Expected: FAIL — cannot find module `./routes`.

- [ ] **Step 3: Write the implementation**

Create `worker/showcase/routes.ts`:

```ts
import type { Db } from "../access/db";
import { SECTIONS, KNOWN_SECTION_IDS } from "./config";
import { parseBuildLog } from "./buildlog";
import changelogRaw from "./changelog.json";
import { renderShowcasePage } from "./render";
import {
  validateComment,
  hashIp,
  withinRateLimit,
  insertPending,
  listApproved,
  pruneOld,
  normalizeSectionRef,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  COMMENT_TTL_MS,
} from "./comments";

export interface ShowcaseEnv {
  SHOWCASE_ENABLED?: string;
  COMMENT_IP_SALT?: string;
}

const MAX_BODY_BYTES = 8192;
const APPROVED_LIMIT = 50;

export const SHOWCASE_CSP =
  "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": SHOWCASE_CSP,
    },
  });
}

/** Always-neutral submit acknowledgement (no oracle for honeypot/rate-limit). */
function neutralAck(): Response {
  return htmlResponse(
    '<!doctype html><meta charset="utf-8"><title>Thanks</title>' +
      "<p>Thanks — your comment is held for review.</p>" +
      '<p><a href="/showcase">Back to the showcase</a></p>',
    200,
  );
}

/**
 * GET /showcase — inert (404) unless SHOWCASE_ENABLED. Degrades gracefully if the
 * comments table/D1 is unavailable (renders page WITHOUT comments rather than throwing).
 */
export async function handleShowcase(req: Request, env: ShowcaseEnv, db: Db): Promise<Response> {
  if (!env.SHOWCASE_ENABLED) return new Response("not found", { status: 404 });

  const now = Date.now();
  let comments: Awaited<ReturnType<typeof listApproved>> = [];
  // Fail-closed UX (codex review): if the salt is missing the POST would 503, so hide
  // the comment form here too — never render a form that cannot be submitted.
  let showComments = !!env.COMMENT_IP_SALT && !!db;
  if (showComments) {
    try {
      await pruneOld(db, now, COMMENT_TTL_MS);          // retention sweep (best-effort)
      comments = await listApproved(db, APPROVED_LIMIT);
    } catch {
      // Migration not applied / D1 unavailable -> hide comments, do not throw (finding #4).
      showComments = false;
      comments = [];
    }
  }

  const buildlog = parseBuildLog(changelogRaw as any);
  const html = renderShowcasePage({ sections: SECTIONS, buildlog, comments, showComments });
  return htmlResponse(html, 200);
}

/**
 * POST /showcase/comments — public, unauthenticated, hardened fail-closed.
 * Order: inert -> preconditions(503) -> content-type(415) -> size cap(413) ->
 * parse -> honeypot/length -> hash IP -> rate limit -> insert pending -> neutral ack.
 */
export async function handleShowcaseComment(req: Request, env: ShowcaseEnv, db: Db): Promise<Response> {
  if (!env.SHOWCASE_ENABLED) return new Response("not found", { status: 404 });

  // Fail closed if the salt or D1 is missing (finding #2/#4). Never write without them.
  if (!env.COMMENT_IP_SALT || !db) {
    return new Response("comments unavailable", { status: 503 });
  }

  const ctype = req.headers.get("content-type") || "";
  if (!ctype.includes("application/x-www-form-urlencoded")) {
    return new Response("unsupported media type", { status: 415 });
  }

  // Body-size cap (finding #2 + codex review). Content-Length char/byte note: a missing or
  // non-numeric Content-Length is rejected (a normal browser form POST always sets it), and
  // we re-check actual UTF-8 byte length after reading so a lying header can't slip past.
  const lenHeader = req.headers.get("content-length");
  const len = lenHeader === null ? NaN : Number(lenHeader);
  if (!Number.isFinite(len) || len > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413 });
  }

  let form: URLSearchParams;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
    form = new URLSearchParams(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const validated = validateComment({
    name: form.get("name") || "",
    body: form.get("body") || "",
    website: form.get("website") || "",
  });

  // Honeypot: silently drop with the SAME neutral ack (no oracle).
  if (!validated.ok && validated.reason === "honeypot") return neutralAck();
  // Empty/over-length: legit UX, return a 400 (not an oracle for spam logic).
  if (!validated.ok) return new Response("invalid comment", { status: 400 });

  const now = Date.now();
  const ipHash = await hashIp(req.headers.get("cf-connecting-ip") || "", env.COMMENT_IP_SALT);
  const sectionRef = normalizeSectionRef(form.get("section_ref"), KNOWN_SECTION_IDS);
  const id = crypto.randomUUID();

  // Fail-closed on ANY D1 error (codex review): a missing showcase_comments table or a
  // D1 outage makes withinRateLimit/insertPending throw — that must be a controlled 503,
  // never an unhandled 500 that writes nothing silently or leaks a stack.
  try {
    // Rate limit: over the cap -> neutral ack, no write (no oracle).
    const ok = await withinRateLimit(db, ipHash, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
    if (!ok) return neutralAck();
    await insertPending(db, { id, createdAt: now, name: validated.name, body: validated.body, ipHash, sectionRef });
  } catch {
    return new Response("comments unavailable", { status: 503 });
  }
  return neutralAck();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/showcase/routes.test.ts`
Expected: PASS.

Note: importing `./changelog.json` requires `resolveJsonModule` in tsconfig (the repo already imports `worker/info/content.json`, so this is already enabled). If typecheck complains, confirm `resolveJsonModule: true` in `tsconfig.json`.

- [ ] **Step 5: Wire the routes into the worker**

In `worker/index.ts`, add the import near the other handler imports:

```ts
import { handleShowcase, handleShowcaseComment } from "./showcase/routes";
```

Then, immediately before the bottom fallthrough (`return new Response("ok")`, ~line 208), add:

```ts
  if (url.pathname === "/showcase" && req.method === "GET") {
    return handleShowcase(req, env, makeDb(env));
  }
  if (url.pathname === "/showcase/comments" && req.method === "POST") {
    return handleShowcaseComment(req, env, makeDb(env));
  }
```

(`makeDb(env)` is the existing helper at ~line 46 that returns the `Db` over `env.DEMO_DB`, honoring the `__db` test seam.)

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add worker/showcase/routes.ts worker/showcase/routes.test.ts worker/index.ts
git commit -m "feat(showcase): public GET /showcase + POST /showcase/comments (inert, fail-closed, strict CSP)"
```

---

## Task 7: Admin moderation routes

**Files:**
- Create: `worker/showcase/admin-moderation.ts`
- Test: `worker/showcase/admin-moderation.test.ts`
- Modify: `worker/access/admin.ts` (wire the routes into `handleAdmin`)

- [ ] **Step 1: Write the failing test**

Create `worker/showcase/admin-moderation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "../access/testdb";
import { handleAdminComments } from "./admin-moderation";
import { insertPending, listApproved } from "./comments";

const ORIGIN = "http://localhost:8787";
function env(): any { return { APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret" }; }

function listReq(): Request {
  return new Request(`${ORIGIN}/admin/comments`, { method: "GET" });
}
function actionReq(id: string, action: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/admin/comments/${id}/${action}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: "{}",
  });
}

describe("admin moderation routes", () => {
  it("GET /admin/comments lists pending rows as escaped HTML", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "<b>n</b>", body: "<script>x</script>", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(listReq(), env(), db);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>x</script>");
  });

  it("approve transitions a pending row and returns ok", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "n", body: "b", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(actionReq("p1", "approve"), env(), db);
    expect(res.status).toBe(200);
    expect((await listApproved(db, 10)).map((r) => r.id)).toEqual(["p1"]);
  });

  it("rejects a cross-site Origin (CSRF defense via guardMutation)", async () => {
    const db = makeTestDb();
    await insertPending(db, { id: "p1", createdAt: 1, name: "n", body: "b", ipHash: "h", sectionRef: null });
    const res = await handleAdminComments(actionReq("p1", "approve", { origin: "https://evil.example" }), env(), db);
    expect(res.status).toBe(403);
    expect((await listApproved(db, 10)).length).toBe(0); // not approved
  });

  it("returns 404 for an unmatched /admin/comments path", async () => {
    const db = makeTestDb();
    const res = await handleAdminComments(new Request(`${ORIGIN}/admin/comments/x/y/z`, { method: "POST" }), env(), db);
    expect(res.status).toBe(404);
  });
});
```

Note: the cross-site-Origin test asserts `guardMutation` returns a 4xx. Confirm its exact status (`grep -n "guardMutation" worker/access/http.ts`); if it returns 400 rather than 403, change the expected status in the test to match the repo's convention. Do not change `guardMutation`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/showcase/admin-moderation.test.ts`
Expected: FAIL — cannot find module `./admin-moderation`.

- [ ] **Step 3: Write the implementation**

Create `worker/showcase/admin-moderation.ts`:

```ts
import type { Db } from "../access/db";
import { json, text, guardMutation } from "../access/http";
import { listPending, moderate } from "./comments";
import { renderModerationPage } from "./render";

const PENDING_LIMIT = 100;

/** Moderator identity for the audit columns: CF Access email if present, else admin-token. */
export function moderatorId(req: Request): string {
  return req.headers.get("cf-access-authenticated-user-email") || "admin-token";
}

/**
 * Handles /admin/comments (GET list) and /admin/comments/:id/{approve,reject} (POST).
 * Called from handleAdmin AFTER adminAuthed has already passed. CSRF defense on the
 * POSTs is guardMutation (Origin + content-type: application/json), matching the repo.
 * Returns 404 if the path is not a comments route (so handleAdmin can keep matching).
 */
export async function handleAdminComments(req: Request, env: { APP_ORIGIN: string }, db: Db): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/admin/comments" && req.method === "GET") {
    const pending = await listPending(db, PENDING_LIMIT);
    return new Response(renderModerationPage(pending), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const m = url.pathname.match(/^\/admin\/comments\/([^/]+)\/(approve|reject)$/);
  if (m && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN);
    if (bad) return bad;
    const id = decodeURIComponent(m[1]);
    const action = m[2] as "approve" | "reject";
    const changed = await moderate(db, id, action, moderatorId(req), Date.now());
    if (!changed) return json({ ok: false, error: "not_pending" }, 404);
    return json({ ok: true });
  }

  return text("not found", 404);
}
```

Note: verify the exact exports of `worker/access/http.ts` (`grep -n "export" worker/access/http.ts`). The Explore report names `json()`, `text()`, `guardMutation()`. If `guardMutation` returns the error Response directly (truthy) vs throws, the `if (bad) return bad;` shape above assumes it RETURNS a Response or `null`. Adjust the call to match its real signature.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/showcase/admin-moderation.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `handleAdmin`**

In `worker/access/admin.ts`:

Add the import at the top:

```ts
import { handleAdminComments } from "../showcase/admin-moderation";
```

Inside `handleAdmin`, BEFORE the final `return text("not found", 404)`, add:

```ts
  if (url.pathname === "/admin/comments" || url.pathname.startsWith("/admin/comments/")) {
    return handleAdminComments(req, env, db);
  }
```

**Confirmed (codex review + grounding):** `handleAdmin` ALREADY enforces auth at its top (`worker/access/admin.ts:33` — `if (!adminAuthed(req, env)) return text("unauthorized", 401);`), which gates every `/admin*` route including the new `/admin/comments*`. **Do NOT add a second gate.** `handleAdminComments` assumes `adminAuthed` has already passed.

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: PASS. (`worker/access/admin.test.ts` still green — the new route is additive.)

- [ ] **Step 7: Commit**

```bash
git add worker/showcase/admin-moderation.ts worker/showcase/admin-moderation.test.ts worker/access/admin.ts
git commit -m "feat(showcase): admin moderation routes (list + approve/reject) wired into handleAdmin"
```

---

## Task 8: No-leak defense-in-depth test + deploy

**Files:**
- Test: `worker/showcase/render.test.ts` (extend)

- [ ] **Step 1: Add the no-leak regression test (finding #7 — defense-in-depth, NOT the guarantee)**

Append to `worker/showcase/render.test.ts`:

```ts
import { renderShowcaseBody } from "./render";
import { SECTIONS } from "./config";

describe("no-leak defense-in-depth (finding #7)", () => {
  it("the showcase BODY (its own source-allowlisted content) has no denylisted internal markers", () => {
    // Assert against renderShowcaseBody, NOT renderShowcasePage: the shared site chrome
    // added by renderInfoPage legitimately contains nav words like "cost engineering"
    // (already public on /info — an allowed source). The leak guarantee is about the
    // showcase's OWN content (curated sections + build-log + comments).
    const body = renderShowcaseBody({
      sections: SECTIONS,
      buildlog: [{ date: "2026-06-16", text: "Public showcase page goes live." }],
      comments: [],
      showComments: true,
    });
    // This is a regression catch, NOT the guarantee. The real guarantee is the strict
    // source allowlist + no import path from pm/journal/git modules + manual moderation.
    const denylist = [/\$\d/, /PM_DASHBOARD_TOKEN/, /worktree/i, /journal/i, /\bcost\b/i];
    for (const re of denylist) expect(body).not.toMatch(re);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run worker/showcase/render.test.ts`
Expected: PASS. (If a curated `bodyHtml` placeholder happens to trip the denylist, fix the curated copy — never weaken the test.)

- [ ] **Step 3: Worker-routing integration tests (codex review — exercise the real boundary)**

The per-handler tests don't prove the routes are actually wired before the `return new Response("ok")` fallthrough, nor that the admin gate fires through `handleAdmin`. Add `worker/showcase/integration.test.ts` driving the real `worker.fetch()` with the `__db` injection seam (the same seam `makeDb` honors at `worker/index.ts:46`). Verify the exact import path of the default worker export first (`grep -n "export default" worker/index.ts`).

```ts
import { describe, it, expect } from "vitest";
import worker from "../index";
import { makeTestDb } from "../access/testdb";

const ORIGIN = "http://localhost:8787";
function baseEnv(extra: Record<string, unknown> = {}): any {
  return { __db: makeTestDb(), APP_ORIGIN: ORIGIN, ADMIN_TOKEN: "secret", ...extra };
}

describe("showcase routing through worker.fetch", () => {
  it("GET /showcase is inert (404) when SHOWCASE_ENABLED is unset", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/showcase`, { method: "GET" }), baseEnv());
    expect(res.status).toBe(404);
  });

  it("GET /showcase renders 200 when enabled", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/showcase`, { method: "GET" }), baseEnv({ SHOWCASE_ENABLED: "1", COMMENT_IP_SALT: "s" }));
    expect(res.status).toBe(200);
  });

  it("unauthenticated POST /admin/comments/x/approve is 401 (handleAdmin gate)", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/admin/comments/x/approve`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: "{}" }),
      baseEnv(),
    );
    expect(res.status).toBe(401);
  });
});
```

Run: `npx vitest run worker/showcase/integration.test.ts`
Expected: PASS. (If the worker's `fetch` signature needs a third `ctx` arg, pass a stub `{} as any`; check `worker/index.ts`'s `fetch(req, env, ctx)` shape.)

- [ ] **Step 4: Full suite + typecheck (final gate)**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/showcase/render.test.ts worker/showcase/integration.test.ts
git commit -m "test(showcase): no-leak regression + worker-routing integration tests"
```

- [ ] **Step 6: Apply the D1 migration (remote)**

The `showcase_comments` table must exist in the live `voygent-demo` D1 before deploy, or `GET /showcase` degrades to no-comments and `POST` 503s.

Run: `npx wrangler d1 migrations apply voygent-demo --remote`
Expected: migration `0006_showcase_comments` applied. Verify:
Run: `npx wrangler d1 execute voygent-demo --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='showcase_comments';"`
Expected: one row.

- [ ] **Step 7: Set the secret**

Run: `npx wrangler secret put COMMENT_IP_SALT`
Enter a long random value (e.g. `openssl rand -hex 32`). This is the HMAC key; rotating it invalidates existing rate-limit grouping (acceptable).

- [ ] **Step 8: Deploy with the feature still OFF**

`SHOWCASE_ENABLED` stays UNSET, so both routes are inert (404) after deploy — ship the code dark, then enable when curated content is written.

Run: `npx wrangler deploy`
Expected: deploy succeeds. Verify inert:
Run: `curl -s -o /dev/null -w "%{http_code}\n" https://demo.voygent.ai/showcase`
Expected: `404`.

- [ ] **Step 9: Enable when ready (separate, deliberate step — not part of this build)**

When curated `config.ts` copy + initial `changelog.json` entries are written, set `SHOWCASE_ENABLED = "1"` in `wrangler.toml` `[vars]` (or via dashboard) and redeploy. Then verify:
Run: `curl -s -o /dev/null -w "%{http_code}\n" https://demo.voygent.ai/showcase`
Expected: `200`. Submit a test comment, confirm it does NOT appear, approve it at `/admin/comments`, confirm it then appears.

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Page route `GET /showcase` + inert toggle → Task 6 (+ finding #4 inert, #6 CSP).
- Views/sections config → Task 2.
- Build-log safe auto-feed → Task 3 (source = `changelog.json`, decision documented).
- Comments storage/schema (incl. `moderated_at`/`moderated_by`, finding #8) → Task 1 + Task 4.
- Submit endpoint (honeypot, caps, rate-limit, fail-closed, body cap, content-type, neutral) → Task 6 (findings #2, #4).
- HMAC IP pseudonymity + retention (finding #3) → Task 4 (`hashIp`, `pruneOld`).
- Display approved-only, escaped (escape-first, finding #5) → Task 5.
- Moderation routes + CSRF (finding #1) + admin-page escaping (finding #5) → Task 7.
- No-leak guarantee reframed (finding #7) → Task 8 + documented in `config.ts`/render comments.
- Strict CSP (finding #6) → Task 6 `SHOWCASE_CSP`.
- Testing matrix from the spec → covered across tasks 2–8.

**2. Placeholder scan** — no "TBD"/"add validation"/"similar to Task N". Every code step has full code. The only intentional placeholders are the curated section `bodyHtml` strings (content authoring, explicitly out of v1 build scope per the spec) and the seed `changelog.json` line.

**3. Type consistency** — `CommentRow` fields (`id`, `created_at`, `author_name`, `body`, `section_ref`) are identical across `comments.ts`, `render.ts`, and tests. `validateComment` returns the same `ValidationResult` shape used in `routes.ts`. `moderate()`/`withinRateLimit()`/`pruneOld()` signatures match their call sites. `SHOWCASE_CSP` is defined once and asserted in tests. `esc`/`renderInfoPage` imports match the exports added/confirmed in Task 5.

**Verification dependencies flagged for the implementer** (resolve in-task, do not guess): exact `guardMutation` return/status (Task 7.1/7.3), `worker/access/http.ts` exports (Task 7.3), `worker.fetch` signature for the integration tests (Task 8.3), `resolveJsonModule` for the changelog import (Task 6 note). (Several earlier unknowns are now confirmed against the live repo — see "Codex review folded in" below.)

## Codex review folded in (2026-06-16, second pass)

A codex external review (`/codex-review`, read-only against the live repo) was run on this plan + spec. Findings folded in:

- **Block-on:** (1) `makeTestDb()` uses a HARDCODED migration list, not a glob → Task 1.2 now mandates adding `0006` to it. (2) `POST /showcase/comments` now wraps D1 ops in try/catch → controlled `503` instead of an unhandled 500 when the table/D1 is missing (+ test). (3) The no-leak test now targets `renderShowcaseBody()` (showcase's own content) instead of the full page — `renderInfoPage`'s nav legitimately contains "cost engineering". (4) `GET /showcase` now hides the comment form when the salt is missing (fail-closed UX) (+ tests).
- **Should-fix:** (5) CSRF rationale corrected — the worker IS CORS-permissive on OPTIONS, so the real defense is `guardMutation`'s exact `Origin === APP_ORIGIN` match (not a preflight barrier). (6) Body cap hardened — reject missing/non-numeric `Content-Length`, re-check UTF-8 byte length after read. (7) `moderate()` is now a single atomic conditional UPDATE trusting `DbResult.changes` (no SELECT-then-UPDATE race). (8) Added `escAttr()` for attribute-context interpolation (esc() doesn't escape quotes). (9) Migration adds `CHECK(length(...))` constraints. (10) Added worker-level `integration.test.ts` (real routing + admin 401 gate).
- **Confirmed fine by codex:** `Db` method shapes, `guardMutation` call shape, no double `adminAuthed` gate, `resolveJsonModule` on, `script-src 'none'` compatible with `renderInfoPage` (inline styles, no script; admin script is on a different route), SQL parameterized (no injection/SSRF/public-XSS).
- **Deferred (nice-to-have):** scheduled/throttled prune instead of delete-on-read (noted as v1 tradeoff); add a discoverability link to `/admin/comments` from the existing admin page (optional, do during wiring).
