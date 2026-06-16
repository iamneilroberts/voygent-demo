# Design — public "follow the build" showcase + moderated comments

**Date:** 2026-06-16
**Repo:** voygent-demo (served at demo.voygent.ai)
**Status:** Design — approved in brainstorming; codex security review folded in
(2026-06-16); pending final spec review + implementation plan.

> **Codex review folded in (2026-06-16).** Eight findings from the codex review are
> now baked into the sections below rather than tracked separately: CSRF on
> moderation POSTs, unauthenticated-write hardening + fail-closed, HMAC (not plain
> salted-SHA) IP pseudonymity + retention, inert `POST` route + graceful degrade,
> escape-first on the admin page + `section_ref` validation, strict `/showcase` CSP,
> a reframed leak guarantee (allowlist + no-import, not the denylist), and
> `moderated_at`/`moderated_by` schema columns. Block-on items are marked
> **(block-on)**.

## Goal

A public, polished page on demo.voygent.ai that doubles as a portfolio and a
"follow the build" log: it showcases the project's attributes and history in
configurable sections, and lets visitors leave comments. Audience is both
employers/portfolio and friends/community (leaning public-product).

Explicit non-goal / hard safety boundary: this is **not** the internal
`/admin/pm` dashboard (token spend, costs, branch names, raw journal notes) made
public. It is a **separate, curated surface** that only ever contains what the
author has deliberately chosen to publish. Nothing here reads the pm collector,
the worktree journal, transcripts, or git.

## Decisions (confirmed in brainstorming)

- **Audience:** both portfolio + community ("follow the build").
- **Comments:** self-hosted in D1, **no login**, **moderation queue** — nothing
  appears publicly until the author approves it.
- **Content model:** curated sections **plus one safe auto-feed** (a build-log
  rendered from a single author-controlled source).
- **Views:** toggleable sections + a master on/off switch.
- **Rendering:** server-rendered standalone HTML in the amber-CRT style, the same
  pattern as `/info` and `/blog` (not the React SPA). Reuses the existing render
  helpers and `esc()`.

## Architecture

Server-rendered page on the Worker. New module `worker/showcase/` with focused
units; routes added to `worker/index.ts`; moderation wired into the existing
`worker/access/admin.ts` (`handleAdmin` / `adminAuthed`).

### Components

**1. Page route — `GET /showcase`**
- Master toggle: env `SHOWCASE_ENABLED`. When unset, the route returns `null`
  (→ falls through to the normal 404/SPA path), so the page does not exist unless
  explicitly enabled — the same inert-unless-configured pattern as the
  voygent-lite pm-dashboard route.
- Renders enabled sections in order from config. Standalone amber-CRT HTML reusing
  `worker/info/layout.ts` chrome and the existing `esc()` helper. `noindex` is NOT
  set (this page is meant to be found).
- **Strict CSP (block-on, finding #6).** This page renders only first-party content
  plus escaped user comments, so it gets a tight Content-Security-Policy, not the
  default: at minimum `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'self'`, `frame-ancestors 'none'`, and **no third-party or inline
  script** (no `unsafe-inline`/`unsafe-eval` for `script-src`). Inline styles are
  acceptable only if the existing layout chrome requires them; prefer hashed/`'self'`
  styles where feasible. Exact directive string finalized in the plan against what
  `layout.ts` actually emits.
- Linked from the `/blog` nav once live. Route name `/showcase` (can be promoted
  to site root later without a rebuild).

**2. Views / sections config — `worker/showcase/config.ts`**
- A typed list: `{ id, type, enabled, order, ... }`.
- Section `type` values for v1: `overview`, `architecture`, `milestones`,
  `buildlog`, `comments`.
- Curated section bodies use the same HTML-fragment style as `content.json` deep
  dives (or link out to existing `/info` pages).
- Toggling/reordering a view = edit this file + redeploy. No runtime toggle UI in
  v1 (YAGNI). Master switch is the env var; per-section switch is `enabled`.

**3. Build-log (the safe auto-feed) — `worker/showcase/buildlog.ts`**
- Renders a dated timeline from a **single committed source the author controls**:
  `docs/public-changelog.md` (append dated lines). Parsed to entries (date + text)
  by a pure function.
- This file is the ONLY input to the build-log. It never touches the pm collector,
  journal, transcripts, or git history. The leak surface is exactly "what the
  author wrote in public-changelog.md."
- **The leak guarantee is structural, not the denylist test (finding #7).** The real
  guarantee is a **strict source allowlist** — the showcase composes from exactly
  `config.ts` curated bodies, `public-changelog.md`, and approved D1 comments — plus
  **no import or read path from any pm-collector / journal / git module** in the
  `worker/showcase/` tree, plus manual moderation of comments. The denylisted-marker
  test (Security section) is **defense-in-depth that can catch a regression**, not the
  guarantee itself; a passing denylist test must never be read as "safe to wire a new
  source in." Adding any new build-log/section source is a deliberate spec change.

**4. Comments subsystem**
- **Storage:** new table in the existing D1 (the `voygent-demo-stats` database;
  confirm the binding identifier during planning). New migration under the repo's
  migration convention. Table `showcase_comments`:
  `id` (uuid), `created_at` (epoch ms), `author_name` (text, capped),
  `body` (text, capped), `status` (`pending` | `approved` | `rejected`),
  `ip_hash` (text — **`HMAC-SHA256(COMMENT_IP_SALT, normalized_ip)`**, never the raw
  IP; see finding #3 below), `section_ref` (text, nullable — which section/anchor it
  was left on, **validated against known section ids** on write; see finding #5),
  `moderated_at` (epoch ms, nullable) and `moderated_by` (text, nullable) — set on
  approve/reject for an audit trail (finding #8).
  Index on `(status, created_at)`.
- **IP pseudonymity, not anonymity (block-on, finding #3).** `ip_hash` is
  `HMAC-SHA256(secret=COMMENT_IP_SALT, message=normalized_ip)` — HMAC, not a bare
  salted SHA-256 (a plain salted digest of a 32-bit IPv4 space is brute-forceable).
  Normalize the IP first (trim IPv6 zone/port, lowercase). This value is
  **pseudonymous personal data**, not "anonymized" — the spec/privacy copy must say
  pseudonymous, and rows carry a **retention/TTL** (finding #2) so we are not holding
  IP-derived identifiers indefinitely.
- **Retention (finding #2/#3):** `pending` and `rejected` rows are pruned after a
  bounded window (exact TTL set in the plan); approved rows persist. Pruning can be a
  delete-on-read sweep or a scheduled job — decided plan-level.
- **Submit — `POST /showcase/comments`:** body `{ name, body, website }` where
  `website` is a hidden **honeypot** (bots fill it; if non-empty, silently accept
  + drop). This route is an **unauthenticated D1 write**, so it is hardened
  fail-closed (block-on, finding #2). Defenses applied server-side, in order:
  0. **Inert + preconditions (finding #4):** if `SHOWCASE_ENABLED` is unset, the
     route is inert exactly like `GET /showcase` (return `null` → 404; comments don't
     exist). If `COMMENT_IP_SALT` or the D1 binding is missing, or the
     `showcase_comments` migration has not been applied, **fail closed** — return a
     controlled `503` (and hide the comments form/section on `GET`), never throw an
     unhandled error and never write.
  1. **Content-type + body-size cap BEFORE parsing:** require
     `application/json` (or form-encoded, whichever the plan picks) and reject bodies
     over a small byte cap before `await req.json()`, so a giant payload can't force a
     large parse/allocate.
  2. honeypot check,
  3. length caps (name ≤ ~80, body ≤ ~2000; reject empties),
  4. per-`ip_hash` **rate limit** (max N inserts in a rolling window — exact N/window
     set in the plan). **Note the race (finding #8):** a COUNT-then-INSERT check is
     best-effort and can be beaten by concurrent requests; the plan decides whether
     best-effort is acceptable for v1 or whether to use an atomic per-bucket upsert
     table (`(ip_hash, window) → count`) instead.
  5. insert as `status = 'pending'`.
  Response is always a neutral "thanks — held for review" (no oracle that reveals
  honeypot/rate-limit logic; the `503` precondition failure is the one non-neutral
  case and reveals nothing about a specific submission). No captcha in v1; the
  moderation queue is the real backstop. **Cloudflare Turnstile is named as an
  escalation lever** (add it if spam gets past the honeypot), not a v1 default.
- **Display:** `/showcase` renders only `status = 'approved'` comments, newest-N,
  **HTML-escaped via `esc()`** (XSS guard — comment text is untrusted input). No
  raw HTML, no markdown-to-HTML in v1 (plain text + line breaks only). **Escape-first
  line breaks (finding #5):** to show newlines, `esc(body)` FIRST and only THEN
  `.replace(/\n/g, '<br>')` — never the reverse, or the escape would neutralize the
  injected `<br>` / let markup through.
- **Moderate — `GET /admin/comments` (+ `POST /admin/comments/:id/{approve,reject}`):**
  wired into `handleAdmin`, gated by `adminAuthed` (Cloudflare Access in front,
  `ADMIN_TOKEN` fallback) — the same boundary the in-place editor already uses.
  Lists `pending` rows with approve/reject actions; actions update `status` and stamp
  `moderated_at`/`moderated_by`.
  - **The admin moderation page also escapes (finding #5).** It renders untrusted
    pending comment bodies/names, so it uses the SAME `esc()` (escape-first line
    breaks) as `/showcase` — a pending comment is the most dangerous place to forget
    escaping. `section_ref` is **validated against the known section-id set** before
    storage (and treated as opaque/escaped on display).
  - **CSRF on the moderation POSTs (block-on, finding #1).** `adminAuthed` proves
    *who* but not *intent* — a state-changing POST behind an authenticated admin
    session needs CSRF defense. Require all three: (a) **Origin/Referer enforcement**
    (reject cross-site origins), (b) a **per-session CSRF token** embedded in the
    moderation form and verified on POST, and (c) the admin session cookie set
    `SameSite=Lax` (or `Strict`). This is additive to `adminAuthed`, not a
    replacement.

### Data flow

- Visitor → `GET /showcase` → if `SHOWCASE_ENABLED`: load config, render enabled
  sections (curated HTML + parsed build-log + approved comments from D1) → amber-CRT
  page.
- Visitor → `POST /showcase/comments` → honeypot/length/rate checks → `pending`
  row → neutral thank-you.
- Author → `GET /admin/comments` (admin-gated) → approve/reject → D1 status update
  → comment shows (or not) on next `/showcase` load.

## Security & privacy

- **XSS:** all user-supplied comment fields are `esc()`-escaped on render, on BOTH
  the public `/showcase` page AND the `/admin/comments` moderation page (finding #5);
  escape-first before any `\n`→`<br>`; no HTML/markdown rendering of comment bodies
  in v1.
- **CSRF (finding #1):** moderation POSTs require Origin/Referer enforcement + a
  per-session CSRF token + `SameSite` admin cookie, on top of `adminAuthed`.
- **CSP (finding #6):** `/showcase` ships a strict CSP (`object-src 'none'`,
  `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`, no third-party/
  inline script).
- **Spam / unauthenticated-write hardening (finding #2):** honeypot + content-type
  check + body-size cap before parse + length caps + IP-hash rate limit + manual
  approval, all **fail-closed** if salt/D1/migration are missing. Turnstile is an
  escalation lever, not v1 default. Nothing unvetted is ever public.
- **Privacy (finding #3):** store only `HMAC-SHA256(COMMENT_IP_SALT, normalized_ip)`
  (for rate-limiting + abuse triage), never the raw IP. This is **pseudonymous
  personal data**, not anonymized; it carries a retention/TTL (pending+rejected rows
  pruned). No other PII collected; author name is free text and not verified (so it
  is never treated as identity).
- **No internal data (finding #7):** the guarantee is structural — a strict source
  allowlist (`config.ts`, curated section bodies, `public-changelog.md`, approved D1
  comments) plus no import/read path from any pm/journal/git module in
  `worker/showcase/` plus manual moderation. The denylist-marker test is
  **defense-in-depth that catches regressions**, NOT the guarantee.
- **Response neutrality:** submit endpoint never reveals why a comment was dropped
  (the fail-closed `503` precondition case excepted — it reveals nothing about a
  specific submission).

## Configuration / env

- `SHOWCASE_ENABLED` — master toggle (both `GET /showcase` and `POST
  /showcase/comments` inert unless set).
- `COMMENT_IP_SALT` — **HMAC secret** for the IP hash (finding #3). Its absence is a
  fail-closed condition: no salt → comments endpoint returns `503`, never stores.
- Reuses existing `ADMIN_TOKEN` / Cloudflare Access for moderation; reuses the
  existing D1 binding for storage. Missing D1 binding or unapplied migration →
  fail-closed `503` on submit, comments section hidden on `GET` (finding #2/#4).
- (escalation, not v1) Cloudflare **Turnstile** site/secret keys — wired only if
  honeypot+moderation prove insufficient (finding #2).

## Testing (matches the repo's pure-+-injectable convention, e.g. info-content.test)

- `buildlog.ts`: markdown → entries parsing (dates, ordering, malformed lines).
- `config.ts` → section rendering: only `enabled` sections, correct order.
- comment validation: honeypot trip, content-type reject, oversize-body reject
  (before parse), length caps, empty rejection, rate-limit decision logic (D1 count
  injected/mocked), `section_ref` validation against the known id set (finding #5).
- fail-closed (finding #2/#4): submit with missing salt / missing D1 / unapplied
  migration → `503`, no write; `SHOWCASE_ENABLED` unset → both routes inert (null/404).
- IP hash (finding #3): `ip_hash` is HMAC-derived and stable for the same normalized
  IP, differs across IPs, and the raw IP never appears in the stored row.
- render escaping: a comment body containing `<script>`/`"`/`<`/newlines is escaped
  in output on BOTH `/showcase` AND `/admin/comments` (finding #5), escape-first
  before `\n`→`<br>`.
- CSRF (finding #1): moderation POST rejected without a valid CSRF token / with a
  cross-site Origin; accepted with both token + same-origin.
- CSP (finding #6): `/showcase` response carries the strict CSP header.
- sanitization/no-leak: rendered page contains no denylisted internal markers
  (defense-in-depth regression check, per finding #7 — not the guarantee itself).
- moderation: approve/reject transitions update status + stamp
  `moderated_at`/`moderated_by`; `adminAuthed` required.

## Out of scope (v1, YAGNI)

- No login / OAuth / GitHub identity.
- No captcha.
- No threaded replies, reactions, or edit/delete-by-commenter.
- No email notifications on new comments.
- No runtime section-toggle admin UI (config-in-code + redeploy).
- Build-log is a committed markdown file, not a live collector.

## Open items to resolve in the plan

- Exact D1 binding identifier for the `voygent-demo-stats` database and the
  migration file location/numbering convention (`migrations/` vs `migrations-stats/`).
- Concrete rate-limit N + window, and **best-effort COUNT-then-INSERT vs atomic
  per-bucket upsert table** (finding #8).
- Retention/TTL window for `pending`/`rejected` rows, and prune mechanism
  (delete-on-read sweep vs scheduled job) (finding #2/#3).
- Exact `/showcase` CSP directive string, reconciled against what `layout.ts` emits
  (inline-style handling) (finding #6).
- Request body-size cap (bytes) and accepted content-type for `POST
  /showcase/comments` (finding #2).
- Whether the master `/showcase` link is added to the `/blog` nav now or after first
  content is written.
- Initial section set + curated copy for `overview` / `architecture` / `milestones`
  (content authoring, can follow the engine landing).
