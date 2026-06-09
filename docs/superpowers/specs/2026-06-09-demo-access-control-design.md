# Demo Access Control — Passcode Tickets + Per-Code Budgets + Admin Console

**Date:** 2026-06-09
**Status:** Design — approved in brainstorming, hardened after Codex review (2026-06-09), pending final spec review
**Repo:** `voygent-demo`
**Topic:** Gate the public demo behind shareable passcodes, each with its own daily + lifetime spend budget, managed from a small admin console.

> **Revision note (2026-06-09):** hardened after an external Codex security/concurrency review. Key changes from the first draft: budget enforcement is now **reserve-then-reconcile** via a single conditional primary-routed `UPDATE` (was check-then-record, which didn't actually bound concurrent spend); a **server-issued session id** replaces the client-controlled `?session=` param; wildcard CORS is **removed**; admin uses **Cloudflare Access** (token fallback hardened); codes are **high-entropy** with uniform 401s + rate limiting; money is stored as **integer micro-USD**; ledger writes use D1 `batch()`. See "Findings folded in from review" at the end.

## Problem

The demo Worker (`voygent-demo`) exposes a money-spending `/chat` endpoint (Anthropic API + Voygent MCP) to the open web. Today it has **good runaway-spend protection but zero access control**:

- **Exists & solid:** global daily USD cap via a reserved Durable Object ledger (`__budget__`, `BUDGET_DAILY_USD` default $5/day, resets at UTC midnight); instant kill switch (`DEMO_DISABLED` secret → 503, no redeploy); tool-catalog clamp (9 of ~79 tools); cheap default model (`claude-haiku-4-5`); accurate per-exchange USD metering (`session-do.ts:247`, ledger add at `:276-280`).
- **Missing:** any authentication (`/chat` is open, `session=anon` default, CORS `*`); per-recipient budgets (only one shared global cap); any lifetime/cumulative ceiling (the ledger resets every UTC day); a trustworthy session identity (the `?session=` param is client-controlled — see High finding #3).

Goal: hand a prospective employer / partner / acquirer a **simple URL + passcode**, keep random bots out, and bound spend **per passcode** on both a daily and a lifetime basis — without losing the global cap as a backstop.

## Goals

1. A guest with a valid passcode can use the demo; a guest without one cannot reach `/chat`.
2. Each passcode carries its own **daily USD cap** and **lifetime USD cap**; exceeding either pauses that code (and only that code), enforced *before* spend, not after.
3. The existing **global daily cap stays** as an untouchable backstop beneath everything.
4. Neil can **mint, revoke, and monitor** passcodes from a small admin console, including live spend and usage history per code.
5. Each passcode carries an **audience/view tag** so different recipients (advisor / partner / acquirer) can later get different experiences. (Plumbing now; distinct views later — YAGNI.)
6. Each authenticated guest gets an **isolated conversation/trip session** that cannot collide with or be targeted by another guest.

## Non-Goals

- Building the distinct advisor/partner/acquirer views themselves (separate follow-up; this design only carries the `view` tag through auth).
- Self-service guest signup, accounts, or email verification. Codes are minted by Neil and handed out manually.
- Rate limiting beyond budget caps and a basic `/auth` brute-force throttle (the USD caps are the spend throttle).
- Resolving the `demo.voygent.ai` wildcard-routing conflict — tracked as a **separate infra step** (see Deployment), not part of the code work.

## Architecture

Three layers on top of the unchanged global cap:

```
 guest link   demo.voygent.ai/#code=<high-entropy>
      │
      ▼
 ① GATE (SPA)   reads code from URL *fragment* → history.replaceState strips it
      │             → POST /auth { code }   (Origin-checked, JSON only)
      │             fragment never sent to server / never in access logs / not in Referer
      ▼
 ② /auth        hash(code) → primary-consistent lookup in D1 → not-expired & not-revoked
      │             → mint random session id (sid) → issue HMAC-signed __Host cookie
      │             { sid, codeId, exp, kid }   (~12h);  uniform 401 on any failure
      ▼
 ③ /chat        verify cookie → ADMISSION: one conditional UPDATE (primary) that atomically
      │             checks revoked=0 AND not-expired AND reserved+estCost ≤ daily & lifetime caps,
      │             and books estCost. changes=0 ⇒ 503 (fail closed).
      │             → run exchange in DO derived from trusted sid (NOT client param)
      │             → RECONCILE: batch() trues estCost→actualCost + inserts spend_events row
      ▼
   global daily $ cap (UNCHANGED) ← backstop if everything above is misconfigured
```

### Fail-open vs fail-closed (revised — auth-critical paths fail closed)

- **Auth fails closed:** no valid cookie ⇒ no `/chat`. A DB error during `/auth` returns a uniform "try again", never a free pass.
- **Admission fails closed:** the budget/revocation/expiry decision is a single conditional *write* to D1's primary. If it can't be confirmed (error or `changes=0`), the exchange is refused. This replaces the first draft's fail-open budget *read* (which contradicted "bound spend per passcode").
- **Reconcile is best-effort but atomic:** the post-exchange true-up uses `batch()` so the ledger and history can't diverge; if it fails, the conservative `estCost` stays booked (errs toward *under*-spending, never over).
- The pre-existing **global cap** keeps its current behavior (fails open to the $5/day ceiling) — it's the backstop, not the per-code gate.

## Storage — D1

New D1 binding `DEMO_DB` in `wrangler.toml`. **Money is stored as integer micro-USD** (1 USD = 1,000,000) to avoid floating-point drift. First migration:

```sql
-- migrations/0001_access_control.sql
CREATE TABLE codes (
  id             TEXT PRIMARY KEY,         -- short slug, e.g. 'advisor', 'acme-partner'
  code_hash      TEXT NOT NULL,            -- HMAC-SHA256(plaintext, CODE_HASH_KEY); plaintext never stored
  label          TEXT NOT NULL,            -- human label for the admin list
  view           TEXT NOT NULL DEFAULT 'default',
  daily_micros   INTEGER NOT NULL,         -- per-day cap (micro-USD)
  total_micros   INTEGER NOT NULL,         -- lifetime cap (micro-USD)
  day_date       TEXT,                     -- UTC 'YYYY-MM-DD' the day_spent applies to
  day_spent      INTEGER NOT NULL DEFAULT 0,  -- micro-USD booked on day_date (incl. live reservations)
  lifetime_spent INTEGER NOT NULL DEFAULT 0,  -- micro-USD booked ever (never reset)
  expires_at     TEXT,                     -- ISO datetime; NULL = no expiry
  revoked        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_codes_hash ON codes(code_hash);

-- Per-exchange usage history → powers admin analytics. Idempotency key prevents double-count on retry.
CREATE TABLE spend_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id       TEXT NOT NULL REFERENCES codes(id),
  exchange_id   TEXT NOT NULL UNIQUE,      -- idempotency key (the exchangeId already minted in session-do.ts)
  ts            TEXT NOT NULL,             -- ISO timestamp
  est_micros    INTEGER NOT NULL,          -- what admission booked
  actual_micros INTEGER NOT NULL,          -- reconciled cost
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER
);
CREATE INDEX idx_spend_code_ts ON spend_events(code_id, ts);
```

`day_spent`/`lifetime_spent` hold **booked** spend, which includes in-flight reservations (admission books `estCost` up front, reconcile trues it to `actualCost`). This is the simpler of two correct designs; the alternative — separate `*_reserved` columns — is more precise but adds bookkeeping we don't need at demo volume. Noted as an option, not chosen.

### Admission — the single conditional write (resolves the Critical + both D1 Highs)

All of "is this code live?" and "does it have budget?" happen in **one statement routed to D1's primary** (writes always are), so there is no read-replica staleness and no check-then-act TOCTOU:

```sql
UPDATE codes
   SET day_spent      = (CASE WHEN day_date = ?today THEN day_spent ELSE 0 END) + ?est,
       day_date       = ?today,
       lifetime_spent = lifetime_spent + ?est
 WHERE id = ?codeId
   AND revoked = 0
   AND (expires_at IS NULL OR expires_at > ?now)
   AND (CASE WHEN day_date = ?today THEN day_spent ELSE 0 END) + ?est <= daily_micros
   AND lifetime_spent + ?est <= total_micros;
```

Check `result.meta.changes`: `1` ⇒ admitted (proceed), `0` ⇒ refused — and we then do **one** cheap follow-up read to disambiguate the 503 reason (revoked/expired vs daily vs lifetime) for the message only. `?est` is a conservative per-exchange estimate (a tunable `EST_EXCHANGE_MICROS`, sized to a plausible max single-exchange cost on the configured model). Because each code is realistically used by ~1 person, the estimate is small and the global cap remains the hard ceiling.

### Reconcile — atomic true-up after the exchange

In the DO's existing `finally` block (where it already adds to the global ledger, `session-do.ts:276-280`), run a D1 `batch()` of two statements so ledger + history commit together:

```sql
-- 1) replace the estimate with the real cost
UPDATE codes SET day_spent = day_spent - ?est + ?actual,
                 lifetime_spent = lifetime_spent - ?est + ?actual
 WHERE id = ?codeId;
-- 2) record history (idempotent on exchange_id)
INSERT OR IGNORE INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros, model, input_tokens, output_tokens)
VALUES (?codeId, ?exchangeId, ?ts, ?est, ?actual, ?model, ?in, ?out);
```

If the exchange throws before reconcile, the `est` stays booked (conservative). The existing global-ledger add is unchanged.

## Components

### 1. `worker/access/codes.ts` — code store (all D1)
- `hashCode(plaintext, env)` → HMAC-SHA256 with `CODE_HASH_KEY`.
- `generateCode()` → ≥128-bit random, base32 (Crockford), grouped for readability (e.g. `k7m2-9x4p-w3rq-h8tn`). Returned to admin **once**; only the hash is stored.
- `admit(codeId, estMicros, now, today)` → runs the conditional UPDATE; returns `{ admitted: boolean }`. On `false`, a follow-up `lookupReason(codeId)` classifies the 503.
- `reconcile(codeId, exchangeId, estMicros, actualMicros, usage)` → the `batch()` above.
- Admin CRUD: `createCode(...)`, `revokeCode(id)`, `listCodes()`, `usageForCode(id, sinceTs)`.
- Reads that must be fresh (admin views can tolerate slight lag; none here are auth-critical because admission is a write).

### 2. `worker/access/session.ts` — signed cookie
- `issueCookie(sid, codeId)` → payload `base64url(JSON {sid, codeId, exp, kid})` + `.` + `base64url(HMAC(payload, SESSION_SIGN_KEY[kid]))`. Set as
  `__Host-demo_session=…; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` (12h). No `Domain` (so `__Host-` is valid).
- `verifyCookie(req)` → `{ sid, codeId } | null`. Constant-time HMAC compare; supports a small **key ring** keyed by `kid` for rotation; expiry check. Self-verifying; no session table. Treated as a replayable bearer until expiry (hence the short TTL).
- `newSid()` → random 128-bit id.

### 3. `worker/index.ts` — routing (extends current file)
- **Remove wildcard CORS.** SPA is served same-origin from this Worker (`[assets]` in `wrangler.toml`), so cross-origin headers aren't needed. Keep a minimal `OPTIONS` only if a preflight is actually observed; never emit `*` alongside credentials.
- **Origin/CSRF guard** (shared helper): every state-changing POST (`/auth`, `/chat`, `/admin/*`) requires `Origin` to equal the deployment origin and `Content-Type: application/json`; otherwise 403.
- `POST /auth { code }` → `hashCode` → D1 lookup (live + not expired) → on success `newSid()` + `issueCookie`, 200 + Set-Cookie; on **any** failure a **uniform 401** ("this code isn't valid") — no distinction between unknown/expired/revoked (anti-oracle). `/auth` is **rate-limited per IP** (and globally) to blunt online guessing.
- `POST /chat` → `verifyCookie` (401 → SPA returns to gate) → `admit(codeId, EST)` (changes=0 → 503 with reason) → existing global-cap check (unchanged) → into the DO **whose id is derived from the trusted `sid`** (the client `?session=` param is ignored). Pass `codeId` + `exchangeId` + `est` to the DO for reconcile.
- `GET /admin` + admin API: gated by **Cloudflare Access** (preferred) or `ADMIN_TOKEN` fallback (see Admin).

### 4. `worker/session-do.ts` — session identity + spend attribution
- **Session id comes from the trusted `sid`** passed by `index.ts`, not from a client query param. `tripId` derivation stays per-DO; conversation/trip state is now isolated per authenticated session.
- In the `finally` block (`:276-280`), in addition to the unchanged global-ledger add, call `reconcile(codeId, exchangeId, est, actualMicros, usage)`.

### 5. SPA gate (`src/` React)
- On load: if no valid session, render the **gate** (single passcode field + Enter).
- Read `location.hash` for `#code=…`; if present, capture it into memory then **immediately `history.replaceState`** to drop it from the URL (before any third-party script could read it), pre-fill the field, offer one-click Enter.
- Auth via `POST /auth` (same-origin, credentials included). HttpOnly cookie carries auth; nothing sensitive stored client-side. A 401 from `/chat` mid-session (expired/revoked) returns the user to the gate.

### 6. Admin console (`src/admin/` or a route)
- **Preferred: Cloudflare Access** policy on the `/admin*` path (Neil's identity / one-time-PIN email). Zero auth code in the Worker, audit logs for free, no token to leak. The Worker can additionally assert the `Cf-Access-Jwt-Assertion` header is present as defense-in-depth.
- **Fallback (if not using Access): `ADMIN_TOKEN`** — constant-time compare; delivered as a `__Host-admin` HttpOnly Secure `SameSite=Strict` cookie (not localStorage); `Cache-Control: no-store`; Origin/CSRF check on every mutation; per-IP rate limit; mutations logged.
- **Mint:** form (label, view, daily $, total $, expiry) → POST `/admin/codes` → returns the generated code **once** + a ready-to-copy `https://…/#code=<plaintext>` link.
- **List:** codes with `day_spent/daily` and `lifetime_spent/total` bars (rendered from micros), view tag, expiry, revoked state. Revoke → effective on the next `/chat` admission (it's a write predicate, so no replica lag).
- **History:** per-code `spend_events` (recent exchanges + totals/sparkline) — the payoff for choosing D1.

## Secrets / config (new)

| Name | Purpose |
|---|---|
| `CODE_HASH_KEY` | HMAC key for hashing passcodes at rest. |
| `SESSION_SIGN_KEY` | HMAC key(s) for signing the session cookie. Supports a `kid`-indexed ring for rotation (JSON of `{kid: key}` or `_v2`-suffixed names). |
| `ADMIN_TOKEN` | Admin password — **only if not using Cloudflare Access**. |
| `EST_EXCHANGE_MICROS` | (optional) conservative per-exchange reservation estimate; default sized to the configured model. |

Existing `BUDGET_DAILY_USD`, `DEMO_DISABLED`, `ANTHROPIC_API_KEY`, `VOYGENT_MCP_*`, `LLM_MODEL` are unchanged.

## Error handling & edge cases

- **Bad / expired / revoked code at gate:** **uniform** 401 (anti-oracle); details only in server logs.
- **Cookie outlives a revocation:** admission re-evaluates `revoked`/`expiry` on every `/chat` as a write predicate (primary), so a still-valid cookie can't outlive a revoked/expired code; short 12h TTL bounds replay further.
- **Over daily vs over lifetime (post-auth):** distinct 503 messages (you're authenticated, so no oracle concern) — derived from the one follow-up read after `changes=0`.
- **Concurrency:** admission is a single atomic conditional UPDATE; reconcile is a `batch()`. No JS read-modify-write anywhere on the ledger. Concurrent exchanges for one code are bounded by the cap because each books `est` before running.
- **D1 unavailable during auth or admission:** **fail closed** (refuse), logged.
- **Session isolation:** DO id derives from server-issued `sid`; client cannot select or collide with another guest's session.
- **Global cap reached:** unchanged — everyone gets the existing 503 regardless of per-code budget left.
- **Key rotation:** add a new `kid` to `SESSION_SIGN_KEY` ring; old cookies verify against the old key until they expire (≤12h).

## Testing

- **Unit:** `hashCode` determinism + key sensitivity; `generateCode` entropy/format; `verifyCookie` accepts valid / rejects tampered, expired, wrong-key, wrong-`kid`; constant-time compare.
- **Admission (the crux):** two interleaved `admit` calls for one code near its cap — exactly the budget's worth are admitted, the rest get `changes=0`; daily window rolls when `day_date` is stale without touching lifetime; revoked/expired code → `changes=0`.
- **Reconcile:** `est`→`actual` true-up lands the correct booked total; `spend_events` idempotent on duplicate `exchange_id`; partial failure leaves no divergence (batch atomicity).
- **Integration (Worker):** `/auth` happy path sets `__Host-demo_session`; unknown/expired/revoked all return identical 401; `/chat` without cookie → 401; over-daily → 503 daily; over-lifetime → 503 lifetime; revoked mid-session → next `/chat` 503/401; two cookies with different `sid` get isolated DOs; Origin-less POST → 403; global cap still trips independently.
- **Admin:** create returns plaintext once + link; revoke blocks next admission; list/history reflect spend after an exchange; unauthorized admin call → 401/Access-blocked.
- Follow existing vitest patterns (`worker/*.test.ts`).

## Deployment (sequenced, separate from code)

1. Create D1 db (`wrangler d1 create voygent-demo`), add `DEMO_DB` binding, apply `0001_access_control.sql`.
2. Set secrets (`CODE_HASH_KEY`, `SESSION_SIGN_KEY`; `ADMIN_TOKEN` only if not using Access).
3. **Configure Cloudflare Access** policy on `/admin*` (preferred admin path).
4. Build SPA + deploy Worker.
5. Mint the first codes from `/admin`; smoke-test gate → chat → daily trip → lifetime trip → revoke.
6. **Separate infra task (not blocking):** resolve the `*.voygent.ai` wildcard so the demo serves at a `voygent.ai` URL instead of `voygent-demo.somotravel.workers.dev` (the wildcard currently routes every subdomain to the prod `voygent` Worker — see `wrangler.toml` comment).

## Findings folded in from the Codex review (2026-06-09)

| Severity | Finding | Resolution in this spec |
|---|---|---|
| Critical | Check-then-record doesn't bound concurrent spend | Reserve-then-reconcile; admission books `est` up front via conditional UPDATE |
| High | D1 read-replica staleness / TOCTOU on budget + revocation | Admission is a single primary-routed conditional write; no pre-read decision |
| High | Client-controlled `?session=` → cross-guest leakage | Server-issued `sid` in the signed cookie; client param ignored |
| High | Admin auth underspecified | Cloudflare Access preferred; hardened `ADMIN_TOKEN` fallback |
| High | Wildcard CORS with cookies | CORS removed (same-origin); Origin/CSRF guard added |
| Medium | CSRF incl. `/auth` | Origin + content-type checks on all POSTs; SameSite |
| Medium | Fragment is a low-grade secret | `history.replaceState` strip immediately on load |
| Medium | HMAC-at-rest doesn't stop online guessing | High-entropy codes, uniform 401, `/auth` rate limit |
| Medium | UPDATE+INSERT not atomic; `REAL` money | `batch()`; integer micro-USD; FK + idempotency key |
| Medium | Cookie hardening | `__Host-` prefix, base64url JSON, `kid` key ring, 12h TTL |
| Low | Fail-open too broad | Auth/admission/revocation fail closed |

## Open follow-ups (out of scope here)

- Distinct advisor / partner / acquirer views keyed off the `view` tag.
- Optional: separate `*_reserved` columns if precise reservation accounting is ever needed.
- Optional: email the mint link directly from `/admin`.
