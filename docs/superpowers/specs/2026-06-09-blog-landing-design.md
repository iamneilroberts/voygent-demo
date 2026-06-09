# Design — blog landing page for the engineering deep-dives

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `deepdive-voice-rewrite`)
**Mockup:** https://demo.voygent.ai/mockups/blog (`web/public/mockups/blog.html`)

## Goal

A blog-style landing page at `/blog` that auto-indexes the deep-dive docs and
gives Neil one editable place to write the running Voygent narrative, linking
into the deep dives. Replaces the planned `engineering-v2` index.

## Decisions (confirmed)

- **Post source:** a `content.json` entry is a post when it has **`blog: true`**
  (plus a `tags: string[]`). The list auto-renders from flagged entries; intro
  excerpt is derived (first `<p>` of body, HTML-stripped + truncated).
- **Route + theme:** worker-rendered **`GET /blog`**, amber-CRT look, self-contained
  inline styles (same pattern as `/info` pages; does NOT depend on the throwaway
  `_system.css` mockup asset).
- **Hero:** a `blog-home` entry holds the narrative; rendered as the hero and
  **editable in place on `/blog`** via the existing editor (slug `blog-home`).
- **Search/tags:** client-side over title + subtitle + intro + tags.
- **Footer/nav:** Bio · Contact (email) · GitHub. No RSS/Atom.

## Data model

`content.json` entries gain two optional fields, ignored by the `/info` render
path (which only reads title/subtitle/body):

```jsonc
"context-economics-v2": { "title": "...", "subtitle": "...", "body": "...",
                          "blog": true, "tags": ["context","tools","cost"] }
"blog-home":            { "title": "Voygent · engineering notes",
                          "subtitle": "...", "body": "<hero narrative HTML>" }   // blog:false/absent
```

- `blog-home` is the editable hero (not itself a post).
- Posts: every entry with `blog === true`.

## Components

1. **`worker/blog/render.ts`** — pure-ish builder:
   - `collectPosts(content) -> Post[]` (filter `blog===true`; derive
     `intro` = first `<p>…</p>` inner text, tags stripped, truncated ~220 chars;
     keep slug/title/subtitle/tags). Sorted by a stable order (insertion order of
     content.json; optional `order` field later).
   - `renderBlog(heroData, posts, { withEditor, edited }) -> string` — full HTML:
     top nav, hero (with `#info-title/#info-subtitle/#info-body` ids so the existing
     `editorChrome("blog-home", …)` edits it in place), search box + tag chips,
     post cards, footer (Bio/Contact/GitHub), and the inline client JS for
     client-side search + tag filter (post metadata injected as a JSON island).
2. **Route** in `worker/index.ts`: `GET /blog` →
   `def = getPageData("blog-home")` (fallback hero text if absent) →
   `ov = getOverride(db,"blog-home")` → render hero from `mergeOverride(def,ov)`
   + posts from `collectPosts(CONTENT)`; `cache-control: no-store`; inject editor.
   (The existing `POST /info/blog-home/save|revert` already handles hero edits.)
3. **`content.json`**: add `blog-home` (hero) + set `blog:true`+`tags` on
   `context-economics-v2`. `isKnownSlug` already covers any key (so `blog-home`
   is editable/saveable with no route change).
4. **Fix `scripts/info-content.mjs` `mergeOverrides`**: preserve non-edited
   fields. Change `next[slug] = {title,subtitle,body}` →
   `next[slug] = { ...before, title, subtitle, body }` so `tags`/`blog` survive a
   `pull`. (The editor only edits title/subtitle/body; tags/blog live only in
   content.json.)
5. **Nav**: add a `/blog` link to the `/info` footer nav (`INFO_NAV`) so deep-dive
   pages can return to the blog. `blog-home`/posts are reached via `/blog`, not nav.

## Types

`PageData` stays `{title,subtitle,body}`. A separate `BlogMeta` type
(`{slug,title,subtitle,tags,intro}`) is produced by `collectPosts`. `content.json`
is typed loosely (`Record<string, {title;subtitle;body;blog?;tags?}>`).

## Error handling

- `collectPosts` tolerates entries with no `<p>` (intro = "" → card omits excerpt)
  and missing tags (→ `[]`).
- Hero absent (`getPageData("blog-home")` null) → render a built-in placeholder
  hero so `/blog` never 500s before the entry is seeded.
- D1 unbound → `getOverride` already returns null → hero from seed; no editor saves.

## Testing

- `worker/blog/render.test.ts`: `collectPosts` returns only `blog:true` entries,
  derives intro from first `<p>` (strips inner tags, truncates), defaults tags;
  `renderBlog` includes each post's title+tags+intro+`/info/<slug>` link, the
  hero body, the search/tag scaffold, and the editor chrome only when `withEditor`.
- `scripts/info-content.test.mjs`: add a case proving `mergeOverrides` preserves
  `tags`/`blog` on a pulled entry (regression for the fix).
- `worker/info/edit-routes.test.ts` (or a blog-route test): `GET /blog` → 200,
  `no-store`, lists the flagged post, hero present.
- `tsc --noEmit`, full `vitest run`, `npm run build:web`, `wrangler deploy --dry-run`.

## Deploy

Rebase onto latest `origin/main` (reel sessions active but client-only — no
`worker/info`, `worker/blog`, or `worker/index.ts` overlap), FF, build, deploy.
Seed `blog-home` + flag `context-economics-v2` ship in the same commit.

## Out of scope

No tag-editing UI (tags authored in content.json), no RSS/Atom, no server-side
search, no multi-author, no comments, no per-post dates (can add an `order`/`date`
field later).
