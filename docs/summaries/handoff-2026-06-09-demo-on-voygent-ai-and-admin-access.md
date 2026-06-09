# Session Handoff: Put the demo on a voygent.ai URL + make the admin web console usable

**Date:** 2026-06-09
**Session Focus (for the NEXT session):** Give `voygent-demo` a real `voygent.ai` URL (it's currently stuck on `*.workers.dev`), then turn on the browser admin console — which today can't be reached because its auth (Cloudflare Access) can't be applied to a `workers.dev` host. The two tasks are **linked**: the custom domain unblocks the admin GUI.

---

## Current state (what already shipped — do NOT redo)

- **Passcode access control is LIVE and verified** on the `voygent-demo` Worker at **https://voygent-demo.somotravel.workers.dev** (deployed version `19aa79c9`, 2026-06-09). Merged via PRs #2 (feature), #3 (deploy config), #4 (admin CLI).
- The gate works end-to-end: `#code=…` invite link → signed `__Host-` cookie → `/chat` reserves a per-exchange estimate and reconciles to actual cost in D1 (proven live: reserve→reconcile→ledger, forged-header rejection). Global $5/day cap + `DEMO_DISABLED` kill switch remain as backstop.
- **D1 database** `voygent-demo` (id `7825123d-3e56-423b-b2da-c5add703b252`), migration `0001_access_control.sql` applied remote. Tables: `codes`, `spend_events`. Production data currently: one real code `acme-employer` (daily $2 / total $10) + whatever has been minted since.
- **Secrets set on the Worker:** `CODE_HASH_KEY`, `SESSION_SIGN_KEY`, `ADMIN_TOKEN` (also live in `~/dev/voygent-lite/.env` as `VOYGENT_DEMO_ADMIN_TOKEN`), plus the pre-existing `ANTHROPIC_API_KEY` / `VOYGENT_MCP_URL` / `VOYGENT_MCP_BEARER`. Deployed model is `claude-sonnet-4-6` (~$0.038/exchange).
- **Admin today = CLI only:** `scripts/demo-admin.sh mint|list|revoke|usage` (auto-resolves the token from voygent-lite `.env`). The browser console at `GET /admin` returns 401 in a browser — that's the gap this task closes.

### Key code touchpoints (already built, reuse — don't rewrite)
- `worker/index.ts` — routing: `/auth`, `/auth/me`, `/admin*`, gated `/chat`. Reads `env.APP_ORIGIN` for the Origin/CSRF guard and to derive cookie `secure`.
- `worker/access/admin.ts` — `adminAuthed(req, env)` already accepts **either** a `Cf-Access-Jwt-Assertion` header (set by Cloudflare Access) **or** `Authorization: Bearer ADMIN_TOKEN`. ← This is why CF Access needs **no Worker code change**.
- `worker/access/admin-page.ts` — the admin console HTML; it **already has the mint form + list + revoke UI**. It just needs to be reachable + authed in a browser.
- `worker/access/http.ts` — `guardMutation(req, appOrigin)` requires `Origin === APP_ORIGIN` on POSTs.
- `worker/access/session.ts` — signed-cookie machinery (reusable if you go the token-login route instead of CF Access).
- `wrangler.toml` — `[vars] APP_ORIGIN = "https://voygent-demo.somotravel.workers.dev"`; no `routes` (defaults to workers.dev).

---

## The blocker (read this before touching anything)

`voygent.ai` has a **`*.voygent.ai` wildcard route bound to the PROD `voygent` Worker** (the flagship MCP, `voygent.somotravel.workers.dev`). That wildcard catches *every* subdomain, so a plain custom-domain attachment for `voygent-demo` gets shadowed. A 2026-06-05 attempt to attach a custom domain **regressed this Worker's workers.dev route** (see the NOTE comment in `wrangler.toml`) — so the prior attempt backed out. That regression is the thing to understand and avoid repeating.

**Cloudflare routing precedence is most-specific-wins.** An exact route like `demo.voygent.ai/*` (or a custom-domain binding for `demo.voygent.ai`) is more specific than `*.voygent.ai` and should win — but the 2026-06-05 regression says the interaction is fiddly. Treat the wildcard-vs-specific-route interaction as the core risk and test in a low-stakes way first.

---

## Task 1 — Put the demo on a `voygent.ai` URL

**Goal:** reach the demo at something like `https://demo.voygent.ai` instead of `voygent-demo.somotravel.workers.dev`.

**Recommended approach (verify, don't assume):**
1. Inspect the prod `voygent` Worker's routes: `npx wrangler deployments list` won't show routes; use the Cloudflare dashboard (Workers → voygent → Triggers/Routes) or `wrangler.toml` in `~/dev/voygent-lite` to confirm the `*.voygent.ai` pattern and which Worker owns it.
2. Add a **more-specific route** for the demo. Two ways:
   - **Custom domain binding** in `voygent-demo`'s `wrangler.toml`:
     ```toml
     routes = [{ pattern = "demo.voygent.ai", custom_domain = true }]
     ```
     This auto-creates the proxied DNS record + edge cert. This is what regressed last time — so deploy and **immediately re-check the workers.dev route still resolves** (the 2026-06-05 symptom). If it regresses, roll back the route and try the route-pattern approach instead.
   - **Route pattern** (no custom_domain): add a proxied CNAME/AAAA for `demo.voygent.ai` in the voygent.ai zone, then `routes = [{ pattern = "demo.voygent.ai/*", zone_name = "voygent.ai" }]`. A specific `demo.voygent.ai/*` should out-prioritize `*.voygent.ai`.
3. **CRITICAL — update `APP_ORIGIN`** in `wrangler.toml` `[vars]` to the new origin, e.g. `https://demo.voygent.ai`, and redeploy. If you skip this, `guardMutation` will **403 every `/auth`, `/chat`, and `/admin` POST** (Origin mismatch), and the cookie `secure`/`__Host-` logic keys off it. This is the #1 footgun.
4. **Rebuild the SPA** before deploy (`VITE_API_BASE= npm run build:web`) — the SPA calls relative same-origin paths, so no SPA change is needed for a new origin, but the deploy bundles `dist-web`. Deploy with `npx wrangler deploy` (NOTE: there is **no `npm run deploy` script** in this repo — use `npx wrangler deploy`).
5. Decide the URL shape with Neil: `demo.voygent.ai` (clean) vs a path under an existing host. Subdomain is far simpler than path-routing through the prod Worker — **prefer a subdomain.**

**Coordination risk:** changing routes on `voygent.ai` could affect the prod `voygent` Worker (the flagship). Do NOT touch the `*.voygent.ai` wildcard itself; only ADD a more-specific demo route. If anything looks like it could disrupt prod `voygent`, stop and confirm with Neil — this zone serves the live product.

---

## Task 2 — Make the admin web console usable (add Access to the admin page)

**Why it's broken now:** a browser navigating to `GET /admin` sends no `Authorization` header, and there's no Cloudflare Access in front, so `adminAuthed` returns false → 401. The mint/list/revoke UI exists but never loads.

**Recommended approach — Cloudflare Access (only works AFTER Task 1):** Access self-hosted apps can only protect hostnames in a **zone you control**, NOT `*.workers.dev`. Once the demo is on `demo.voygent.ai`:
1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add → Self-hosted.**
2. Application domain: `demo.voygent.ai`, **path `/admin`** (and `/admin/*` — add both or use `/admin*`). Scope it to ONLY the admin paths so the public demo stays open.
3. Policy: **Allow**, include rule = **Emails: dneilroberts@gmail.com** (one-time PIN). Session duration to taste.
4. **No Worker code change needed** — `adminAuthed` already honors the `Cf-Access-Jwt-Assertion` header Access injects. Verify: open `https://demo.voygent.ai/admin` in a browser → Access email-OTP → the console loads → mint a code via the form → confirm it appears in `list`.
   - Defense-in-depth (optional): have the Worker also *require* the Access JWT header on `/admin*` when a `CF_ACCESS_ENABLED` flag is set, so the `ADMIN_TOKEN` fallback can be retired in browser contexts. Keep the Bearer fallback for the CLI.

**Fallback approach if the custom domain stalls — token-login admin page (Option B, needs ~1 task of Worker code):** add an unauthenticated `GET /admin` login form → `POST /admin/login {token}` → constant-time compare against `ADMIN_TOKEN` (reuse `session.ts` `timingSafeEqual`) → set a signed HttpOnly admin cookie (reuse the `session.ts` cookie machinery, distinct cookie name) → gate the console + `/admin/*` API on that cookie OR the Bearer OR the Access JWT. This works on `workers.dev` today and is the same shape as the passcode gate. Only build this if Task 1 is blocked and Neil wants the GUI sooner. Brainstorm → plan → TDD → review like the access-control feature (see `docs/superpowers/specs/2026-06-09-demo-access-control-design.md` for the established patterns).

**Decision gate:** CF Access (config-only, more secure, no code) is preferred IF Task 1 lands. Token-login page is the workers.dev-compatible fallback. Confirm with Neil which, based on whether the domain work succeeds.

---

## Critical gotchas (carry these)

1. **`APP_ORIGIN` must equal the live origin** or all POSTs 403. Update it the moment the domain changes; it's a `[vars]` entry, redeploy to apply.
2. **CF Access cannot gate `*.workers.dev`** — Task 2-via-Access is gated on Task 1.
3. **Don't disturb the `*.voygent.ai` wildcard / prod `voygent` Worker** — only add a more-specific demo route. This zone serves the live flagship product.
4. **The 2026-06-05 custom-domain attempt regressed the workers.dev route** — after adding the route, immediately re-verify BOTH the new domain AND that you haven't broken serving. Keep a rollback ready (`git revert` the wrangler.toml route change + redeploy).
5. **No `npm run deploy`** — use `npx wrangler deploy`. Build the SPA first with `VITE_API_BASE= npm run build:web`.
6. **wrangler is on v3.114** (out-of-date warning is noise; works fine).

## Verification / E2E once both tasks land
- `https://demo.voygent.ai/#code=<a real code>` → gate → chat works (same-origin cookie set with `__Host-`/`Secure` since origin is https).
- `https://demo.voygent.ai/admin` in a browser → Access OTP → console loads → mint a test code via the form → it shows in the list with $0/cap bars → revoke it → delete the test row from D1 (`wrangler d1 execute voygent-demo --remote --command "DELETE FROM codes WHERE id='<test>'"`).
- Old `voygent-demo.somotravel.workers.dev` may keep working (workers.dev) — confirm it didn't regress.
- Prod `voygent` Worker / `*.voygent.ai` other subdomains still resolve unchanged.

## What NOT to re-read / re-do
- The access-control feature is DONE (PRs #2–#4). Don't reimplement gating, budgets, cookie, or the CLI.
- Full design rationale (already settled): `docs/superpowers/specs/2026-06-09-demo-access-control-design.md`; plan: `docs/superpowers/plans/2026-06-09-demo-access-control.md`.

## Open questions for Neil
- [ ] Exact URL: `demo.voygent.ai`? Something else under voygent.ai?
- [ ] If the custom domain regresses again, do you want the token-login admin page (Option B) as the interim GUI, or stay CLI-only until the domain is sorted?
- [ ] Also reconcile your diverged local `~/dev/voygent-demo` main (unpushed commit `673ef38`) with `origin/main` before starting: `git pull --rebase origin main`.
