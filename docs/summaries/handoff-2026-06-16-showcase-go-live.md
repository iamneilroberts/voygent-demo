# Handoff — take the public showcase + comments LIVE

_Date: 2026-06-16 · Repo: voygent-demo (demo.voygent.ai) · Author: showcase build session_

## TL;DR

The public "follow the build" showcase page + self-hosted moderated comments is **built,
merged to `main` (PR #8, merge `ec1f2f7`), and deployed to prod — but DARK.** Everything
infrastructural is done (D1 table, secret, worker deployed). The only thing standing between
"dark" and "live" is: **write a little content, flip one env flag, redeploy, smoke-test the
comment→moderate loop.** No new code is required to go live.

`SHOWCASE_ENABLED` is unset, so right now `GET /showcase` and `POST /showcase/comments`
return 404 (inert). The moment you set `SHOWCASE_ENABLED=1` and redeploy, the page is public.

## What's already done (don't redo)

- **Code merged:** `origin/main` @ `ec1f2f7` has the full `worker/showcase/` module + wiring.
- **Prod D1:** `showcase_comments` table applied to the live `voygent-demo` database
  (id `7825123d-3e56-423b-b2da-c5add703b252`). Verified present.
- **Secret:** `COMMENT_IP_SALT` is set on the `voygent-demo` worker (HMAC key for IP
  pseudonymity). Do NOT rotate casually — rotating it resets rate-limit grouping.
- **Deployed dark + verified:** `/showcase` → 404, `POST /showcase/comments` → 404,
  `/blog` + `/info/*` → 200 (no regression).
- Design spec: `docs/superpowers/specs/2026-06-16-public-showcase-comments-design.md`.
  Implementation plan: `docs/superpowers/plans/2026-06-16-public-showcase-comments.md`.

## Go-live steps (in order)

All commands run from `~/dev/voygent-demo` (or a fresh worktree off `origin/main` —
see the "stale main clone" warning at the bottom; prefer a worktree).

### 1. Write the content (the only real work)

The page renders **curated sections** + a **build-log** + **comments**. Default section copy
is placeholder text. Edit two files:

**`worker/showcase/config.ts`** — the `SECTIONS` array. Current state:
- `overview` (enabled) — has placeholder `bodyHtml`. **Replace with real intro copy.**
- `architecture` (disabled) — placeholder. Enable + write copy, or leave disabled.
- `milestones` (disabled) — placeholder. Enable + write copy, or leave disabled.
- `buildlog` (enabled) — renders from `changelog.json` (next file).
- `comments` (enabled) — the comment list + form. Leave as is.

`bodyHtml` is **author-trusted HTML rendered UNESCAPED** — only ever set it from this file,
never from any external/runtime source (it's an XSS sink otherwise; the field's docstring
says so). Use the house classes already in the codebase (`.stat`, `.artifact`, `.cta`,
`blockquote`, `code`) for visual consistency with `/info` pages.

**`worker/showcase/changelog.json`** — the build-log. An array of `{ "date":"YYYY-MM-DD",
"text":"..." }`. It currently has one seed entry. Append real dated build-log lines (newest
or oldest order doesn't matter — `parseBuildLog` sorts newest-first and drops malformed rows).
This file is the **only** input to the build-log; it never reads the journal, pm collector,
transcripts, or git. Keep it that way (the leak guarantee is structural).

Optionally, decide whether to add the `/showcase` link to the `/blog` nav (an Open Item in
the spec — currently no nav link; the route is reachable directly).

### 2. Flip the flag + deploy

```bash
# In wrangler.toml, under [vars], uncomment/add:
#   SHOWCASE_ENABLED = "1"
# Then build the SPA (fresh worktrees lack the gitignored dist-web) and deploy:
npm run build:web
npx wrangler deploy
```

(If you'd rather not commit the flag to wrangler.toml, you can set it as a dashboard
env var instead — but committing it keeps prod reproducible.)

### 3. Smoke-test live (the full moderation loop)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://demo.voygent.ai/showcase          # expect 200
```
Then in a browser:
1. Open `https://demo.voygent.ai/showcase` — confirm sections + build-log render, comment form shows.
2. Submit a test comment. Confirm you get the neutral "held for review" page and the comment
   does **NOT** appear on `/showcase` (it's `pending`).
3. Go to `https://demo.voygent.ai/admin/comments` (behind Cloudflare Access / `ADMIN_TOKEN`)
   — confirm the pending comment is listed (escaped). Click **Approve**.
4. Reload `/showcase` — the approved comment now appears. Submit another and **Reject** it;
   confirm it never appears.
5. (Optional) Confirm a junk submission with the hidden `website` honeypot field filled is
   silently dropped (returns the same neutral page, never appears in the moderation queue).

### 4. Commit the content + flag

Stage by name (`worker/showcase/config.ts`, `worker/showcase/changelog.json`, `wrangler.toml`)
— never `git add -A` — commit, and merge to `main` (PR or direct, per your call).

## How moderation works (for whoever runs it)

- Comments are **no-login**, stored `pending` in D1, invisible until approved.
- Moderate at `/admin/comments` (auth: Cloudflare Access in front, `ADMIN_TOKEN` bearer
  fallback — same gate as the in-place `/info` editor). Approve/reject are JSON `fetch`
  POSTs with Origin + CSRF protection via the existing `guardMutation`.
- Spam defenses: honeypot field + length caps + per-IP-hash rate limit (5 / 10 min,
  best-effort) + manual approval. Turnstile is a documented escalation lever, not wired.
- Retention: `pending`/`rejected` rows older than 30 days are pruned on read; approved persist.
- Privacy: only `HMAC-SHA256(COMMENT_IP_SALT, ip)` is stored — never the raw IP. Treat it as
  pseudonymous personal data.

## Key facts / contracts

- Routes: `GET /showcase`, `POST /showcase/comments` (public, form-urlencoded),
  `GET /admin/comments` + `POST /admin/comments/:id/{approve,reject}` (admin).
- `/showcase` CSP is strict (`script-src 'none'`); the public comment form is plain HTML
  (no JS). Don't add inline script to the public page or you'll break the CSP.
- Inert/fail-closed: unset `SHOWCASE_ENABLED` → 404; missing salt/D1/migration → 503 on POST
  and the form is hidden on GET. Never a 500, never a silent write.
- D1 binding for comments is `DEMO_DB` (database `voygent-demo`), NOT the stats DB.

## ⚠️ Stale main clone warning (read before editing)

As of this handoff, the **main clone `~/dev/voygent-demo` is at `b556180`** — it has NOT
pulled the merge (`origin/main` = `ec1f2f7`) and carries **another session's uncommitted WIP**
(`docs/digests/2026-06-11-issue-triage.md`, cueframe specs, pause-*.md). It also has an
**uncommitted SESSION_LOG.md** edit from the build session.

Do the go-live work in a **fresh worktree off `origin/main`**, not the messy main clone:
```bash
cd ~/dev/voygent-demo && git fetch origin
git worktree add ../voygent-demo-showcase-golive origin/main -b showcase-golive
cd ../voygent-demo-showcase-golive
ln -s ~/dev/voygent-demo/node_modules node_modules
cp ~/dev/voygent-demo/.dev.vars .dev.vars && cp ~/dev/voygent-demo/.env .env
```
That gives you the merged showcase code (`ec1f2f7`) cleanly, without touching the other
session's WIP.

## Optional follow-ups (from the final code review — non-blocking)

- Add a CSP header to the `/admin/comments` moderation page (currently none, matching the
  existing `/admin` page; it uses inline script so would need `script-src 'unsafe-inline'`).
- Trim the unused `NAME_MAX` / `BODY_MAX` exports from `worker/showcase/comments.ts`.
- Decide on the `/blog` → `/showcase` nav link (spec Open Item).
- If `/showcase` ever gets hot traffic: move the delete-on-read prune to a scheduled cron
  (every public GET currently issues a small D1 delete).
