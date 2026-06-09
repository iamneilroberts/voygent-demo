# Demo Access Control — Passcode Tickets + Per-Code Budgets + Admin Console

**Date:** 2026-06-09
**Status:** Design — approved in brainstorming, pending spec review
**Repo:** `voygent-demo`
**Topic:** Gate the public demo behind shareable passcodes, each with its own daily + lifetime spend budget, managed from a small admin console.

## Problem

The demo Worker (`voygent-demo`) exposes a money-spending `/chat` endpoint (Anthropic API + Voygent MCP) to the open web. Today it has **good runaway-spend protection but zero access control**:

- **Exists & solid:** global daily USD cap via a reserved Durable Object ledger (`__budget__`, `BUDGET_DAILY_USD` default $5/day, resets at UTC midnight); instant kill switch (`DEMO_DISABLED` secret → 503, no redeploy); tool-catalog clamp (9 of ~79 tools); cheap default model (`claude-haiku-4-5`); accurate per-exchange USD metering (`session-do.ts:247`, ledger add at `:276-280`).
- **Missing:** any authentication (`/chat` is open, `session=anon` default, CORS `*`); per-recipient budgets (only one shared global cap); any lifetime/cumulative ceiling (the ledger resets every UTC day).

Goal: hand a prospective employer / partner / acquirer a **simple URL + passcode**, keep random bots out, and bound spend **per passcode** on both a daily and a lifetime basis — without losing the global cap as a backstop.

## Goals

1. A guest with a valid passcode can use the demo; a guest without one cannot reach `/chat`.
2. Each passcode carries its own **daily USD cap** and **lifetime USD cap**; exceeding either pauses that code (and only that code).
3. The existing **global daily cap stays** as an untouchable backstop beneath everything.
4. Neil can **mint, revoke, and monitor** passcodes from a small admin console, including live spend and usage history per code.
5. Each passcode carries an **audience/view tag** so different recipients (advisor / partner / acquirer) can later get different experiences. (Plumbing now; distinct views later — YAGNI.)

## Non-Goals

- Building the distinct advisor/partner/acquirer views themselves (separate follow-up; this design only carries the `view` tag through auth).
- Self-service guest signup, accounts, or email verification. Codes are minted by Neil and handed out manually.
- Rate limiting beyond budget caps (the USD caps are the throttle).
- Resolving the `demo.voygent.ai` wildcard-routing conflict — tracked as a **separate infra step** (see Deployment), not part of the code work.

## Architecture

Three layers on top of the unchanged global cap:

```
 guest link   demo.voygent.ai/#code=ABC123
      │
      ▼
 ① GATE (SPA)   reads code from URL *fragment* → POST /auth { code }
      │             fragment never sent to server / never in access logs / not in Referer
      ▼
 ② /auth        hash(code) → lookup in D1 → check not-expired & not-revoked
      │             → issue HMAC-signed cookie { codeId, exp } (~24h)
      ▼
 ③ /chat        require valid cookie → re-check code live (revoked/expired?)
      │             → check THIS code's daily + lifetime ledger (D1)
      │             → run exchange → record cost to code ledger + global ledger
      ▼
   global daily $ cap (UNCHANGED) ← backstop if everything above is misconfigured
```

### Fail-open vs fail-closed (deliberate)

- **Auth fails closed:** no valid cookie ⇒ no `/chat`. A DB error during `/auth` returns "try again", never a free pass.
- **Budget check fails open to the global cap:** if D1 is unreachable during the *budget* read, allow the exchange rather than locking out a legitimate guest — the global $5/day still bounds the blast radius. (Matches the existing `dailyBudgetExceeded` try/catch philosophy in `index.ts:6-13`.)
- **Spend recording is best-effort** but uses an atomic SQL increment so it can't corrupt the ledger (see Concurrency).

## Storage — D1

New D1 binding `DEMO_DB` in `wrangler.toml`. First migration creates:

```sql
-- migrations/0001_access_control.sql
CREATE TABLE codes (
  id            TEXT PRIMARY KEY,         -- short slug, e.g. 'advisor', 'acme-partner'
  code_hash     TEXT NOT NULL,            -- HMAC-SHA256(plaintext, CODE_HASH_KEY); plaintext never stored
  label         TEXT NOT NULL,            -- human label for the admin list
  view          TEXT NOT NULL DEFAULT 'default',
  daily_usd     REAL NOT NULL,            -- per-day cap for this code
  total_usd     REAL NOT NULL,            -- lifetime cap for this code
  day_date      TEXT,                     -- UTC 'YYYY-MM-DD' the day_spent applies to
  day_spent     REAL NOT NULL DEFAULT 0,  -- USD spent on day_date
  lifetime_spent REAL NOT NULL DEFAULT 0, -- USD spent ever (never reset)
  expires_at    TEXT,                     -- ISO date/datetime; NULL = no expiry
  revoked       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_codes_hash ON codes(code_hash);

-- Per-exchange usage history → powers admin analytics ("who used what, when").
CREATE TABLE spend_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id     TEXT NOT NULL,
  ts          TEXT NOT NULL,             -- ISO timestamp
  usd         REAL NOT NULL,
  model       TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER
);
CREATE INDEX idx_spend_code_ts ON spend_events(code_id, ts);
```

`codes` holds both definition and live ledger so the budget check is one row read. `spend_events` is append-only history for the admin charts; it's the reason we chose D1 over a Durable Object.

### Concurrency rule (correctness by construction)

Every spend update is a **single SQL statement that increments in the database**, never a JS read-modify-write (which would race across concurrent exchanges for the same code):

```sql
-- Roll the day window if stale, then add this exchange's cost, in one round-trip set:
UPDATE codes
   SET day_spent = CASE WHEN day_date = ?today THEN day_spent ELSE 0 END + ?usd,
       day_date  = ?today,
       lifetime_spent = lifetime_spent + ?usd
 WHERE id = ?codeId;
INSERT INTO spend_events (code_id, ts, usd, model, input_tokens, output_tokens) VALUES (...);
```

SQLite serializes writes, so the increment is atomic. The budget *check* reads the row first and compares; a tiny over-spend on a burst of truly-simultaneous exchanges for one code is acceptable (bounded by one exchange's cost, and the global cap is the hard ceiling).

## Components

### 1. `worker/access/codes.ts` — code store
- `hashCode(plaintext, env)` → HMAC-SHA256 with `CODE_HASH_KEY` secret.
- `lookupByCode(plaintext)` → row or null (validates `revoked=0`, `expires_at` in future).
- `isOverBudget(row)` → `{ over: bool, reason: 'daily'|'lifetime'|null }` using a day-aware read of `day_spent`/`day_date` vs `daily_usd`, and `lifetime_spent` vs `total_usd`.
- `recordSpend(codeId, usd, usage)` → the atomic UPDATE + INSERT above.
- Admin CRUD: `createCode(...)` (generates plaintext, stores hash, returns plaintext once), `revokeCode(id)`, `listCodes()`, `usageForCode(id, sinceTs)`.

### 2. `worker/access/session.ts` — signed cookie
- `issueCookie(codeId)` → `codeId|exp|HMAC(codeId|exp, SESSION_SIGN_KEY)`, ~24h TTL, set `HttpOnly; Secure; SameSite=Lax`.
- `verifyCookie(req)` → `{ codeId } | null` (constant-time HMAC compare, expiry check). Self-verifying; no session table.

### 3. `worker/index.ts` — routing (extends current file)
- `POST /auth { code }` → `lookupByCode` → on success `issueCookie`, return 200 + Set-Cookie; on failure 401 + friendly message.
- `POST /chat` → `verifyCookie` (401 → SPA bounces to gate) → re-`lookupByCode`-by-id for live revoked/expired check → `isOverBudget` (503 with specific reason) → existing global-cap check (unchanged) → into `SessionDO`. Pass `codeId` to the DO so it records spend to the right code.
- `GET /admin` + `('/admin/codes' …)` API gated by `ADMIN_TOKEN` (see Admin).

### 4. `worker/session-do.ts` — spend attribution (minimal change)
- Accept `codeId` (from the request) and, in the `finally` block where it already adds to the global ledger (`:276-280`), also call `recordSpend(codeId, sessionCost, usage)`. The global ledger add stays exactly as-is.

### 5. SPA gate (`src/` React)
- On load: if no valid session (probe via a cheap `GET /auth/me` or a 401 from `/chat`), render the **gate**: a single passcode field + Enter button.
- Read `location.hash` for `#code=…`; if present, pre-fill the field and offer one-click Enter. Strip the fragment from the URL after reading (so it's not left in history/screenshots more than necessary).
- On success, store nothing sensitive client-side (the HttpOnly cookie carries auth); show the demo. On 401 from `/chat` mid-session (expired/revoked), return to the gate with a message.

### 6. Admin console (`src/admin/` or a route)
- `/admin` — gated by `ADMIN_TOKEN` (entered once, held as an admin-only cookie or sent as a bearer to the admin API).
- **Mint:** form (label, view, daily $, total $, expiry) → POST `/admin/codes` → returns the generated code **once** plus a ready-to-copy `https://…/#code=<plaintext>` link.
- **List:** table of codes with `day_spent/daily_usd` and `lifetime_spent/total_usd` as bars, view tag, expiry, revoked state. DELETE/`/admin/codes/:id/revoke` to revoke (effective immediately — next `/chat` re-check fails).
- **History:** per-code usage from `spend_events` (simple list/sparkline of recent exchanges + totals). This is the payoff for choosing D1.

## Secrets / config (new)

| Name | Purpose |
|---|---|
| `CODE_HASH_KEY` | HMAC key for hashing passcodes at rest (so plaintext is never stored). |
| `SESSION_SIGN_KEY` | HMAC key for signing the session cookie. |
| `ADMIN_TOKEN` | Single admin password for `/admin` and the admin API. |

Existing `BUDGET_DAILY_USD`, `DEMO_DISABLED`, `ANTHROPIC_API_KEY`, `VOYGENT_MCP_*`, `LLM_MODEL` are unchanged.

## Error handling & edge cases

- **Bad / expired / revoked code at gate:** 401, friendly "this code isn't valid or has expired."
- **Cookie outlives a revocation:** every `/chat` re-checks the code by id, so a still-valid cookie can't outlive a revoked/expired code.
- **Over daily vs over lifetime:** distinct 503 messages ("daily limit reached, try tomorrow" vs "this demo code's total budget is used up").
- **D1 down during budget read:** fail open to the global cap (logged), don't lock out a legit guest.
- **D1 down during auth:** fail closed ("temporary problem, try again").
- **Concurrency:** atomic SQL increment; no JS read-modify-write on the ledger.
- **Global cap reached:** unchanged behavior — everyone gets the existing 503, regardless of code budget remaining.

## Testing

- **Unit:** `hashCode` determinism + key sensitivity; `verifyCookie` accepts valid / rejects tampered, expired, wrong-key; `isOverBudget` day-rollover logic (stale `day_date` resets the daily window but not lifetime); `recordSpend` atomic increment via two interleaved calls landing the correct sum.
- **Integration (Worker):** `/auth` happy path issues a cookie; `/chat` without cookie → 401; with cookie but over-daily → 503 daily; over-lifetime → 503 lifetime; revoked code mid-session → 401; global cap still trips independently.
- **Admin:** create returns plaintext once + link; revoke blocks next `/chat`; list reflects spend after an exchange; unauthorized admin call → 401.
- Follow existing vitest patterns (`worker/*.test.ts`).

## Deployment (sequenced, separate from code)

1. Create D1 db (`wrangler d1 create voygent-demo`), add `DEMO_DB` binding, apply `0001_access_control.sql`.
2. Set the three new secrets (`CODE_HASH_KEY`, `SESSION_SIGN_KEY`, `ADMIN_TOKEN`).
3. Build SPA + deploy Worker.
4. Mint the first codes from `/admin`; smoke-test gate → chat → budget trip.
5. **Separate infra task (not blocking):** resolve the `*.voygent.ai` wildcard so the demo can serve at a `voygent.ai` URL instead of `voygent-demo.somotravel.workers.dev` (the wildcard currently routes every subdomain to the prod `voygent` Worker — see `wrangler.toml` comment).

## Open follow-ups (out of scope here)

- Distinct advisor / partner / acquirer views keyed off the `view` tag.
- Optional: per-code rate limiting if budget caps prove too coarse.
- Optional: email the mint link directly from `/admin`.
