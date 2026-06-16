# Design — public "follow the build" showcase + moderated comments

**Date:** 2026-06-16
**Repo:** voygent-demo (served at demo.voygent.ai)
**Status:** Design — approved in brainstorming, pending spec review + implementation plan.

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
  set (this page is meant to be found); a normal CSP appropriate to a page that
  renders only first-party content + escaped user comments.
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

**4. Comments subsystem**
- **Storage:** new table in the existing D1 (the `voygent-demo-stats` database;
  confirm the binding identifier during planning). New migration under the repo's
  migration convention. Table `showcase_comments`:
  `id` (uuid), `created_at` (epoch ms), `author_name` (text, capped),
  `body` (text, capped), `status` (`pending` | `approved` | `rejected`),
  `ip_hash` (text — salted SHA-256 of client IP, never the raw IP),
  `section_ref` (text, nullable — which section/anchor it was left on).
  Index on `(status, created_at)`.
- **Submit — `POST /showcase/comments`:** body `{ name, body, website }` where
  `website` is a hidden **honeypot** (bots fill it; if non-empty, silently accept
  + drop). Defenses applied server-side, in order:
  1. honeypot check,
  2. length caps (name ≤ ~80, body ≤ ~2000; reject empties),
  3. per-`ip_hash` **rate limit** (max N inserts in a rolling window via a D1 count
     query — exact N/window set in the plan),
  4. insert as `status = 'pending'`.
  Response is always a neutral "thanks — held for review" (no oracle that reveals
  honeypot/rate-limit logic). No captcha in v1; the moderation queue is the real
  backstop.
- **Display:** `/showcase` renders only `status = 'approved'` comments, newest-N,
  **HTML-escaped via `esc()`** (XSS guard — comment text is untrusted input). No
  raw HTML, no markdown-to-HTML in v1 (plain text + line breaks only).
- **Moderate — `GET /admin/comments` (+ `POST /admin/comments/:id/{approve,reject}`):**
  wired into `handleAdmin`, gated by `adminAuthed` (Cloudflare Access in front,
  `ADMIN_TOKEN` fallback) — the same boundary the in-place editor already uses.
  Lists `pending` rows with approve/reject actions; actions update `status`.

### Data flow

- Visitor → `GET /showcase` → if `SHOWCASE_ENABLED`: load config, render enabled
  sections (curated HTML + parsed build-log + approved comments from D1) → amber-CRT
  page.
- Visitor → `POST /showcase/comments` → honeypot/length/rate checks → `pending`
  row → neutral thank-you.
- Author → `GET /admin/comments` (admin-gated) → approve/reject → D1 status update
  → comment shows (or not) on next `/showcase` load.

## Security & privacy

- **XSS:** all user-supplied comment fields are `esc()`-escaped on render; no
  HTML/markdown rendering of comment bodies in v1.
- **Spam:** honeypot + length caps + IP-hash rate limit + manual approval. Nothing
  unvetted is ever public.
- **Privacy:** store only a salted hash of the IP (for rate-limiting + abuse
  triage), never the raw IP; no other PII collected; author name is free text and
  not verified (so it is never treated as identity).
- **No internal data:** the page composes only from `config.ts`, curated section
  bodies, `public-changelog.md`, and approved D1 comments. A test asserts the
  rendered output contains none of a denylist of internal markers (e.g. cost/$
  figures, branch-name patterns, journal terms).
- **Response neutrality:** submit endpoint never reveals why a comment was dropped.

## Configuration / env

- `SHOWCASE_ENABLED` — master toggle (route inert unless set).
- `COMMENT_IP_SALT` — salt for the IP hash.
- Reuses existing `ADMIN_TOKEN` / Cloudflare Access for moderation; reuses the
  existing D1 binding for storage.

## Testing (matches the repo's pure-+-injectable convention, e.g. info-content.test)

- `buildlog.ts`: markdown → entries parsing (dates, ordering, malformed lines).
- `config.ts` → section rendering: only `enabled` sections, correct order.
- comment validation: honeypot trip, length caps, empty rejection, rate-limit
  decision logic (D1 count injected/mocked).
- render escaping: a comment body containing `<script>`/`"`/`<` is escaped in output.
- sanitization/no-leak: rendered page contains no denylisted internal markers.
- moderation: approve/reject transitions update status; `adminAuthed` required.

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
- Concrete rate-limit N + window.
- Whether the master `/showcase` link is added to the `/blog` nav now or after first
  content is written.
- Initial section set + curated copy for `overview` / `architecture` / `milestones`
  (content authoring, can follow the engine landing).
