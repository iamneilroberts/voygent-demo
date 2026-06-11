# Session Handoff: Demo auth redesign — Phase D + deploy remain

**Date:** 2026-06-10
**Repo:** `/home/neil/dev/voygent-demo`
**Worktree:** `/home/neil/dev/voygent-demo-demo-auth-redesign` (branch `demo-auth-redesign`)
**Status:** Phases A + B + C **BUILT, committed, green** (433/433 tests, tsc clean). Phase D NOT started. Nothing merged, nothing deployed.

---

## What this effort is

Promote `demo.voygent.ai` with a funnel: **reel (open, no auth) → end-CTA → onboarding → emailed code → live demo**, split into two credential **tiers**:
- **public** (self-serve, instant) — credential-free search tools + a "public sources" disclaimer.
- **pro** (Neil-vetted, manual grant) — real supplier credentials; for showing an employer / sales prospect the full system without exposing creds to the open web.

**Spec:** `docs/superpowers/specs/2026-06-10-demo-auth-onboarding-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-06-10-demo-auth-onboarding-redesign.md` (20 tasks; A1–A2, F1, B1–B8, C1–C4 are DONE; **D1–D4 + Z1 remain**)

Read those two first. They are accurate and were self-reviewed. This handoff only adds what changed during execution + what's next.

---

## What's DONE (15 commits, `4fbc932..8132752` on `demo-auth-redesign`)

**Phase A — reel public (client-only):**
- `web/src/lib/access.ts` — pure `effectiveMode` / `gateOnGoLive` / `showPublicDisclaimer` (+ `Tier` type). Unit-tested.
- `web/src/App.tsx` — reel renders for everyone; auth required only to cross into live.
  - **DEVIATION FROM PLAN (intentional, correct):** the plan said thread a derived `effMode` through render branches. The reel-playback `useEffect` guards on `mode === "auto"`, so a render-only derivation would show the reel but never *play* it. Instead `mode` was made settable and is coerced to `"auto"` for unauthed visitors in the auth bootstrap: `setMode(m => effectiveMode(m, sess))`. `mode` stays the single source of truth. Also: a mid-session 401 now re-shows the gate (`setShowOnboard(true)` in the `UnauthorizedError` handler), and `goLive` was split into `enterLive(greet)` (does the reload) + `goLive(greet)` (gates then calls enterLive) to avoid a stale-closure re-gate when onboarding auto-authenticates.

**Phase B — public tier + onboarding + email:**
- `tier` column on `codes` (`migrations/0003_tier.sql`); `createCode`/`lookupByCode`/`listCodes` carry it (`worker/access/codes.ts`).
- `worker/access/tier.ts` — `pickBearer(tier, env)`: pro **fails closed** (returns null) when `VOYGENT_MCP_BEARER_PRO` unset; public → `VOYGENT_MCP_BEARER`.
- `worker/access/meta.ts` — `code_meta` store + `countSignupsByIpHashSince` (`migrations/0004_onboarding.sql`).
- `worker/email/resend.ts` — Worker-native Resend sender (ported from `voygent-lite/src/email/resend.ts`), gated on `RESEND_API_KEY` (no-ops when unset). From `Voygent <support@voygent.ai>` (voygent.ai already verified in Resend). Templates: `demoCodeEmail`, `proRequestEmail`, `proGrantedEmail`.
- `worker/access/onboard.ts` — `POST /onboard`: validates, per-IP/day rate-limit (default 3, `ONBOARD_IP_DAILY_CAP`), creates a **public** code ($2/day, $20 lifetime, 14-day expiry), writes `code_meta` (source `self-serve`), best-effort email, returns the code. Wired in `worker/index.ts`.
- Cookie tier (`worker/access/session.ts`): claims now `{ sid, codeId, tier, exp, kid }`. `SessionClaims.tier` is required on output; `issueCookie` takes `SessionClaimsInput` (tier optional, defaults public); old cookies verify as public. `/auth` + `/auth/me` return `tier` (`worker/index.ts`).
- `web/src/lib/gate.ts` — `authenticate()` and `sessionInfo()` now return `{ ok, tier }`; `hasSession()` is a thin boolean wrapper.
- Bearer selection in the SessionDO (`worker/session-do.ts`): reads `x-code-tier` (forwarded by `/chat`), calls `pickBearer`, 503s if pro+unset, uses the chosen bearer for the `McpClient`.
- `web/src/OnboardingForm.tsx` — name/email/role/note form → `/onboard` → auto-authenticates the issuing browser → `enterLive(true)`. "Already have a code?" → existing `<Gate>` (via `forceGate` state in App).
- Public-source disclaimer banner in `App.tsx` (shows when `showPublicDisclaimer(tier, mode)`), currently links to a **`mailto:`** interim — **D4 swaps that for the in-app `ProAccessForm`**.

**Phase C — telemetry by code:**
- `code_id` on `session_stats` (`migrations/0002_stats_code_id.sql`, STATS_DB); added to `STATS_COLUMNS` + `StatsCtx` + bind tuple (`worker/stats.ts`); threaded from the DO (`worker/session-do.ts`).
- `GET /admin/dashboard` (`worker/access/admin.ts`) — per-code rollup joining `codes` + `code_meta` + aggregated `spend_events`. Admin page (`worker/access/admin-page.ts`) has a "Who's using the demo" table.

**Test infra:** `worker/access/testdb.ts` now loads `0001_access_control` + `0003_tier` + `0004_onboarding` + `0005_pro_requests` (NOT `0002_info_overrides`, NOT `0002_stats_code_id` which is STATS_DB). New `Env` fields in `worker/index.ts`: `VOYGENT_MCP_BEARER_PRO`, `RESEND_API_KEY`, `ONBOARD_IP_DAILY_CAP`, `NEIL_NOTIFY_EMAIL`, `DEMO_PUBLIC_LIVE_ENABLED`.

---

## What's LEFT — do these in order

### Phase D — pro-access request → vet → manual grant (Tasks D1–D4 in the plan)
The plan has full code for each. `migrations/0005_pro_requests.sql` and the Env fields already exist.
- **D1** `worker/access/pro-requests.ts` (+ test) — `insertProRequest` / `listPending` / `getRequest` / `markGranted` / `markDenied`.
- **D2** `worker/access/pro-request-handler.ts` (+ test) — `POST /pro-request`: validate, rate-limit (reuse `hashCode(ip)`), insert pending row, email Neil (`NEIL_NOTIFY_EMAIL`), return `{ok}` — **no code issued**. Then **wire the route** into `worker/index.ts` (add `import { handleProRequest }` — it was intentionally NOT imported yet to keep the build green; add it now next to the `/onboard` route).
- **D3** admin grant/deny in `worker/access/admin.ts` (+ tests) — `GET /admin/requests`, `POST /admin/requests/{id}/grant` (creates a **pro** code via `createCode` with Neil-set budget — suggest $10/day, $50 lifetime, 30-day — + `code_meta` source `pro-grant` + `markGranted` + email requester via `proGrantedEmail`), `POST /admin/requests/{id}/deny`. **Add `vi` import + a 200 fetch stub to `admin.test.ts`** for the grant email (mirror `onboard.test.ts`). Add `RESEND_API_KEY?` to `AdminEnv`.
- **D4** `web/src/ProAccessForm.tsx` (+ wire into App) — declare `showProForm` state in App, render the form when true, **change the disclaimer-banner link** (currently `mailto:`) to `onClick={() => setShowProForm(true)}`, add a "want full credentialed access?" link in/under `OnboardingForm`. Admin queue UI in `admin-page.ts` (pending list + grant budget inputs + deny).

### Z1 — `wrangler.toml` doc comments (no code)
Document new secrets/vars + the **credential-free bearer warning** (below).

### Then: finishing-a-development-branch
Run the full suite, then use `superpowers:finishing-a-development-branch` to merge/PR.

---

## DEPLOY — do NOT skip the bearer step (Neil-blocking)

Phase A is independently deployable now. B/C/D need this setup (all gated/dark until then):
1. `npx wrangler secret put RESEND_API_KEY` (reuse the existing Voygent value — it's in `voygent-lite`/the email repo).
2. **CRITICAL:** confirm/repoint `VOYGENT_MCP_BEARER` to a **credential-free Voygent identity** (a free-tier user with NO supplier creds) BEFORE any public live session runs. Neil flagged today's bearer likely carries real access. This may be a small voygent-lite task (provision the user). Until confirmed, keep `DEMO_PUBLIC_LIVE_ENABLED` unset and pro dark. **The whole credential-isolation guarantee rests on this — verify, don't assume.**
3. `npx wrangler secret put VOYGENT_MCP_BEARER_PRO` (Neil's real-cred identity). While unset, pro codes 503 with "Pro access isn't enabled yet" (fail closed — correct).
4. Set vars: `NEIL_NOTIFY_EMAIL`, optional `ONBOARD_IP_DAILY_CAP` (default 3), `DEMO_PUBLIC_LIVE_ENABLED`.
5. Apply migrations `--remote`: DEMO_DB `0003_tier`, `0004_onboarding`, `0005_pro_requests`; STATS_DB `0002_stats_code_id`. (`wrangler deploy` does NOT apply D1 schema.)
6. `VITE_API_BASE= npm run build:web` → `npx wrangler deploy`.

---

## Gotchas the next session must know
- **Fresh worktree needs `npm ci`** — node_modules is not shared; vitest 404s until installed.
- **`noUnusedLocals: true`** — don't declare a state var / import until the same task reads it, or tsc fails. (This is why the disclaimer banner was folded into the cookie-tier commit and uses a `mailto:` placeholder until D4.)
- **Code-discovery hook blocks the `Read` tool** intermittently for "discovery" — but `Read` worked for editing; `cat` via Bash always works for inspection.
- **`afterEach(() => vi.restoreAllMocks())` fails tsc** (returns `vi`, not void) — use a block body `afterEach(() => { vi.restoreAllMocks(); })`.
- **Two existing `session.test.ts` assertions** (`toEqual({sid,codeId})`) were updated to include `tier: "public"` — expected, not a regression.
- **Cross-session WIP:** `main`'s working tree has uncommitted `shared/events.ts` (cpmaxx-hotels fields) from another session — orthogonal to auth. This worktree branches off it cleanly; do NOT stage `shared/events.ts`.
- **Verify each task TDD-style:** `npx vitest run <file>` (RED → GREEN), then `npm run typecheck`, then commit by name (never `git add -A`).
- **Interactive browser smoke still pending** for A–C (reel→CTA→onboard→live with banner) — needs `npx wrangler dev`; logic is unit-tested + builds, but no human eyeball yet.

## What NOT to re-read
- The reel/screenplay internals — orthogonal; only `ReelExplore.tsx:63` CTA matters (already wired via `goLive`).
- The shipped access-control design (`2026-06-09-demo-access-control-design.md`) — superseded by the new spec for the auth/tier surface; read the new spec instead.
