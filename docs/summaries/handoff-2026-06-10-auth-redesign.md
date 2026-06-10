# Session Handoff: Demo auth + onboarding redesign

**Date:** 2026-06-10
**Repo:** /home/neil/dev/voygent-demo  (branch `main`)
**For:** a fresh session to design + build the new demo access/onboarding flow.
**Status:** NOT STARTED — this is a clean design+build pickup. The architecture below was
mapped (read-only) in the session that wrote this handoff; trust it but spot-check before
editing.

---

## The goal (Neil's words, paraphrased)

Promote `demo.voygent.ai`. New flow: **reel demo (open) → end-of-reel CTA → get auth → live demo.**

1. **Initial landing is ALWAYS the reel demo, with NO auth.** Anyone with the URL can watch
   the reel. (Verified safe — the reel is 100% client-side, makes zero API calls, can't spend
   money. See "Reel is client-only" below.)
2. **The end-of-reel CTA is the FIRST point auth is needed.** Clicking through to the live demo
   is the gate.
3. **Low-friction self-serve onboarding form** when a visitor chooses the live demo:
   - name
   - email
   - a dropdown for "who are you" (travel pro / tech reviewer / just curious / etc.) — **optional**
   - a free-text note for the developer (Neil)
4. **Automated**: on submit, generate an access code and **email it** to them (code + a link).
   "Sending an email with the auth code and a URL is good enough for now."
5. **Admin / mission-control / telemetry must work with these codes** so Neil can track
   **who is doing what** with the demo (per-code usage, who they are, what they ran).

This was explicitly **tabled** mid-session to fix demo UX bugs first; it is now the next effort.

---

## Current architecture (file:line refs — verify before trusting)

### Access gate / landing (today: EVERYTHING is gated)
- Client extracts `#code=...` from the URL fragment and strips it from history:
  `web/src/lib/gate.ts`.
- Client POSTs the plaintext code to `/auth`; worker validates at **`worker/index.ts:131-143`**:
  hashes with `CODE_HASH_KEY`, looks up `DEMO_DB.codes` via `lookupByCode()`
  (`worker/access/codes.ts:78-88`), checks not-revoked/not-expired, issues a signed session
  cookie (`SESSION_SIGN_KEY`, HMAC, ~12h) via `worker/access/session.ts:40-70`.
- Passcode UI: `web/src/Gate.tsx`. Auth check on mount: `web/src/App.tsx:224-235`
  (renders `<Gate>` when `authed === false`).
- **Both the reel (`mode=auto`) and the live demo are behind this single gate today.** To make
  the reel public you serve `/` (and the reel path) without requiring a session, and only gate
  the transition to live + the onboarding submit.

### Reel is client-only (safe to open) — CONFIRMED
- `mode=auto` → `replayChat()` (`web/src/lib/recording.ts`) replays an in-memory screenplay
  from `web/src/recordings/registry.ts`. **No `/chat`, no fetches.** `streamChat`
  (`web/src/sse-client.ts`) is only called in `mode=live`. So the reel cannot spend money or
  hit the MCP. Gating it today is only an artifact of the whole SPA being gated.

### Access-code data model (D1 `DEMO_DB`)
- Table **`codes`** (`migrations/0001_access_control.sql`): `id` (TEXT PK, human slug),
  `code_hash` (HMAC-SHA256 with `CODE_HASH_KEY`, never plaintext), `label`, `view` (default
  `'default'`), `daily_micros`, `total_micros`, `day_date`, `day_spent`, `lifetime_spent`,
  `expires_at` (nullable ISO), `revoked` (0/1), `created_at`.
- Table **`spend_events`** (audit, joined by `code_id`): `id`, `code_id` (FK), `exchange_id`
  (UNIQUE), `ts`, `est_micros`, `actual_micros`, `model`, `input_tokens`, `output_tokens`.
- **Code creation today**: only via `POST /admin/codes` (`worker/access/admin.ts:42-52`, Cloudflare
  Access JWT or `ADMIN_TOKEN` bearer) → `generateCode()` (Crockford base32, 80 bits,
  `xxxx-xxxx-xxxx-xxxx`) → hash + insert → returns `{ ok, code, link }` (plaintext shown once).
  CLI wrapper: `scripts/demo-admin.sh`. **No self-serve path exists.**

### Admin page + telemetry (today)
- `worker/access/admin-page.ts` = self-contained HTML at `GET /admin` (Cloudflare Access gated).
- Endpoints: `GET /admin/codes` (list), `POST /admin/codes` (create), `POST
  /admin/codes/{id}/revoke`, `GET /admin/codes/{id}/usage` (spend_events for one code).
- Shows: code list (id/label/view/daily+lifetime budget used/avail/expiry/revoke) and per-code
  spend drill-down.
- **GAP for "track who is doing what":** the admin does NOT group **engineering** telemetry by
  code. `STATS_DB.session_stats` (tokens, cost, routing, tool calls, validation) is keyed by
  `session_id` + `exchange_id` and has **no `code_id` column**. Per-code **spend** is fully
  auditable (`spend_events`); per-code **token/model/tool behavior** is not linked. There is no
  per-code dashboard or "who ran what" view, and the form's name/email/role/note has nowhere to
  live yet (no column/table).

### Per-code linkage (live runs)
- `worker/index.ts:182` sets `x-code-id` header on the forwarded `/chat`; the SessionDO reads it
  (`worker/session-do.ts:349-350`) and at finalize (`~692-703`) calls `reconcile()` → writes
  `spend_events` + updates `codes.day_spent`/`lifetime_spent`. So **every live `/chat` is linked
  to a code** in `spend_events`. (Not in `session_stats`.)

### EMAIL: there is NONE
- No MailChannels / Resend / SendGrid / Cloudflare Email Workers binding in `wrangler.toml` or
  worker code. **This is the single biggest net-new dependency** for the onboarding flow.
  MailChannels' free Cloudflare route was discontinued; realistic options today: **Resend**
  (simple API key, has a free tier), SendGrid, Postmark, or AWS SES. Cloudflare Email Routing is
  receive-only (won't send). **This needs a decision with Neil before building step 3.**

---

## Open questions for Neil (resolve before / during build)

1. **Email provider** — Resend (recommended: simplest, free tier, API key as a secret) vs other?
   Need a verified sending domain (e.g. `noreply@voygent.ai` or `@demo.voygent.ai`).
2. **Code defaults for self-serve** — daily/lifetime budget per self-issued code (e.g. $2 daily /
   $20 lifetime?), expiry (e.g. 14 days?), so a casual signup can't run up a bill. The global
   daily cap + `admit()` still backstop it.
3. **Abuse control** — anyone can submit the form. Rate-limit by IP? Require email click-through
   (double opt-in) or just send the code immediately? Neil said "automated, email is good enough"
   → lean immediate-send, but add a light per-IP/day cap.
4. **What to store about the person** — name/email/role/note need a home. New `code_meta` table or
   columns on `codes` (e.g. `owner_name`, `owner_email`, `role`, `note`, `source`)? This is what
   powers "track who is doing what."
5. **PII stance** — collecting name + email = PII. Confirm retention / a one-line privacy note on
   the form. (Keep it light but present.)
6. **Does the reel staying open change anything legally/branding** — it's already public-ish
   behind a shared passcode; making it truly open is fine per Neil ("safe, no API calls").

---

## Proposed phased plan (each phase shippable + smoke-able)

**Phase A — make the reel public, gate only live.**
- `worker/index.ts`: serve `/` (HTML/assets) without requiring a session. Keep `/auth` and
  `/chat` gated (chat already re-verifies the cookie). Decide: does ANY route need the cookie to
  serve the SPA, or is the SPA fully static + only `/chat` gated? (Likely the latter — the SPA is
  static; only `/chat`/`/auth` matter.)
- `web/src/App.tsx:224-235`: don't force `<Gate>` on load. Let the reel render for everyone;
  only require auth when the user crosses into live (`mode=live` / the end-CTA).
- The end-of-reel CTA (`ReelExplore.tsx` "Open the interactive demo" / `onLiveDemo` → `goLive`)
  becomes the gate trigger: if no valid session, show the onboarding form instead of going live.
- Smoke: open the reel in a fresh incognito with NO `#code=` → reel plays; clicking the CTA →
  onboarding form.

**Phase B — self-serve onboarding form + code issuance + email.**
- New `web/src/OnboardingForm.tsx`: name, email, role dropdown (optional), note. Posts `/onboard`.
- New `POST /onboard` in `worker/index.ts` (or `worker/access/`): validate input, **rate-limit by
  IP/day**, create a code via the existing `createCode()` (`worker/access/codes.ts` /
  `admin.ts`) with the self-serve budget defaults, persist name/email/role/note (Q4), **send the
  email** (Q1) with the code + an auto-fill link (`https://demo.voygent.ai/?mode=live#code=<CODE>`),
  return success (don't leak the code in the response if emailing — or show it AND email, TBD).
- Reuse `Gate.tsx` for the "already have a code?" path; the form is the "get started" path.
- Smoke: submit form → receive email with a working code → code logs you into live.

**Phase C — admin / telemetry by code.**
- Migration: add `code_id` to `STATS_DB.session_stats` (or a join table). Thread `code_id` from
  the `x-code-id` header into the stats write in `worker/session-do.ts` (~685-703, where the stats
  row is written alongside `reconcile()`).
- Persist the onboarding metadata (name/email/role/note) — new `code_meta` table or columns (Q4).
- `worker/access/admin.ts`: new `GET /admin/dashboard` (per-code summary: who they are, runs,
  spend, model split) and `GET /admin/codes/{id}/stats` (per-code engineering detail).
- `worker/access/admin-page.ts`: add a dashboard view + drill-down; surface name/email/role/note.
- Smoke: run a trip on a self-issued code → see it (and the person) in the admin dashboard.

---

## Important current state the new session must know (so it doesn't get confused)

The session before this handoff did a LOT of demo UX work (mostly orthogonal to auth — different
files under `web/src/recordings/`, `web/src/*.tsx`, and `worker/session-do.ts` agent flow). Key
deployed facts that touch the demo flow:
- **Live demo is now orchestrated by default** (faithful OFF). `?faithful=1` opts into fully-live.
  The client sends a `faithful` boolean in the `/chat` body; worker latches it turn 1
  (`worker/session-do.ts` faithful gate, ~line 359-365). `manage_trip_goal` is hidden from the
  tool catalog on featured/non-live sessions (`CHECKLIST_DRIVER_TOOLS`, the tool filter ~line 550).
- **Honesty `source` event**: worker emits `{ type:"source", live }` on first search; UI shows a
  "Live results" / "Sample results" tag. (`shared/events.ts`, `web/src/ClaudeChatView.tsx`.)
- **The reel (`?reel=collab`) ends on `ReelExplore.tsx`** — an interactive folio with a "Send to
  Voygent" dialog + "Open the interactive demo" CTA that calls `goLive`/`tryYourself`. **This CTA
  is exactly the hook Phase A repurposes as the auth gate.** (`web/src/App.tsx` end-state render;
  `tryYourself`/`planYourOwn` → `goLive`.)
- Current prod bundle at handoff time: `index-BVJzW2xj.js`. 403 tests green, tsc clean.
- Smoke passcode (auto-fill link): `https://demo.voygent.ai/?reel=collab#code=2ebf-azf0-z0qm-txqq`
  (code is `DEMO_ACCESS_CODE` in repo `.env`).

## Secrets already set in prod (via `npx wrangler secret list`)
`ADMIN_TOKEN`, `ANTHROPIC_API_KEY`, `BUDGET_DAILY_USD`, `CODE_HASH_KEY`, `DEEPSEEK_API_KEY`,
`DEMO_DEEPSEEK_ENABLED`, `DEMO_PHASE_MACHINE`, `FAITHFUL`, `FAITHFUL_PUBLIC_OK`,
`VOYGENT_MCP_BEARER`, `VOYGENT_MCP_URL`, `SESSION_SIGN_KEY` (+ others). **No email secret yet.**

## What the NEXT session should do first
1. Read this handoff + skim `worker/index.ts` (routing/gate), `worker/access/{codes,admin,session,admin-page}.ts`,
   `migrations/0001_access_control.sql`, `web/src/{Gate,App}.tsx`, `web/src/lib/gate.ts`.
2. Run `/brainstorm` (or a short design pass) with Neil on the 6 open questions — **email provider
   and self-serve budget defaults are blocking** for Phases B/C.
3. Build Phase A first (reel public) — it's contained, low-risk, and unblocks the new landing flow
   even before email exists.

## What NOT to re-read
- The reel/screenplay work (`web/src/recordings/dublin-collab.screenplay.ts`, `ReelExplore.tsx`,
  the R5 saga) — orthogonal to auth; only `ReelExplore`'s CTA matters (noted above).
- The faithful/orchestration debugging — summarized above; the journal `## Coordination` section
  (newest entries 2026-06-10) has the blow-by-blow.
