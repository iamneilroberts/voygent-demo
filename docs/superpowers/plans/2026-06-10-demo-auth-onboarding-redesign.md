# Demo Auth + Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the reel to everyone, add self-serve public access codes (credential-free + emailed), add per-code telemetry, and add a Neil-vetted pro tier that uses real credentials.

**Architecture:** A new `tier` (`public`|`pro`) axis on each code, carried tamper-proof in the HMAC-signed session cookie, selects which Voygent MCP bearer the live session uses. Self-serve `/onboard` issues public codes + emails them via Resend; a richer `/pro-request` captures leads to an admin queue Neil grants from manually. The reel SPA is already served statically by the `[assets]` binding, so making it public is a client-only change.

**Tech Stack:** Cloudflare Workers + Durable Objects, D1 (SQLite via `better-sqlite3` in tests), React SPA (Vite), vitest. Email via Resend REST API.

**Spec:** `docs/superpowers/specs/2026-06-10-demo-auth-onboarding-redesign-design.md`

**Conventions to honor (verified in repo):**
- Money is integer **micro-USD** (`usdToMicros` in `worker/access/money.ts`).
- Worker endpoints are pure handlers `handleX(req, env, db)` tested with `makeTestDb()` (`worker/access/testdb.ts`) + a `Request` built like `worker/access/admin.test.ts`.
- `guardMutation(req, APP_ORIGIN)` + `json()`/`text()` helpers live in `worker/access/http.ts`.
- Codes: `generateCode()`, `hashCode(plaintext, key)`, `createCode()`, `lookupByCode()` in `worker/access/codes.ts`.
- Web unit tests cover **pure `lib/` functions only** — there is NO React-component test harness. Phase A logic is extracted into a pure helper and unit-tested; the `.tsx` wiring is verified by manual smoke.
- Run all tests: `npm run test` (from repo root — it covers both `worker/` and `web/`).

---

## File Structure

**Created:**
- `migrations/0003_tier.sql` — `ALTER TABLE codes ADD COLUMN tier`.
- `migrations/0004_onboarding.sql` — `code_meta` table.
- `migrations/0005_pro_requests.sql` — `pro_requests` table.
- `migrations/0002_stats_code_id.sql` — `ALTER TABLE session_stats ADD COLUMN code_id` (STATS_DB).
- `worker/access/meta.ts` (+ `.test.ts`) — `code_meta` writes/reads + per-IP signup count.
- `worker/access/onboard.ts` (+ `.test.ts`) — `POST /onboard` handler.
- `worker/access/pro-requests.ts` (+ `.test.ts`) — `pro_requests` store + `POST /pro-request` handler.
- `worker/email/resend.ts` (+ `.test.ts`) — Worker-native Resend sender + demo email templates.
- `web/src/lib/access.ts` (+ `.test.ts`) — pure landing/gate/disclaimer decisions.
- `web/src/OnboardingForm.tsx` — public self-serve form.
- `web/src/ProAccessForm.tsx` — pro-access request form.

**Modified:**
- `worker/access/testdb.ts` — load all migrations, not just `0001`.
- `worker/access/codes.ts` — `tier` on create/lookup/list; `pickBearer` helper.
- `worker/access/session.ts` — `tier` in cookie claims.
- `worker/access/admin.ts` + `admin-page.ts` — dashboard + requests queue + grant/deny.
- `worker/index.ts` — route `/onboard`, `/pro-request`; return `tier` from `/auth`+`/auth/me`; forward `x-code-tier`; new Env fields.
- `worker/session-do.ts` — read `x-code-tier`, pick bearer, thread `code_id` into stats.
- `worker/stats.ts` — `code_id` column.
- `web/src/App.tsx` — reel-public gate; onboarding/pro form wiring; disclaimer banner.
- `wrangler.toml` — document new secrets/vars.

---

## Phase A — Reel public (client-only)

### Task A1: Pure landing/gate decision helper

**Files:**
- Create: `web/src/lib/access.ts`
- Test: `web/src/lib/access.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/access.test.ts
import { describe, it, expect } from "vitest";
import { effectiveMode, gateOnGoLive, showPublicDisclaimer } from "./access";

describe("effectiveMode", () => {
  it("forces the reel (auto) for unauthed visitors regardless of stored mode", () => {
    expect(effectiveMode("live", false)).toBe("auto");
    expect(effectiveMode("auto", false)).toBe("auto");
  });
  it("respects the resolved mode once a session exists", () => {
    expect(effectiveMode("live", true)).toBe("live");
    expect(effectiveMode("auto", true)).toBe("auto");
  });
});

describe("gateOnGoLive", () => {
  it("requires onboarding only when crossing to live without a session", () => {
    expect(gateOnGoLive(false)).toBe(true);
    expect(gateOnGoLive(true)).toBe(false);
  });
});

describe("showPublicDisclaimer", () => {
  it("shows for public tier in live mode only", () => {
    expect(showPublicDisclaimer("public", "live")).toBe(true);
    expect(showPublicDisclaimer("public", "auto")).toBe(false);
    expect(showPublicDisclaimer("pro", "live")).toBe(false);
    expect(showPublicDisclaimer(null, "live")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/access.test.ts`
Expected: FAIL — "Failed to resolve import ./access".

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/access.ts
// Pure access/landing decisions, unit-tested without rendering React.
import type { ModeId } from "./mode";

export type Tier = "public" | "pro";

/** Unauthed visitors always land on the reel ("auto"), even if localStorage persisted "live". */
export function effectiveMode(resolved: ModeId, hasSession: boolean): ModeId {
  return hasSession ? resolved : "auto";
}

/** Crossing into live without a session triggers the onboarding form. */
export function gateOnGoLive(hasSession: boolean): boolean {
  return !hasSession;
}

/** The "results are from public sources" banner: public tier, live mode only. */
export function showPublicDisclaimer(tier: Tier | null, mode: ModeId): boolean {
  return tier === "public" && mode === "live";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/access.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/access.ts web/src/lib/access.test.ts
git commit -m "feat(web): pure landing/gate/disclaimer decision helpers"
```

### Task A2: Wire reel-public gate into App.tsx

**Files:**
- Modify: `web/src/App.tsx` (auth-check effect ~`:236-241`; render guard `:406-407`; `goLive` `:355`)

- [ ] **Step 1: Import the Phase-A helpers (boolean `authed` only — tier comes in B6)**

In `App.tsx`, the existing state is `const [mode] = useState<ModeId>(resolveInitialMode);` and `const [authed, setAuthed] = useState<boolean | null>(null);`. Phase A needs no new state — it reuses `authed`. At the top of the component imports add:

```ts
import { effectiveMode, gateOnGoLive } from "./lib/access";
```

The existing auth bootstrap (`authenticate`/`hasSession` returning booleans, ~`:236-241`) is **unchanged** in Phase A. (Task B6 later makes it tier-aware.)

- [ ] **Step 2: Make the reel render for everyone; gate only the live crossing**

Replace the render guard (currently `:406-407`):

```ts
  if (authed === null) return <div style={{ margin: "12vh auto", textAlign: "center", color: "#888" }}>Loading…</div>;
  if (!authed) return <Gate initialCode={pendingCode} onSubmit={async (c) => {
```

with logic that uses `effectiveMode`. Compute once:

```ts
  if (authed === null) return <div style={{ margin: "12vh auto", textAlign: "center", color: "#888" }}>Loading…</div>;
  const effMode = effectiveMode(mode, authed);
  // Reel is public: render it for everyone. Auth is required only to cross into live.
  // (When unauthed, effMode is forced to "auto", so the live branch below is unreachable
  //  until the user explicitly goes live via the CTA, which routes through goLive().)
```

Then ensure every `mode === "auto"` / `mode === "live"` check in the render uses `effMode` instead of `mode` (the reel-render branches around `:444-497`). Leave the existing `<Gate>` available for the "already have a code?" path inside the onboarding form (Task B8).

- [ ] **Step 3: Gate `goLive` on session**

Replace `goLive` (`:355`):

```ts
  function goLive(greet: boolean) {
    persistMode("live");
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mode", "live"); u.searchParams.set("skin", "claude");
      if (greet) u.searchParams.set("greet", "reel"); else u.searchParams.delete("greet");
      window.location.href = u.toString();
    } catch { /* no-op */ }
  }
```

with a version that shows onboarding when unauthed:

```ts
  const [showOnboard, setShowOnboard] = useState(false);
  function goLive(greet: boolean) {
    if (gateOnGoLive(authed === true ? true : false)) { setShowOnboard(true); return; }
    persistMode("live");
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("mode", "live"); u.searchParams.set("skin", "claude");
      if (greet) u.searchParams.set("greet", "reel"); else u.searchParams.delete("greet");
      window.location.href = u.toString();
    } catch { /* no-op */ }
  }
```

(The `<OnboardingForm>` rendered when `showOnboard` is wired in Task B8. Until then, temporarily render the existing `<Gate>` when `showOnboard` so Phase A is shippable alone.)

- [ ] **Step 4: Typecheck + build + manual smoke**

Run: `npx tsc -p web --noEmit` (or the repo's `npm run typecheck` if defined)
Expected: no errors.

Run: `VITE_API_BASE= npm run build:web`
Expected: build succeeds.

Manual smoke (note for the executor): `npx wrangler dev` then open `http://localhost:8787/` in a fresh incognito with NO `#code=` → the reel plays; click "Open the interactive demo" → onboarding/gate appears (not a blank gate on load).

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): make the reel public; gate only the live crossing"
```

---

## Foundation — schema + test DB

### Task F1: New migrations + extend the test DB loader

**Files:**
- Create: `migrations/0003_tier.sql`, `migrations/0004_onboarding.sql`, `migrations/0005_pro_requests.sql`, `migrations/0002_stats_code_id.sql`
- Modify: `worker/access/testdb.ts`
- Test: `worker/access/testdb.test.ts` (new)

- [ ] **Step 1: Write the migration files**

```sql
-- migrations/0003_tier.sql  (DEMO_DB)
ALTER TABLE codes ADD COLUMN tier TEXT NOT NULL DEFAULT 'public';
```

```sql
-- migrations/0004_onboarding.sql  (DEMO_DB)
CREATE TABLE code_meta (
  code_id     TEXT PRIMARY KEY REFERENCES codes(id),
  owner_name  TEXT,
  owner_email TEXT,
  role        TEXT,
  note        TEXT,
  source      TEXT NOT NULL,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_code_meta_iphash_created ON code_meta(ip_hash, created_at);
```

```sql
-- migrations/0005_pro_requests.sql  (DEMO_DB)
CREATE TABLE pro_requests (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  company         TEXT,
  role            TEXT,
  use_case        TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  ip_hash         TEXT,
  created_at      TEXT NOT NULL,
  reviewed_at     TEXT,
  granted_code_id TEXT REFERENCES codes(id)
);
CREATE INDEX idx_pro_requests_status ON pro_requests(status, created_at);
```

```sql
-- migrations/0002_stats_code_id.sql  (STATS_DB)
ALTER TABLE session_stats ADD COLUMN code_id TEXT;
```

- [ ] **Step 2: Write the failing test for the extended test DB**

```ts
// worker/access/testdb.test.ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";

describe("makeTestDb schema", () => {
  it("includes the tier column on codes", async () => {
    const db = makeTestDb();
    const cols = await db.all<{ name: string }>("PRAGMA table_info(codes)");
    expect(cols.map((c) => c.name)).toContain("tier");
  });
  it("includes code_meta and pro_requests tables", async () => {
    const db = makeTestDb();
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'");
    const names = tables.map((t) => t.name);
    expect(names).toContain("code_meta");
    expect(names).toContain("pro_requests");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run worker/access/testdb.test.ts`
Expected: FAIL — `tier` not in columns / `code_meta` missing.

- [ ] **Step 4: Extend `makeTestDb` to load all DEMO_DB migrations in order**

Replace the migration-loading section of `worker/access/testdb.ts`:

```ts
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(HERE, "../../migrations/0001_access_control.sql");
```

```ts
sqlite.exec(readFileSync(MIGRATION, "utf8"));
```

with:

```ts
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  "0001_access_control.sql",
  "0003_tier.sql",
  "0004_onboarding.sql",
  "0005_pro_requests.sql",
].map((f) => join(HERE, "../../migrations", f));
```

```ts
for (const m of MIGRATIONS) sqlite.exec(readFileSync(m, "utf8"));
```

(Do NOT load `0002_info_overrides.sql` or `0002_stats_code_id.sql` — the former is unrelated to DEMO_DB access tables in these tests, the latter targets STATS_DB. If an existing test needs `info_overrides`, it has its own loader.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run worker/access/testdb.test.ts`
Expected: PASS.

Run: `npm run test`
Expected: all pre-existing access tests still PASS (the new columns are additive).

- [ ] **Step 6: Commit**

```bash
git add migrations/0003_tier.sql migrations/0004_onboarding.sql migrations/0005_pro_requests.sql migrations/0002_stats_code_id.sql worker/access/testdb.ts worker/access/testdb.test.ts
git commit -m "feat(db): tier column + code_meta + pro_requests migrations; load them in test DB"
```

---

## Phase B — Public onboarding + email + tier isolation

### Task B1: `tier` on codes (create/lookup/list)

**Files:**
- Modify: `worker/access/codes.ts`
- Test: `worker/access/codes.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `worker/access/codes.test.ts`:

```ts
describe("code tier", () => {
  it("defaults to public and round-trips a pro tier on lookup", async () => {
    const db = makeTestDb();
    const { code: pubCode } = await createCode(db, {
      id: "pub", label: "Public", view: "default",
      dailyMicros: 2_000_000, totalMicros: 20_000_000, expiresAt: null,
    }, HASH_KEY, "2026-06-10T00:00:00Z");
    const { code: proCode } = await createCode(db, {
      id: "pro", label: "Pro", view: "default", tier: "pro",
      dailyMicros: 10_000_000, totalMicros: 50_000_000, expiresAt: null,
    }, HASH_KEY, "2026-06-10T00:00:00Z");

    const pub = await lookupByCode(db, pubCode, HASH_KEY, "2026-06-10T01:00:00Z");
    const pro = await lookupByCode(db, proCode, HASH_KEY, "2026-06-10T01:00:00Z");
    expect(pub?.tier).toBe("public");
    expect(pro?.tier).toBe("pro");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/codes.test.ts -t "code tier"`
Expected: FAIL — `tier` not accepted by `NewCode` / not returned by `lookupByCode`.

- [ ] **Step 3: Implement tier in codes.ts**

In `worker/access/codes.ts`:

Add to `CodeRow`:
```ts
  tier: string;
```
Add to `NewCode`:
```ts
  tier?: "public" | "pro";
```
In `createCode`, change the INSERT to include `tier`:
```ts
  await db.run(
    `INSERT INTO codes (id, code_hash, label, view, tier, daily_micros, total_micros, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [input.id, code_hash, input.label, input.view, input.tier ?? "public",
     input.dailyMicros, input.totalMicros, nowIso],
  );
```
In `listCodes`, add `tier` to the SELECT column list.
Change `lookupByCode` return type + query:
```ts
export async function lookupByCode(
  db: Db, plaintext: string, hashKey: string, nowIso: string,
): Promise<{ id: string; view: string; tier: "public" | "pro" } | null> {
  const code_hash = await hashCode(plaintext, hashKey);
  const row = await db.first<{ id: string; view: string; tier: string }>(
    `SELECT id, view, tier FROM codes
      WHERE code_hash=? AND revoked=0 AND (expires_at IS NULL OR expires_at > ?)`,
    [code_hash, nowIso],
  );
  return row ? { id: row.id, view: row.view, tier: (row.tier === "pro" ? "pro" : "public") } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/codes.test.ts`
Expected: PASS (all existing + the new tier test).

- [ ] **Step 5: Commit**

```bash
git add worker/access/codes.ts worker/access/codes.test.ts
git commit -m "feat(access): tier (public|pro) on code create/lookup/list"
```

### Task B2: `pickBearer` helper (tier → Voygent MCP bearer)

**Files:**
- Modify: `worker/access/codes.ts` (or a small new `worker/access/tier.ts`)
- Test: `worker/access/tier.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// worker/access/tier.test.ts
import { describe, it, expect } from "vitest";
import { pickBearer } from "./tier";

const env = { VOYGENT_MCP_BEARER: "public-bearer", VOYGENT_MCP_BEARER_PRO: "pro-bearer" };

describe("pickBearer", () => {
  it("returns the public bearer for public tier", () => {
    expect(pickBearer("public", env)).toBe("public-bearer");
  });
  it("returns the pro bearer for pro tier", () => {
    expect(pickBearer("pro", env)).toBe("pro-bearer");
  });
  it("returns null for pro tier when the pro bearer is unset (fail closed)", () => {
    expect(pickBearer("pro", { VOYGENT_MCP_BEARER: "public-bearer" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/tier.test.ts`
Expected: FAIL — cannot resolve `./tier`.

- [ ] **Step 3: Implement**

```ts
// worker/access/tier.ts
export type Tier = "public" | "pro";

export interface BearerEnv {
  VOYGENT_MCP_BEARER: string;
  VOYGENT_MCP_BEARER_PRO?: string;
}

/**
 * Pick the Voygent MCP bearer for a session's tier. Pro REQUIRES a configured
 * pro bearer — returns null (caller must fail closed) rather than silently
 * falling back to the public bearer, so a misconfigured pro code can never run
 * on credential-free access and a public code can never reach the pro bearer.
 */
export function pickBearer(tier: Tier, env: BearerEnv): string | null {
  if (tier === "pro") return env.VOYGENT_MCP_BEARER_PRO ?? null;
  return env.VOYGENT_MCP_BEARER;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/tier.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/access/tier.ts worker/access/tier.test.ts
git commit -m "feat(access): pickBearer(tier) — fail-closed pro bearer selection"
```

### Task B3: `code_meta` store + per-IP signup count

**Files:**
- Create: `worker/access/meta.ts`, `worker/access/meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/access/meta.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/meta.test.ts`
Expected: FAIL — cannot resolve `./meta`.

- [ ] **Step 3: Implement**

```ts
// worker/access/meta.ts
import type { Db } from "./db";

export interface CodeMeta {
  codeId: string;
  ownerName: string;
  ownerEmail: string;
  role: string;
  note: string;
  source: "self-serve" | "pro-grant" | "admin";
  ipHash: string;
  createdAt: string;
}

export async function insertCodeMeta(db: Db, m: CodeMeta): Promise<void> {
  await db.run(
    `INSERT INTO code_meta (code_id, owner_name, owner_email, role, note, source, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [m.codeId, m.ownerName, m.ownerEmail, m.role, m.note, m.source, m.ipHash, m.createdAt],
  );
}

/** Count self-serve signups from one ip_hash at or after a cutoff (for rate limiting). */
export async function countSignupsByIpHashSince(db: Db, ipHash: string, sinceIso: string): Promise<number> {
  const row = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM code_meta WHERE ip_hash=? AND created_at>=?",
    [ipHash, sinceIso],
  );
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/access/meta.ts worker/access/meta.test.ts
git commit -m "feat(access): code_meta store + per-ip-hash signup count"
```

### Task B4: Worker-native Resend sender + email templates

**Files:**
- Create: `worker/email/resend.ts`, `worker/email/resend.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/email/resend.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "./resend";

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("no-ops when RESEND_API_KEY is unset", async () => {
    const r = await sendEmail({}, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("posts to Resend with the from address and returns the id", async () => {
    let captured: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      captured = { url: _url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }));
    const r = await sendEmail({ RESEND_API_KEY: "k" }, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(captured.url).toBe("https://api.resend.com/emails");
    expect(captured.body.from).toBe("Voygent <support@voygent.ai>");
    expect(r.success).toBe(true);
    expect(r.messageId).toBe("msg_1");
  });

  it("returns an error (does not throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad", name: "x" } }), { status: 422 })));
    const r = await sendEmail({ RESEND_API_KEY: "k" }, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(r.success).toBe(false);
    expect(r.error).toBe("bad");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/email/resend.test.ts`
Expected: FAIL — cannot resolve `./resend`.

- [ ] **Step 3: Implement (ported from voygent-lite/src/email/resend.ts, Worker-native)**

```ts
// worker/email/resend.ts
// Worker-native Resend sender (ported from voygent-lite/src/email/resend.ts).
// Gated on RESEND_API_KEY: no-ops when unset so the feature ships dark.
// Never throws — all failures are returned.
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "Voygent <support@voygent.ai>";

export interface ResendEnv { RESEND_API_KEY?: string }
export interface EmailOptions { to: string; subject: string; html: string; text?: string; replyTo?: string }
export interface EmailResult { success: boolean; messageId?: string; error?: string }
interface ResendResponse { id?: string; error?: { message: string; name: string } }

export async function sendEmail(env: ResendEnv, opts: EmailOptions): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) return { success: false, error: "Email service not configured" };
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL, to: opts.to, subject: opts.subject,
        html: opts.html, text: opts.text, reply_to: opts.replyTo || "support@voygent.ai",
      }),
    });
    const result = (await res.json()) as ResendResponse;
    if (!res.ok || result.error) return { success: false, error: result.error?.message || `HTTP ${res.status}` };
    return { success: true, messageId: result.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// --- templates ---
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export function demoCodeEmail(code: string, appOrigin: string): { subject: string; html: string; text: string } {
  const link = `${appOrigin}/?mode=live#code=${encodeURIComponent(code)}`;
  return {
    subject: "Your Voygent demo access code",
    html: `<p>Welcome to the Voygent demo.</p>
<p>Your access code: <strong>${esc(code)}</strong></p>
<p><a href="${link}">Open the live demo →</a></p>
<p style="color:#666;font-size:13px">This public demo searches public sources. Reply if you'd like a full credentialed walkthrough.</p>`,
    text: `Your Voygent demo access code: ${code}\nOpen: ${link}\n`,
  };
}

export function proRequestEmail(p: { name: string; email: string; company: string; role: string; useCase: string; note: string }, adminUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: `Voygent pro-access request — ${p.name}`,
    html: `<p><strong>New pro-access request</strong></p>
<ul>
<li>Name: ${esc(p.name)}</li><li>Email: ${esc(p.email)}</li>
<li>Company: ${esc(p.company)}</li><li>Role: ${esc(p.role)}</li>
<li>Use case: ${esc(p.useCase)}</li><li>Note: ${esc(p.note)}</li>
</ul>
<p><a href="${adminUrl}">Review in admin →</a></p>`,
    text: `Pro-access request\nName: ${p.name}\nEmail: ${p.email}\nCompany: ${p.company}\nRole: ${p.role}\nUse case: ${p.useCase}\nNote: ${p.note}\nReview: ${adminUrl}\n`,
  };
}

export function proGrantedEmail(code: string, appOrigin: string): { subject: string; html: string; text: string } {
  const link = `${appOrigin}/?mode=live#code=${encodeURIComponent(code)}`;
  return {
    subject: "Your Voygent pro demo access is ready",
    html: `<p>Your pro-access code is ready: <strong>${esc(code)}</strong></p>
<p><a href="${link}">Open the live demo →</a></p>`,
    text: `Your Voygent pro access code: ${code}\nOpen: ${link}\n`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/email/resend.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/email/resend.ts worker/email/resend.test.ts
git commit -m "feat(email): worker-native Resend sender + demo/pro email templates"
```

### Task B5: `POST /onboard` handler

**Files:**
- Create: `worker/access/onboard.ts`, `worker/access/onboard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/access/onboard.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleOnboard } from "./onboard";
import { makeTestDb } from "./testdb";
import { lookupByCode } from "./codes";

const ORIGIN = "http://localhost:8787";
afterEach(() => vi.restoreAllMocks());

function env(extra: any = {}): any {
  return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, RESEND_API_KEY: "k", ONBOARD_IP_DAILY_CAP: "3", ...extra };
}
function req(body: unknown, ip = "1.2.3.4"): Request {
  return new Request(`${ORIGIN}/onboard`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}
function stubMailOk() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
}

describe("POST /onboard", () => {
  it("issues a public code, persists meta, emails, and returns the code", async () => {
    stubMailOk();
    const db = makeTestDb();
    const res = await handleOnboard(req({ name: "Jo", email: "jo@x.com", role: "pro", note: "hi" }), env(), db);
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; code: string }>();
    expect(body.ok).toBe(true);
    const hit = await lookupByCode(db, body.code, "hk", new Date().toISOString());
    expect(hit?.tier).toBe("public");
    const meta = await db.all<{ owner_email: string; source: string }>("SELECT owner_email, source FROM code_meta");
    expect(meta[0].owner_email).toBe("jo@x.com");
    expect(meta[0].source).toBe("self-serve");
  });

  it("rejects bad input with 400", async () => {
    const res = await handleOnboard(req({ name: "", email: "nope" }), env(), makeTestDb());
    expect(res.status).toBe(400);
  });

  it("rate-limits after the per-ip daily cap (429)", async () => {
    stubMailOk();
    const db = makeTestDb();
    for (let i = 0; i < 3; i++) {
      const ok = await handleOnboard(req({ name: `U${i}`, email: `u${i}@x.com` }), env(), db);
      expect(ok.status).toBe(200);
    }
    const blocked = await handleOnboard(req({ name: "U4", email: "u4@x.com" }), env(), db);
    expect(blocked.status).toBe(429);
  });

  it("still issues the code when email fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const db = makeTestDb();
    const res = await handleOnboard(req({ name: "Jo", email: "jo@x.com" }), env(), db);
    expect(res.status).toBe(200);
    const body = await res.json<{ code: string }>();
    expect(body.code).toMatch(/-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/onboard.test.ts`
Expected: FAIL — cannot resolve `./onboard`.

- [ ] **Step 3: Implement**

```ts
// worker/access/onboard.ts
import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { createCode, hashCode, generateCode } from "./codes";
import { usdToMicros } from "./money";
import { insertCodeMeta, countSignupsByIpHashSince } from "./meta";
import { sendEmail, demoCodeEmail } from "../email/resend";

export interface OnboardEnv {
  CODE_HASH_KEY: string;
  APP_ORIGIN: string;
  RESEND_API_KEY?: string;
  ONBOARD_IP_DAILY_CAP?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = new Set(["travel-pro", "tech-reviewer", "curious", "other", ""]);

export async function handleOnboard(req: Request, env: OnboardEnv, db: Db): Promise<Response> {
  const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
  let b: { name?: string; email?: string; role?: string; note?: string };
  try { b = await req.json(); } catch { return text("bad json", 400); }

  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim();
  const role = (b.role ?? "").trim();
  const note = (b.note ?? "").trim();
  if (!name || name.length > 120) return text("name required", 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return text("valid email required", 400);
  if (note.length > 2000) return text("note too long", 400);
  if (!ROLES.has(role)) return text("invalid role", 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await hashCode(ip, env.CODE_HASH_KEY);
  const cap = Number(env.ONBOARD_IP_DAILY_CAP ?? "3");
  const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  if (await countSignupsByIpHashSince(db, ipHash, dayStart) >= cap) {
    return text("Too many signups from your network today — try again tomorrow or ask Neil directly.", 429);
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 86400_000).toISOString();
  const id = "self-" + generateCode().replace(/-/g, "").slice(0, 12);
  const { code } = await createCode(db, {
    id, label: `${name} <${email}>`, view: "default", tier: "public",
    dailyMicros: usdToMicros(2), totalMicros: usdToMicros(20), expiresAt,
  }, env.CODE_HASH_KEY, nowIso);

  await insertCodeMeta(db, {
    codeId: id, ownerName: name, ownerEmail: email, role, note,
    source: "self-serve", ipHash, createdAt: nowIso,
  });

  // Best-effort email — never blocks issuance.
  const tpl = demoCodeEmail(code, env.APP_ORIGIN);
  await sendEmail(env, { to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });

  return json({ ok: true, code });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/onboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the route into `worker/index.ts`**

Add the import:
```ts
import { handleOnboard } from "./access/onboard";
```
Add `RESEND_API_KEY?: string;`, `VOYGENT_MCP_BEARER_PRO?: string;`, `ONBOARD_IP_DAILY_CAP?: string;`, `NEIL_NOTIFY_EMAIL?: string;`, `DEMO_PUBLIC_LIVE_ENABLED?: string;` to the `Env` interface.
In `fetch`, before the `/auth` block, add:
```ts
    if (url.pathname === "/onboard" && req.method === "POST") {
      return handleOnboard(req, env, db);
    }
```

- [ ] **Step 6: Typecheck + full test**

Run: `npx tsc --noEmit && npm run test`
Expected: clean + all pass.

- [ ] **Step 7: Commit**

```bash
git add worker/access/onboard.ts worker/access/onboard.test.ts worker/index.ts
git commit -m "feat(access): POST /onboard — self-serve public code + meta + email + ip rate-limit"
```

### Task B6: `tier` in the session cookie + `/auth` + `/auth/me`

**Files:**
- Modify: `worker/access/session.ts`, `worker/index.ts`
- Modify (web): `web/src/lib/gate.ts`
- Test: `worker/access/session.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `worker/access/session.test.ts` (match its existing imports/helpers):

```ts
describe("session tier claim", () => {
  it("round-trips tier through issue/verify", async () => {
    const KEY = "sign-key";
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1", tier: "pro" }, KEY, 3600, false);
    const cookieHeader = setCookie.split(";")[0]; // name=value
    const claims = await verifyCookie(cookieHeader, KEY);
    expect(claims?.tier).toBe("pro");
    expect(claims?.codeId).toBe("c1");
  });
});
```

(If the existing test file uses different helper names for parsing the Set-Cookie, mirror those — check the top of `session.test.ts` first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/session.test.ts -t "session tier claim"`
Expected: FAIL — `tier` not part of the claims type/payload.

- [ ] **Step 3: Implement**

In `worker/access/session.ts`, add `tier` to the claims interface and include it in the signed payload + the parsed/verified result (follow the existing serialize/verify shape — `tier` is just another signed field alongside `sid`/`codeId`). Default `tier` to `"public"` on verify if absent (back-compat with cookies issued before this change).

- [ ] **Step 4: Thread tier through `/auth` and `/auth/me` in `worker/index.ts`**

In `/auth`, `lookupByCode` now returns `tier`; pass it into `issueCookie` and return it:
```ts
      const setCookie = await issueCookie({ sid: newSid(), codeId: hit.id, tier: hit.tier }, env.SESSION_SIGN_KEY, COOKIE_TTL_SEC, secure);
      return json({ ok: true, view: hit.view, tier: hit.tier }, 200, { "set-cookie": setCookie });
```
In `/auth/me`, return the tier from the verified claims:
```ts
      return claims ? json({ ok: true, tier: claims.tier ?? "public" }) : text("no session", 401);
```

- [ ] **Step 5: Update the web auth client to surface tier**

Replace `authenticate`/`hasSession` in `web/src/lib/gate.ts` with tier-aware versions:

```ts
import type { Tier } from "./access";

export async function authenticate(apiBase: string, code: string): Promise<{ ok: boolean; tier: Tier | null }> {
  const res = await fetch(`${apiBase}/auth`, {
    method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { ok: false, tier: null };
  const b = await res.json<{ tier?: Tier }>().catch(() => ({} as { tier?: Tier }));
  return { ok: true, tier: b.tier ?? "public" };
}

export async function sessionInfo(apiBase: string): Promise<{ ok: boolean; tier: Tier | null }> {
  try {
    const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    if (!res.ok) return { ok: false, tier: null };
    const b = await res.json<{ tier?: Tier }>().catch(() => ({} as { tier?: Tier }));
    return { ok: true, tier: b.tier ?? "public" };
  } catch { return { ok: false, tier: null }; }
}
```

(Keep a thin `hasSession` wrapper returning `(await sessionInfo(apiBase)).ok` if other call sites use it.)

- [ ] **Step 6: Add `tier` state + tier-aware bootstrap in App.tsx**

Add the import: `import { showPublicDisclaimer, type Tier } from "./lib/access";` (the A2 import of `effectiveMode, gateOnGoLive` stays). Add state near `authed`:
```ts
const [tier, setTier] = useState<Tier | null>(null);
```
Update the auth bootstrap (the block A2 left unchanged, ~`:236-241`) to capture tier from the now-tier-aware client:
```ts
    const code = readCodeFromHash(window.location, window.history);
    (async () => {
      if (code) {
        const r = await authenticate(API_BASE, code);
        if (r.ok) { setAuthed(true); setTier(r.tier); return; }
        setPendingCode(code);
      }
      const me = await sessionInfo(API_BASE);
      setAuthed(me.ok); setTier(me.tier);
    })();
```
(Any other call site of the old boolean `authenticate`/`hasSession` — e.g. the existing `<Gate onSubmit>` — must be updated to read `.ok`.)

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run worker/access/session.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 8: Commit**

```bash
git add worker/access/session.ts worker/access/session.test.ts worker/index.ts web/src/lib/gate.ts web/src/App.tsx
git commit -m "feat(access): carry tier in the signed cookie; return it from /auth and /auth/me"
```

### Task B7: Bearer selection at `/chat` → SessionDO

**Files:**
- Modify: `worker/index.ts` (chat forward), `worker/session-do.ts` (bearer pick), `worker/access/tier.ts` (already has `pickBearer`)

- [ ] **Step 1: Forward `x-code-tier` from the verified cookie**

In `worker/index.ts` `/chat`, the cookie is already verified into `claims`. Add the tier header to the forwarded request:
```ts
        headers: { "content-type": "application/json", "x-code-id": claims.codeId, "x-code-tier": claims.tier ?? "public", "x-est-micros": String(est) },
```

- [ ] **Step 2: Select the bearer in the SessionDO (fail closed for pro)**

In `worker/session-do.ts`, add the import:
```ts
import { pickBearer, type Tier } from "./access/tier";
```
Add `VOYGENT_MCP_BEARER_PRO?: string;` to the DO's `Env`.
At the point where it reads `x-code-id` (`:356`), also read the tier and pick the bearer:
```ts
    const tier = (req.headers.get("x-code-tier") as Tier) ?? "public";
    const bearer = pickBearer(tier, this.env);
    if (!bearer) {
      return new Response("Pro access is not enabled yet — contact Neil.", { status: 503 });
    }
```
Change the MCP client construction (`:388`) from `this.env.VOYGENT_MCP_BEARER` to the selected `bearer`:
```ts
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, bearer);
```

- [ ] **Step 3: Typecheck + full test**

Run: `npx tsc --noEmit && npm run test`
Expected: clean + all pass (the existing DO tests run with `VOYGENT_MCP_BEARER` set → public path unchanged).

- [ ] **Step 4: Commit**

```bash
git add worker/index.ts worker/session-do.ts
git commit -m "feat(access): select Voygent MCP bearer by code tier (pro fails closed when unset)"
```

### Task B8: OnboardingForm + disclaimer banner (client)

**Files:**
- Create: `web/src/OnboardingForm.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Build the form component**

```tsx
// web/src/OnboardingForm.tsx
import { useState } from "react";

export function OnboardingForm({ apiBase, onAuthed, onHaveCode }: {
  apiBase: string;
  onAuthed: (tier: "public" | "pro") => void;
  onHaveCode: () => void;
}) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [role, setRole] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch(`${apiBase}/onboard`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role, note: note.trim() }),
      });
      if (res.status === 429) { setError("Too many signups from your network today. Try again tomorrow."); return; }
      if (!res.ok) { setError("Something went wrong. Please check your details and try again."); return; }
      const { code } = await res.json<{ code: string }>();
      // Auto-authenticate the issuing browser, then proceed to live.
      const a = await fetch(`${apiBase}/auth`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ code }),
      });
      const tier = a.ok ? ((await a.json<{ tier?: "public" | "pro" }>()).tier ?? "public") : "public";
      onAuthed(tier);
    } catch { setError("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: ".25rem" }}>Try the live Voygent demo</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Free, instant access. Results come from public sources.</p>
      <form onSubmit={submit}>
        <input required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)}
          style={field} />
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={field} />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={field}>
          <option value="">Who are you? (optional)</option>
          <option value="travel-pro">Travel professional</option>
          <option value="tech-reviewer">Tech reviewer</option>
          <option value="curious">Just curious</option>
          <option value="other">Other</option>
        </select>
        <textarea placeholder="Anything you want Neil to know? (optional)" value={note}
          onChange={(e) => setNote(e.target.value)} style={{ ...field, minHeight: 64 }} />
        <button disabled={busy || !name.trim() || !email.trim()}
          style={{ ...field, background: "#2b6", color: "#fff", border: 0, cursor: "pointer" }}>
          {busy ? "Setting up…" : "Start the live demo"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
      <p style={{ color: "#888", fontSize: ".8rem" }}>
        We store your name + email to give you demo access and understand usage — ask us to delete it anytime.
      </p>
      <p style={{ fontSize: ".85rem" }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onHaveCode(); }}>Already have a code?</a>
      </p>
    </div>
  );
}

const field: React.CSSProperties = {
  width: "100%", padding: ".6rem", fontSize: "1rem", marginTop: ".5rem",
  border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box",
};
```

- [ ] **Step 2: Wire the form + disclaimer into App.tsx**

- Import: `import { OnboardingForm } from "./OnboardingForm";`
- Declare interim states here: `const [forceGate, setForceGate] = useState(false);` and `const [showProForm, setShowProForm] = useState(false);` (the `<ProAccessForm>` render that consumes `showProForm` is added in Task D4 — declaring it here keeps the banner link compiling).
- When `showOnboard` is true and unauthed, render `<OnboardingForm apiBase={API_BASE} onAuthed={(t) => { setAuthed(true); setTier(t); setShowOnboard(false); goLive(true); }} onHaveCode={() => { setShowOnboard(false); setForceGate(true); }} />`. When `forceGate`, render the existing `<Gate>`.
- Add the public disclaimer banner near the top of the live chat view: `{showPublicDisclaimer(tier, effMode) && (<div className="public-source-banner">Results are from public sources. <a href="#" onClick={(e) => { e.preventDefault(); setShowProForm(true); }}>Request pro access →</a></div>)}`.

- [ ] **Step 3: Typecheck + build + manual smoke**

Run: `npx tsc --noEmit && VITE_API_BASE= npm run build:web`
Expected: clean + build OK.

Manual smoke: reel → CTA → form → submit (against `wrangler dev` with a stubbed/sandbox Resend key or `RESEND_API_KEY` unset so it no-ops) → lands in live with the public-source banner.

- [ ] **Step 4: Commit**

```bash
git add web/src/OnboardingForm.tsx web/src/App.tsx
git commit -m "feat(web): self-serve onboarding form + public-source disclaimer banner"
```

---

## Phase C — Telemetry by code

### Task C1: `code_id` on session_stats

**Files:**
- Modify: `worker/stats.ts`
- Test: `worker/stats.test.ts`

- [ ] **Step 1: Update the failing test**

`stats.test.ts` already asserts `STATS_INSERT_SQL` `?`-count equals `STATS_COLUMNS.length`. Add a test that `code_id` is a column and is bound:

```ts
it("includes code_id as the final bound column", () => {
  expect(STATS_COLUMNS).toContain("code_id");
  const row = statsRowFromSummary(
    { turns: 1, toolCalls: 0, exposedToolCount: 1, fullToolCount: 1,
      inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
      costByModel: { haiku: 0, sonnet: 0, opus: 0 }, actualCostUsd: 0, actualCostByModel: {} },
    { sessionId: "s", exchangeId: "e", tripId: "t", boardsMode: false, liveMode: true,
      routing: { mode: "single", model: "claude-haiku-4-5" } as any, codeId: "c1" } as any,
    0, 123,
  );
  expect(row[STATS_COLUMNS.indexOf("code_id")]).toBe("c1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/stats.test.ts`
Expected: FAIL — `code_id` not in columns / not bound.

- [ ] **Step 3: Implement**

- Add `"code_id"` to the end of `STATS_COLUMNS`.
- Add `codeId?: string;` to `StatsCtx`.
- Append `ctx.codeId ?? null` as the final element of the returned tuple in `statsRowFromSummary`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/stats.test.ts`
Expected: PASS (existing parity test still holds — one more column, one more `?`).

- [ ] **Step 5: Commit**

```bash
git add worker/stats.ts worker/stats.test.ts
git commit -m "feat(stats): add code_id column to session_stats row mapping"
```

### Task C2: Thread `code_id` into the stats write

**Files:**
- Modify: `worker/session-do.ts` (`:716-722`)

- [ ] **Step 1: Pass codeId into the stats ctx**

At the stats write (`:716-722`), the `codeId` is already read at `:356`. Add it to the ctx object:
```ts
              .bind(...statsRowFromSummary(
                summary,
                { sessionId, exchangeId, tripId: this.tripId, boardsMode: this.boardsMode, liveMode: this.liveMode, routing: this.routing, codeId: codeId ?? undefined },
                savedTokens, exchangeTs,
              ))
```

- [ ] **Step 2: Typecheck + full test**

Run: `npx tsc --noEmit && npm run test`
Expected: clean + all pass.

- [ ] **Step 3: Commit**

```bash
git add worker/session-do.ts
git commit -m "feat(stats): thread code_id from the chat session into session_stats"
```

### Task C3: Admin dashboard endpoint

**Files:**
- Modify: `worker/access/admin.ts`
- Test: `worker/access/admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("returns a per-code dashboard joining codes + meta", async () => {
  const db = makeTestDb();
  await handleAdmin(adminReq("/admin/codes", "POST",
    { id: "self-1", label: "Jo", view: "default", dailyUsd: 2, totalUsd: 20 }), env(), db);
  // simulate onboarding meta
  await db.run(
    "INSERT INTO code_meta (code_id, owner_name, owner_email, role, note, source, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?)",
    ["self-1", "Jo", "jo@x.com", "travel-pro", "", "self-serve", "IP", "2026-06-10T00:00:00Z"]);
  const res = await handleAdmin(adminReq("/admin/dashboard", "GET"), env(), db);
  expect(res.status).toBe(200);
  const body = await res.json<{ rows: any[] }>();
  const row = body.rows.find((r) => r.id === "self-1");
  expect(row.owner_email).toBe("jo@x.com");
  expect(row.tier).toBe("public");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/admin.test.ts -t dashboard`
Expected: FAIL — `/admin/dashboard` → 404.

- [ ] **Step 3: Implement the endpoint**

Add a `dashboardRows()` query in `worker/access/admin.ts` and route it. The spend/stats joins are additive — `spend_events` lives in DEMO_DB (joinable here); `session_stats` lives in STATS_DB (a separate binding), so the dashboard joins `codes`+`code_meta`+aggregated `spend_events` in DEMO_DB, and (when `STATS_DB` is bound) decorates with per-code token/tool sums via a second query. For the unit test (no STATS_DB), return the DEMO_DB join:

```ts
// in handleAdmin, after the /admin/codes GET block:
  if (url.pathname === "/admin/dashboard" && req.method === "GET") {
    const rows = await db.all(
      `SELECT c.id, c.label, c.tier, c.view, c.daily_micros, c.total_micros,
              c.day_spent, c.lifetime_spent, c.expires_at, c.revoked, c.created_at,
              m.owner_name, m.owner_email, m.role, m.note, m.source,
              COALESCE(s.runs, 0) AS runs, COALESCE(s.actual, 0) AS actual_micros_total
         FROM codes c
         LEFT JOIN code_meta m ON m.code_id = c.id
         LEFT JOIN (SELECT code_id, COUNT(*) AS runs, SUM(actual_micros) AS actual
                      FROM spend_events GROUP BY code_id) s ON s.code_id = c.id
        ORDER BY c.created_at DESC`,
    );
    return json({ rows });
  }
```

(Per-code engineering stats from STATS_DB — tokens/tool calls/model split grouped by `code_id` — are a follow-on `GET /admin/codes/{id}/stats` that the executor adds when `STATS_DB` is wired into `AdminEnv`; keep it out of the DEMO_DB-only unit test.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/access/admin.ts worker/access/admin.test.ts
git commit -m "feat(admin): GET /admin/dashboard — per-code who/spend rollup"
```

### Task C4: Dashboard view in the admin page

**Files:**
- Modify: `worker/access/admin-page.ts`

- [ ] **Step 1: Add a dashboard section to the admin HTML**

Add a "Who's using the demo" table that fetches `/admin/dashboard` and renders id/label/tier/owner_name/owner_email/role/runs/spend/created. Mirror the existing fetch+render style already in `admin-page.ts` (it already does authed `fetch` for `/admin/codes`). No new test (HTML page; covered by the existing "serves admin HTML" smoke).

- [ ] **Step 2: Typecheck + smoke**

Run: `npx tsc --noEmit`
Expected: clean.

Manual: load `/admin` with the admin token → the new dashboard table renders rows.

- [ ] **Step 3: Commit**

```bash
git add worker/access/admin-page.ts
git commit -m "feat(admin): dashboard table — who's using the demo, by code"
```

---

## Phase D — Pro-access request → vetting → manual grant

### Task D1: `pro_requests` store

**Files:**
- Create: `worker/access/pro-requests.ts`, `worker/access/pro-requests.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/access/pro-requests.test.ts
import { describe, it, expect } from "vitest";
import { makeTestDb } from "./testdb";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/pro-requests.test.ts`
Expected: FAIL — cannot resolve `./pro-requests`.

- [ ] **Step 3: Implement**

```ts
// worker/access/pro-requests.ts
import type { Db } from "./db";

export interface NewProRequest {
  id: string; name: string; email: string; company: string; role: string;
  useCase: string; note: string; ipHash: string; createdAt: string;
}
export interface ProRequestRow extends NewProRequest {
  status: string; reviewed_at: string | null; granted_code_id: string | null;
}

export async function insertProRequest(db: Db, r: NewProRequest): Promise<void> {
  await db.run(
    `INSERT INTO pro_requests (id, name, email, company, role, use_case, note, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [r.id, r.name, r.email, r.company, r.role, r.useCase, r.note, r.ipHash, r.createdAt],
  );
}

export async function listPending(db: Db): Promise<ProRequestRow[]> {
  return db.all<ProRequestRow>(
    "SELECT * FROM pro_requests WHERE status='pending' ORDER BY created_at DESC");
}

export async function getRequest(db: Db, id: string): Promise<ProRequestRow | null> {
  return db.first<ProRequestRow>("SELECT * FROM pro_requests WHERE id=?", [id]);
}

export async function markGranted(db: Db, id: string, codeId: string, reviewedAt: string): Promise<void> {
  await db.run(
    "UPDATE pro_requests SET status='granted', granted_code_id=?, reviewed_at=? WHERE id=?",
    [codeId, reviewedAt, id]);
}

export async function markDenied(db: Db, id: string, reviewedAt: string): Promise<void> {
  await db.run("UPDATE pro_requests SET status='denied', reviewed_at=? WHERE id=?", [reviewedAt, id]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/pro-requests.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/access/pro-requests.ts worker/access/pro-requests.test.ts
git commit -m "feat(access): pro_requests store (insert/list/get/grant/deny)"
```

### Task D2: `POST /pro-request` handler

**Files:**
- Create: `worker/access/pro-request-handler.ts`, `worker/access/pro-request-handler.test.ts`
- Modify: `worker/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// worker/access/pro-request-handler.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { handleProRequest } from "./pro-request-handler";
import { makeTestDb } from "./testdb";
import { listPending } from "./pro-requests";

const ORIGIN = "http://localhost:8787";
afterEach(() => vi.restoreAllMocks());
function env(): any { return { CODE_HASH_KEY: "hk", APP_ORIGIN: ORIGIN, RESEND_API_KEY: "k", NEIL_NOTIFY_EMAIL: "neil@x.com" }; }
function req(body: unknown): Request {
  return new Request(`${ORIGIN}/pro-request`, { method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "cf-connecting-ip": "1.1.1.1" },
    body: JSON.stringify(body) });
}

describe("POST /pro-request", () => {
  it("captures a pending request and emails Neil, without issuing a code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "m1" }), { status: 200 })));
    const db = makeTestDb();
    const res = await handleProRequest(req({ name: "Jo", email: "jo@x.com", company: "Acme", role: "VP", useCase: "eval" }), env(), db);
    expect(res.status).toBe(200);
    expect(await listPending(db)).toHaveLength(1);
    const codes = await db.all("SELECT * FROM codes");
    expect(codes).toHaveLength(0); // NO code issued
  });

  it("rejects bad input", async () => {
    const res = await handleProRequest(req({ name: "", email: "nope" }), env(), makeTestDb());
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/pro-request-handler.test.ts`
Expected: FAIL — cannot resolve `./pro-request-handler`.

- [ ] **Step 3: Implement**

```ts
// worker/access/pro-request-handler.ts
import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { hashCode, generateCode } from "./codes";
import { insertProRequest } from "./pro-requests";
import { sendEmail, proRequestEmail } from "../email/resend";

export interface ProRequestEnv {
  CODE_HASH_KEY: string; APP_ORIGIN: string;
  RESEND_API_KEY?: string; NEIL_NOTIFY_EMAIL?: string;
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function handleProRequest(req: Request, env: ProRequestEnv, db: Db): Promise<Response> {
  const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
  let b: { name?: string; email?: string; company?: string; role?: string; useCase?: string; note?: string };
  try { b = await req.json(); } catch { return text("bad json", 400); }

  const name = (b.name ?? "").trim(); const email = (b.email ?? "").trim();
  if (!name || name.length > 120) return text("name required", 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return text("valid email required", 400);
  const company = (b.company ?? "").trim().slice(0, 200);
  const role = (b.role ?? "").trim().slice(0, 120);
  const useCase = (b.useCase ?? "").trim().slice(0, 2000);
  const note = (b.note ?? "").trim().slice(0, 2000);

  const ip = req.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await hashCode(ip, env.CODE_HASH_KEY);
  const id = "pro-" + generateCode().replace(/-/g, "").slice(0, 12);
  const createdAt = new Date().toISOString();

  await insertProRequest(db, { id, name, email, company, role, useCase, note, ipHash, createdAt });

  if (env.NEIL_NOTIFY_EMAIL) {
    const tpl = proRequestEmail({ name, email, company, role, useCase, note }, `${env.APP_ORIGIN}/admin`);
    await sendEmail(env, { to: env.NEIL_NOTIFY_EMAIL, subject: tpl.subject, html: tpl.html, text: tpl.text, replyTo: email });
  }
  return json({ ok: true });
}
```

- [ ] **Step 4: Wire the route into `worker/index.ts`**

```ts
import { handleProRequest } from "./access/pro-request-handler";
// ... near /onboard:
    if (url.pathname === "/pro-request" && req.method === "POST") {
      return handleProRequest(req, env, db);
    }
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run worker/access/pro-request-handler.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add worker/access/pro-request-handler.ts worker/access/pro-request-handler.test.ts worker/index.ts
git commit -m "feat(access): POST /pro-request — lead capture + email Neil, no auto-issue"
```

### Task D3: Admin grant/deny endpoints

**Files:**
- Modify: `worker/access/admin.ts`
- Test: `worker/access/admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("lists pending pro requests and grants one (creates a pro code + meta, emails requester)", async () => {
  vi.stubGlobal?.("fetch", undefined); // ensure no real fetch; or import vi and stub a 200
  const db = makeTestDb();
  await db.run(
    `INSERT INTO pro_requests (id, name, email, company, role, use_case, note, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ["pro-1", "Jo", "jo@x.com", "Acme", "VP", "eval", "", "IP", "2026-06-10T00:00:00Z"]);

  const pending = await (await handleAdmin(adminReq("/admin/requests", "GET"), env(), db)).json<{ requests: any[] }>();
  expect(pending.requests).toHaveLength(1);

  const granted = await handleAdmin(
    adminReq("/admin/requests/pro-1/grant", "POST", { dailyUsd: 10, totalUsd: 50, expiresAt: null }), env(), db);
  expect(granted.status).toBe(200);
  const code = (await granted.json<{ code: string }>()).code;
  expect(code).toMatch(/-/);
  const codes = await db.all<{ tier: string }>("SELECT tier FROM codes");
  expect(codes[0].tier).toBe("pro");
  const meta = await db.all<{ source: string }>("SELECT source FROM code_meta");
  expect(meta[0].source).toBe("pro-grant");
});
```

(Note for executor: add `vi` import + a 200 fetch stub at the top of `admin.test.ts` for the email send, mirroring `onboard.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/access/admin.test.ts -t "pro requests"`
Expected: FAIL — `/admin/requests` → 404.

- [ ] **Step 3: Implement in `worker/access/admin.ts`**

Add `RESEND_API_KEY?: string` to `AdminEnv`. Add routes:

```ts
  // List pending pro requests.
  if (url.pathname === "/admin/requests" && req.method === "GET") {
    return json({ requests: await listPending(db) });
  }
  // Grant a pro request → create a pro code + meta, mark granted, email requester.
  const grant = url.pathname.match(/^\/admin\/requests\/([^/]+)\/grant$/);
  if (grant && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    const reqRow = await getRequest(db, decodeURIComponent(grant[1]));
    if (!reqRow || reqRow.status !== "pending") return text("not found", 404);
    const b = await req.json<{ dailyUsd: number; totalUsd: number; expiresAt?: string | null }>();
    const nowIso = new Date().toISOString();
    const id = "pro-" + generateCode().replace(/-/g, "").slice(0, 12);
    const { code } = await createCode(db, {
      id, label: `${reqRow.name} <${reqRow.email}>`, view: "default", tier: "pro",
      dailyMicros: usdToMicros(b.dailyUsd), totalMicros: usdToMicros(b.totalUsd),
      expiresAt: b.expiresAt ?? null,
    }, env.CODE_HASH_KEY, nowIso);
    await insertCodeMeta(db, { codeId: id, ownerName: reqRow.name, ownerEmail: reqRow.email,
      role: reqRow.role, note: reqRow.note, source: "pro-grant", ipHash: reqRow.ip_hash ?? "", createdAt: nowIso });
    await markGranted(db, reqRow.id, id, nowIso);
    const tpl = proGrantedEmail(code, env.APP_ORIGIN);
    await sendEmail(env, { to: reqRow.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    return json({ ok: true, code, link: `${env.APP_ORIGIN}/?mode=live#code=${code}` });
  }
  // Deny.
  const deny = url.pathname.match(/^\/admin\/requests\/([^/]+)\/deny$/);
  if (deny && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    await markDenied(db, decodeURIComponent(deny[1]), new Date().toISOString());
    return json({ ok: true });
  }
```

Add imports at the top of `admin.ts`:
```ts
import { generateCode } from "./codes";
import { insertCodeMeta } from "./meta";
import { listPending, getRequest, markGranted, markDenied } from "./pro-requests";
import { sendEmail, proGrantedEmail } from "../email/resend";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/access/admin.test.ts`
Expected: PASS (all existing + the new pro-requests tests).

- [ ] **Step 5: Commit**

```bash
git add worker/access/admin.ts worker/access/admin.test.ts
git commit -m "feat(admin): pro-request queue — list, grant (issue pro code), deny"
```

### Task D4: ProAccessForm + admin queue UI

**Files:**
- Create: `web/src/ProAccessForm.tsx`
- Modify: `web/src/App.tsx`, `worker/access/admin-page.ts`

- [ ] **Step 1: Build `ProAccessForm.tsx`**

```tsx
// web/src/ProAccessForm.tsx
import { useState } from "react";

export function ProAccessForm({ apiBase, onDone }: { apiBase: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", company: "", role: "", useCase: "", note: "" });
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch(`${apiBase}/pro-request`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify(f),
      });
      if (!res.ok) { setError("Couldn't submit. Check your details and try again."); return; }
      setSent(true);
    } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }

  if (sent) return (
    <div style={{ maxWidth: 440, margin: "12vh auto", fontFamily: "system-ui", textAlign: "center" }}>
      <h2>Thanks — request received</h2>
      <p style={{ color: "#666" }}>Neil will review and email you a credentialed access code.</p>
      <button onClick={onDone} style={btn}>Back to the demo</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 440, margin: "8vh auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.3rem" }}>Request full (credentialed) access</h1>
      <p style={{ color: "#666", marginTop: 0 }}>For travel pros & partners — build real trips with live supplier data. Neil reviews each request.</p>
      <form onSubmit={submit}>
        <input required placeholder="Name" value={f.name} onChange={set("name")} style={field} />
        <input required type="email" placeholder="Email" value={f.email} onChange={set("email")} style={field} />
        <input placeholder="Company / agency" value={f.company} onChange={set("company")} style={field} />
        <input placeholder="Your role" value={f.role} onChange={set("role")} style={field} />
        <textarea placeholder="What do you want to evaluate?" value={f.useCase} onChange={set("useCase")} style={{ ...field, minHeight: 64 }} />
        <textarea placeholder="Anything else? (optional)" value={f.note} onChange={set("note")} style={{ ...field, minHeight: 48 }} />
        <button disabled={busy || !f.name.trim() || !f.email.trim()} style={{ ...btn, width: "100%" }}>
          {busy ? "Submitting…" : "Request access"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
      <p style={{ fontSize: ".85rem" }}><a href="#" onClick={(e) => { e.preventDefault(); onDone(); }}>← Back</a></p>
    </div>
  );
}
const field: React.CSSProperties = { width: "100%", padding: ".6rem", fontSize: "1rem", marginTop: ".5rem", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: ".55rem 1rem", border: 0, borderRadius: 8, background: "#2b6", color: "#fff", cursor: "pointer", marginTop: ".6rem" };
```

- [ ] **Step 2: Wire into App.tsx**

The `showProForm` state was declared in Task B8. Import `import { ProAccessForm } from "./ProAccessForm";` and render `<ProAccessForm apiBase={API_BASE} onDone={() => setShowProForm(false)} />` when `showProForm` is true (place this guard ahead of the normal render, like `forceGate`). The public-source banner's "Request pro access →" link already calls `setShowProForm(true)`; also add a "want full credentialed access?" link in `OnboardingForm` that calls it (thread a `onWantPro` prop through, or surface the link in App near the form).

- [ ] **Step 3: Admin queue UI in `admin-page.ts`**

Add a "Pending pro requests" section that fetches `/admin/requests` and renders each with name/email/company/role/use-case + budget inputs (daily/total/expiry) → `POST /admin/requests/{id}/grant`, and a Deny button → `/deny`. Mirror the existing authed-fetch style.

- [ ] **Step 4: Typecheck + build + smoke**

Run: `npx tsc --noEmit && VITE_API_BASE= npm run build:web`
Expected: clean + build OK.

Manual: public banner → "Request pro access" → form → submit → "request received"; `/admin` shows it pending → grant → requester would receive a code.

- [ ] **Step 5: Commit**

```bash
git add web/src/ProAccessForm.tsx web/src/App.tsx worker/access/admin-page.ts
git commit -m "feat(web): pro-access request form + admin pending-request queue UI"
```

---

## Final: docs + deploy notes (no code)

### Task Z1: Update wrangler.toml comments + a deploy runbook note

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Document new secrets/vars**

In the secrets comment block of `wrangler.toml`, add: `RESEND_API_KEY` (reuse the existing Voygent value), `VOYGENT_MCP_BEARER_PRO` (Neil's real-cred identity), and `[vars]` `NEIL_NOTIFY_EMAIL`, `ONBOARD_IP_DAILY_CAP` (default 3), `DEMO_PUBLIC_LIVE_ENABLED`. Add a one-line warning: **`VOYGENT_MCP_BEARER` must be a credential-free Voygent identity before public live runs.**

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "docs(wrangler): document tier bearers, Resend, notify-email, ip-cap vars"
```

---

## Pre-merge verification

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run test` — all green (new suites: access.test, testdb.test, tier.test, meta.test, resend.test, onboard.test, session tier, stats code_id, admin dashboard + requests, pro-requests, pro-request-handler).
- [ ] Manual smoke against `wrangler dev` with `RESEND_API_KEY` unset (email no-ops): reel public → onboard → live with public banner → pro-request → admin queue → grant.

## Deploy order (after merge — see spec §"Deploy order")
1. `wrangler secret put RESEND_API_KEY` (reuse existing value).
2. Confirm/repoint `VOYGENT_MCP_BEARER` to a **credential-free** identity; `wrangler secret put VOYGENT_MCP_BEARER_PRO` (real creds).
3. Set `[vars]`: `NEIL_NOTIFY_EMAIL`, `ONBOARD_IP_DAILY_CAP`, `DEMO_PUBLIC_LIVE_ENABLED`.
4. Apply migrations: DEMO_DB `0003_tier`, `0004_onboarding`, `0005_pro_requests`; STATS_DB `0002_stats_code_id` (all `--remote`).
5. `VITE_API_BASE= npm run build:web` → `wrangler deploy`.
- Phase A may ship standalone ahead of 1–5.
