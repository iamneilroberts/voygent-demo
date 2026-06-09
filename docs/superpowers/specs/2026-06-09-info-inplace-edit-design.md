# Design — in-place editing for /info deep-dive pages

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `info-inplace-edit`, branch off `main` c2d2674)
**Status:** approved design, ready to implement

## Goal

Let the admin edit the worker-served `/info/<slug>` deep-dive pages (title,
subtitle, body) in place in the browser and save the result so it goes live
immediately, without a redeploy. Editing is admin-only; the public never gains
write access.

## Forced constraint

A deployed Worker cannot rewrite its own source (`worker/info/pages.ts`). So
"save in place" is a **D1 override layer**: edits are stored in `DEMO_DB`; the
render path prefers an override over the hardcoded `PAGES` seed. `pages.ts`
remains the default/seed; a saved override shadows it; **Revert** deletes the
override row and the page falls back to source.

## Decisions (from brainstorming)

- **Editor:** in-place WYSIWYG (`contenteditable`) on title / subtitle / body,
  **plus** a `</> HTML` toggle to a raw-HTML textarea for structural edits.
- **Editable fields:** title + subtitle + body. **Revert** button included.
- **Auth:** one-time **localStorage admin-key prompt**, sent as
  `Authorization: Bearer <ADMIN_TOKEN>` on save/revert; the server re-verifies
  every mutation. Works with or without Cloudflare Access.
- **Scope (YAGNI):** edit existing pages only — no page creation, no media
  upload, no revision history (last-write-wins, single admin).

## Architecture

```
GET /info/<slug>                       POST /info/<slug>/save | /revert
  └ db = makeDb(env)                     ├ guardMutation(origin) — same as /auth,/chat
  └ def = getPageData(slug)              ├ adminAuthed(req, env) → 401 if not
  └ ov  = await getOverride(db, slug)    ├ isKnownSlug(slug) → 404 if not
  └ data = mergeOverride(def, ov)        ├ save:  putOverride(db, slug, {title,subtitle,body}, now)
  └ html = renderInfo(slug, data,        └ revert: deleteOverride(db, slug)
            {edited: !!ov})                 → { ok: true }
  └ headers: cache-control: no-store
```

Editor visibility is **client-gated** (a public GET can't detect admin —
CF Access only fronts `/admin`, and a navigation can't carry a Bearer). The
editor `<script>`/`<style>` is injected on every `/info` GET but is **inert**
without a stored key; the server is the real boundary. Entry: visiting
`/info/<slug>?edit=1` opens the admin-key prompt; once the key is in
`localStorage`, the ✎ toolbar appears on all `/info` pages in that browser.
Trade-off accepted: the (inert) editor code is visible in public page source;
it cannot mutate anything without the server-checked `ADMIN_TOKEN`.

## Components (small, isolated)

1. **Migration** `migrations/0002_info_overrides.sql` (DEMO_DB):
   ```sql
   CREATE TABLE info_page_overrides (
     slug       TEXT PRIMARY KEY,
     title      TEXT,
     subtitle   TEXT,
     body       TEXT,
     updated_at INTEGER NOT NULL
   );
   ```
   Applied manually (this repo has no `migrations_dir`; `wrangler deploy` does
   NOT apply schema):
   `wrangler d1 execute voygent-demo --remote --file migrations/0002_info_overrides.sql`.

2. **`worker/info/overrides.ts`** — pure D1 access over the `Db` interface
   (`worker/access/db.ts`):
   - `getOverride(db, slug): Promise<PageOverride | null>` — wrapped in try/catch
     so a missing table / unbound DB returns `null` (graceful no-op → defaults).
   - `putOverride(db, slug, fields, nowMs): Promise<void>` — UPSERT
     (`INSERT … ON CONFLICT(slug) DO UPDATE`).
   - `deleteOverride(db, slug): Promise<void>`.

3. **Render path** (`worker/info/pages.ts`):
   - Keep `PAGES` seed. Add `getPageData(slug)` → `{title,subtitle,body} | null`.
   - Add `mergeOverride(def, ov)` → fields present on the override win.
   - Add `renderInfo(slug, data, opts)` → calls `layout.renderInfoPage` and, when
     building, wraps body in an editable container + injects editor chrome.
   - Keep `infoPageHtml(slug)` as `renderInfo(slug, getPageData(slug), {})` (sync,
     default-only) for back-compat with existing `pages.test.ts`.

4. **`worker/info/layout.ts`** — give the rendered shell stable hooks:
   `<h1 id="info-title">`, `<p class="subtitle" id="info-subtitle">`, and wrap the
   body in `<div id="info-body">…</div>`. Add an optional `editorHtml` param
   appended before `</body>` (toolbar + script + style), passed only by `renderInfo`.

5. **`worker/info/editor.ts`** — the injected admin UI as a string constant:
   - Toolbar (fixed, top-right): **Edit · Save · Cancel · Revert · `</>` HTML**,
     + a status chip ("source default" / "overridden ✎").
   - On **Edit**: set `contenteditable` on `#info-title`, `#info-subtitle`,
     `#info-body`; intercept `paste` → insert plain text; set
     `defaultParagraphSeparator=p`.
   - `</>` toggle: swap `#info-body` between contenteditable view and a `<textarea>`
     holding the same `innerHTML`; toggling back re-applies the edited HTML.
   - **Save**: `POST /info/<slug>/save` with `{title: #info-title.innerText,
     subtitle: #info-subtitle.innerText, body: #info-body.innerHTML}` and the
     Bearer key; on 200 reload; on 401 prompt for the key again.
   - **Revert**: confirm → `POST /info/<slug>/revert` → reload.
   - Key handling: `localStorage.voygentInfoAdminKey`; `?edit=1` (or no stored key
     on first Edit) triggers a prompt; toolbar shown only when a key is stored or
     `?edit=1` is present.

6. **Routes** (`worker/index.ts`):
   - Change the existing `/info/` GET to: detect override + render via
     `renderInfo`, set `cache-control: no-store` (was `public, max-age=300`).
   - Add `POST /info/<slug>/save` and `POST /info/<slug>/revert`
     (regex match), each: `guardMutation` → `adminAuthed` → known-slug → mutate.
   - Export `adminAuthed` from `worker/access/admin.ts` and import it here.

## Error handling

- Read path never throws to the user: `getOverride` swallows DB errors → null →
  defaults. Editor is inert without a key.
- Write path surfaces failure: a non-admin save/revert → `401` (client re-prompts);
  unknown slug → `404`; malformed JSON → `400`. A genuine D1 write error
  propagates as `500` so the admin sees the save didn't persist (no false
  "saved").
- WYSIWYG fidelity: plain-text paste + `<p>` separator + `innerHTML` capture keep
  the structured markup (stat/mono/artifact/cta) intact for text edits; the `</>`
  textarea is the escape hatch for structural changes.

## Testing

- `worker/info/overrides.test.ts` — in-memory better-sqlite3 Db built from
  `migrations/0002_info_overrides.sql` (mirrors `worker/access/testdb.ts`):
  put→get round-trip, upsert overwrites, delete removes, get-missing → null.
- `worker/info/pages.test.ts` (extend) — `mergeOverride` prefers override fields;
  `renderInfo` with `{edited:true}` shows the "overridden" chip and an editable
  body container; `infoPageHtml` (default path) still renders all existing slugs.
- `worker/info/routes.test.ts` (or extend an existing index test) — save/revert
  return 401 without `ADMIN_TOKEN`, 200 with it; unknown slug → 404; after save,
  a GET reflects the override; after revert, GET reflects the default.
- `tsc --noEmit` clean; full `vitest run` green; `npm run build:web` builds.

## Deploy order (migrate THEN deploy — schema is not auto-applied)

1. `wrangler d1 execute voygent-demo --remote --file migrations/0002_info_overrides.sql`
2. Ensure `ADMIN_TOKEN` secret is set on the Worker (`wrangler secret put ADMIN_TOKEN` if absent).
3. `VITE_API_BASE="" npm run build:web`
4. `wrangler deploy`
5. Smoke: `/info/<slug>` GET 200; `POST /info/<slug>/save` without auth → 401;
   with `Bearer ADMIN_TOKEN` → 200 + override visible; revert → default restored;
   then `DELETE` any test override row if used.

Rebase onto latest `origin/main` before merge/deploy (shared Worker — superset, not clobber).

## Out of scope

- Page creation, media/image upload, multi-user editing, revision history/undo
  beyond Revert-to-default, and markdown authoring.
