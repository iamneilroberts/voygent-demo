# Demo Auth + Onboarding Redesign — Open Reel · Self-Serve Public Codes · Neil-Vetted Pro Access

**Date:** 2026-06-10
**Status:** Design — approved in brainstorming, pending final spec review
**Repo:** `voygent-demo` (branch `demo-auth-redesign`)
**Builds on:** `docs/superpowers/specs/2026-06-09-demo-access-control-design.md` (passcode tickets + per-code budgets + admin console — SHIPPED). This redesign opens the reel, adds self-serve onboarding + email, and splits access into two **credential tiers**.

---

## Problem / goal

Today the entire demo SPA is gated behind a single client-side passcode check (`App.tsx:406-407`). Neil wants to **promote `demo.voygent.ai`** with a funnel:

> **reel demo (open, no auth) → end-of-reel CTA → onboarding → emailed access code → live demo.**

Two new requirements layered on top of the funnel:

1. **Self-serve public access is credential-free.** Anyone can sign up and run the *live* demo, but live public sessions use **only credential-free search tools (public sources)** and carry a disclaimer. Neil's real supplier credentials are never reachable by a public code.
2. **Pro access is Neil-controlled.** A separate, richer form captures a fuller profile and emails it to Neil. He personally vets each request and manually grants a **pro-tier** code that can build a few trips with **real credentials**. This is how he shows the full power of Voygent to an employer / sales prospect without exposing creds to the open web.

## Key architectural finding (shapes Phase A)

The SPA is served by Cloudflare's `[assets]` binding with `not_found_handling = "single-page-application"` — **not** by the Worker. The reel HTML already loads for everyone; today's gate is purely the client-side `if (!authed) return <Gate>` in `App.tsx`. `/chat` independently re-verifies the signed session cookie server-side (`worker/index.ts` chat handler). **Therefore making the reel public is a client-only change with zero Worker/spend risk** — the reel (`mode=auto`) makes no network calls at all (`replayChat()` replays an in-memory screenplay; `streamChat` runs only in `mode=live`).

## Two orthogonal axes on a code

| Axis | Column | Values | Purpose |
|------|--------|--------|---------|
| **view** (existing) | `codes.view` | `'default'`, … | Audience render-tag (advisor/partner/acquirer skins) — already plumbed, unchanged. |
| **tier** (NEW) | `codes.tier` | `'public'` \| `'pro'` | **Credential access level.** Picks which Voygent MCP bearer the live session uses, and whether the public-source disclaimer shows. |

`tier` is embedded in the **HMAC-signed session cookie** claims (`{ sid, codeId, tier, exp, kid }`) so it is tamper-proof and `/chat` never has to re-query D1 to know the tier.

---

## Phase A — Reel public, gate only the live crossing (CLIENT-ONLY)

No Worker change. All in `web/src/`.

- **`App.tsx:406-407`** — replace the blanket `if (!authed) return <Gate>`:
  - When `mode === "auto"` (the reel), render the app regardless of `authed`.
  - **Unauthed-landing rule:** `lib/mode.ts` persists `mode=live` for returning visitors, which would skip the reel. For *unauthed* visitors, coerce the landing to the reel regardless of stored mode — honoring "landing is ALWAYS the reel." Concretely: the effective initial mode is `auto` whenever there is no session. The onboarding form appears only on an explicit go-live action, never as the cold landing.
- **`goLive(greet)`** (`App.tsx:355`) becomes the gate trigger:
  - if `authed` → behaves exactly as today (reload into `?mode=live`).
  - if `!authed` → render `<OnboardingForm>` (Phase B) **inline instead of reloading**. On successful onboard+auth, then proceed to the live reload.
- The reel's existing CTA (`ReelExplore.tsx:63` "Open the interactive demo" → `onLiveDemo` → `tryYourself` → `goLive(true)`) is the hook — no new wiring in the reel.
- The `UnauthorizedError → setAuthed(false)` path (`App.tsx:373`) stays as defense-in-depth.

**Phase A is independently shippable** before email/tiers exist (unauthed go-live can fall back to the existing `<Gate>` until `OnboardingForm` lands).

**Tests:** unauthed + `mode=auto` renders the reel (not `<Gate>`); clicking the CTA while unauthed shows the onboarding entry point; authed go-live still reloads into live.

---

## Phase B — Self-serve public onboarding + code + email + tier isolation

### B1. Public onboarding form
- **`web/src/OnboardingForm.tsx`**: name (required), email (required), role dropdown (optional: travel pro / tech reviewer / just curious / other), free-text note (optional), one-line PII note. A secondary "Already have a code?" link → existing `Gate.tsx`. A "Want full credentialed access?" link → `ProAccessForm` (Phase D).
- On success: auto-authenticate the issuing browser and flow straight into live (smoothest UX); the email is the durable record/backup, not the only path.

### B2. `POST /onboard` (worker/index.ts)
1. `guardMutation(req, env.APP_ORIGIN)` (Origin/CSRF — same guard as `/auth`).
2. Validate: name non-empty (≤120 chars), email matches a basic RFC-ish regex (≤200), note ≤2000, role in the known set or empty.
3. **Rate-limit:** `ip_hash = HMAC(CF-Connecting-IP, CODE_HASH_KEY)`; count `code_meta` rows with that `ip_hash` created today (UTC). If `≥ ONBOARD_IP_DAILY_CAP` (default **3**) → `429` friendly message.
4. `createCode()` with **public self-serve defaults**: `tier='public'`, `daily=$2`, `lifetime=$20`, `expires_at = now + 14d`, `id = 'self-' + <base32 suffix>`, `label = name <email>`, `view='default'`.
5. Insert `code_meta` row (B4).
6. `sendDemoCodeEmail()` (B3) — code + auto-fill link `https://demo.voygent.ai/?mode=live#code=<CODE>`. Email failure is logged but **does not** fail the request (code is already issued; `Promise.allSettled`-style).
7. Respond `{ ok: true, code }` to the issuing browser so it can `authenticate()` + `goLive()` immediately.

### B3. Email — port voygent-lite's Resend sender
- New `worker/email/resend.ts` — Worker-native port of `voygent-lite/src/email/resend.ts` (no voygent-lite `Env` import; own minimal interface). Gated on `RESEND_API_KEY`; **no-ops when unset** so Phase B ships dark until the secret is set. Posts to `https://api.resend.com/emails`, `from: "Voygent <support@voygent.ai>"` — the `voygent.ai` domain is **already verified in Resend**. Reuse the existing `RESEND_API_KEY` value.
- New secret in the demo Worker: `RESEND_API_KEY`. New optional var: `ONBOARD_IP_DAILY_CAP`.

### B4. Data model — `code_meta` (separate table, isolates PII)
```sql
-- migrations/0004_onboarding.sql  (DEMO_DB)
CREATE TABLE code_meta (
  code_id     TEXT PRIMARY KEY REFERENCES codes(id),
  owner_name  TEXT,
  owner_email TEXT,
  role        TEXT,           -- self-reported, optional
  note        TEXT,           -- free-text to Neil
  source      TEXT NOT NULL,  -- 'self-serve' | 'pro-grant' | 'admin'
  ip_hash     TEXT,           -- HMAC(ip) for rate-limiting + attribution (not raw IP)
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_code_meta_iphash_created ON code_meta(ip_hash, created_at);
```
Rationale: keeps PII out of the hot `codes` table (purgeable independently), carries `ip_hash` + `source` for rate-limiting and attribution. 1:1 with `codes`.

### B5. `codes.tier` + bearer isolation
```sql
-- migrations/0003_tier.sql  (DEMO_DB)
ALTER TABLE codes ADD COLUMN tier TEXT NOT NULL DEFAULT 'public';
```
- `lookupByCode()` / cookie issue now return + embed `tier`.
- `worker/index.ts` `/chat` forwards `x-code-tier` (from the verified cookie claims) alongside the existing `x-code-id`.
- **`session-do.ts:388`**: `const bearer = tier === 'pro' ? env.VOYGENT_MCP_BEARER_PRO : env.VOYGENT_MCP_BEARER;` New `Env.VOYGENT_MCP_BEARER_PRO`.
- **Credential isolation is enforced by voygent-lite's per-user gating** — a credential-free bearer literally cannot reach credentialed suppliers. The demo only *selects* the bearer.
- `/auth` and `/auth/me` return `tier` so the client can render the disclaimer.

> **HARD DEPLOY PREREQUISITE (cross-repo dependency):** `VOYGENT_MCP_BEARER` must be a **credential-free Voygent identity** before any public live session runs. Neil flagged that today's bearer likely carries real access. Until a credential-free bearer is confirmed/provisioned (possibly a voygent-lite task — a free-tier user with zero supplier creds), the public live path stays behind a flag (`DEMO_PUBLIC_LIVE_ENABLED`) and the pro path stays dark (`VOYGENT_MCP_BEARER_PRO` unset ⇒ pro codes refuse live with a clear message). This is the single biggest correctness risk in the design and must be verified, not assumed.

### B6. Public-source disclaimer (client)
When the session `tier === 'public'`, render a persistent banner in the live UI: *"Results are from public sources. For a full credentialed demo, request pro access →"* (links to `ProAccessForm`). Complements the existing honesty `source` event ("Live results" / "Sample results").

**Tests:** `/onboard` happy path (creates `public` code + `code_meta` row + calls email mock + returns code); rate-limit (4th from same `ip_hash` → 429); bad input → 400; email failure does not block issuance; cookie carries `tier`; `/chat` selects the public bearer for a public cookie.

---

## Phase C — Admin / telemetry by code

- **`STATS_DB` migration:** `ALTER TABLE session_stats ADD COLUMN code_id TEXT;` Add `code_id` to `STATS_COLUMNS`, `StatsCtx`, and the `statsRowFromSummary` bind tuple (`worker/stats.ts`). `codeId` is already available in the DO (`session-do.ts:356`) — thread it into the stats ctx at the write site (`session-do.ts:716-722`).
- **`GET /admin/dashboard`** (`worker/access/admin.ts`): per-code rollup joining `codes` + `code_meta` (who they are) + aggregated `spend_events` (runs, spend, model split) + `session_stats` (tokens, tool calls). `GET /admin/codes/{id}/stats` drill-down.
- **`worker/access/admin-page.ts`**: add a dashboard view (name/email/role/note, tier, runs, spend, model split, last seen) + drill-down.

**Tests:** `code_id` present in the stats bind tuple (extend `stats.test.ts`, which asserts column/`?` parity); dashboard query shape.

---

## Phase D — Pro-access request → Neil vetting → manual grant

### D1. Pro request form (client)
- **`web/src/ProAccessForm.tsx`**: name, email, company, role, use-case, note. Posts `/pro-request`. On success: *"Thanks — Neil will review and email you."* It does **not** issue a code.

### D2. `POST /pro-request` (worker)
1. `guardMutation` → validate → rate-limit (reuse `ip_hash` cap).
2. Insert a `pro_requests` row, `status='pending'`.
3. `sendProRequestEmail()` → emails Neil (`support@voygent.ai` reply-to; recipient = a `NEIL_NOTIFY_EMAIL` var) the full profile + an admin deep-link.
4. Respond `{ ok: true }`.

```sql
-- migrations/0005_pro_requests.sql  (DEMO_DB)
CREATE TABLE pro_requests (
  id              TEXT PRIMARY KEY,        -- generated slug
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  company         TEXT,
  role            TEXT,
  use_case        TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'granted' | 'denied'
  ip_hash         TEXT,
  created_at      TEXT NOT NULL,
  reviewed_at     TEXT,
  granted_code_id TEXT REFERENCES codes(id)
);
CREATE INDEX idx_pro_requests_status ON pro_requests(status, created_at);
```

### D3. Admin grant (Neil personally controls every pro code)
- **`GET /admin/requests`** — pending queue.
- **`POST /admin/requests/{id}/grant`** — body `{ dailyUsd, totalUsd, expiresAt }` (Neil sets; suggested defaults **$10/day, $50 lifetime, 30-day** = "a few trips"). Creates a `tier='pro'` code via `createCode()`, writes a `code_meta` row (`source='pro-grant'`, copying name/email/role/note from the request), sets `status='granted'`, `granted_code_id`, `reviewed_at`, and emails the requester the code + auto-fill link.
- **`POST /admin/requests/{id}/deny`** — `status='denied'`, `reviewed_at`.
- **`admin-page.ts`**: render the pending queue with a grant form (budget/expiry inputs) + deny button.

**Tests:** `/pro-request` inserts a pending row + calls Neil-email mock + does NOT create a code; grant creates a `pro` code + `code_meta` + flips status + emails requester; deny flips status; rate-limit.

---

## Error handling & fail-stance (consistent with the shipped access-control design)
- Auth/admission still **fail closed** (unchanged).
- `/onboard` and `/pro-request` validation failures → 4xx with friendly text; never partial writes (code creation + meta insert are sequential, and a failed meta insert after code creation is logged — the code is still usable, the orphan is admin-visible).
- Email is **best-effort**: never blocks code issuance or request capture.
- Pro live with `VOYGENT_MCP_BEARER_PRO` unset → refuse with a clear "pro access not yet enabled" message (fail closed, not a silent fallback to the public bearer).

## Deploy order
1. `wrangler secret put RESEND_API_KEY` (demo Worker) — reuse the existing key value.
2. `wrangler secret put VOYGENT_MCP_BEARER_PRO` (demo Worker) — Neil's real-cred identity. **Confirm/repoint `VOYGENT_MCP_BEARER` to a credential-free identity first.**
3. Set vars: `NEIL_NOTIFY_EMAIL`, optional `ONBOARD_IP_DAILY_CAP`, `DEMO_PUBLIC_LIVE_ENABLED`.
4. Apply migrations to `DEMO_DB` (`0003_tier`, `0004_onboarding`, `0005_pro_requests`) and `STATS_DB` (`code_id`) — `--remote`. (wrangler deploy does NOT apply D1 schema.)
5. `VITE_API_BASE= npm run build:web` → `wrangler deploy`.
- **Phase A ships independently** (client-only) ahead of all of the above.

## Non-goals (YAGNI)
- Double opt-in email confirmation (immediate send + IP cap is the chosen abuse control).
- Distinct advisor/partner/acquirer *views* (the `view` tag is plumbed; the views are a separate effort).
- Automated pro-tier issuance (pro is deliberately manual — Neil vets every grant).
- A retention cron (self-serve codes/meta are purgeable after expiry + 90d; manual/admin for now).
- Per-tool credential-free *filtering* inside the demo (isolation is the bearer/identity, enforced by voygent-lite).

## Open dependency to resolve before public live
**Credential-free public bearer.** Confirm whether a credential-free Voygent identity exists or must be provisioned (likely a small voygent-lite task: a free-tier user with no supplier creds). The bearer-swap design works regardless; the *guarantee* that public sessions can't touch real creds rests on this. Tracked as the gating item for `DEMO_PUBLIC_LIVE_ENABLED`.
