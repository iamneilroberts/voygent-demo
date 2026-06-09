# Design — easy port-back of /info page edits to git

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `info-content-portback`, branch off `main` e1b9161)
**Status:** design for review (codex-review requested before implementation)

## Problem

The in-place editor (shipped, `124445c`) saves `/info` deep-dive page edits to a
D1 override layer (`info_page_overrides` in `DEMO_DB`). The render path prefers an
override over the hardcoded seed in `worker/info/pages.ts`. So edits live in prod
D1, **not in git** — `pages.ts` stays the seed and drifts behind the live pages.
The user plans to make many edits and wants a low-friction way to pull those
edits back into the repo so git remains the source of truth.

## Decision (from brainstorming)

**Approach A — content as a regenerable data file + a pull script — with a
`clear` step.** Chosen over (B) AST-patching `pages.ts` in place (fragile with
multi-line template literals) and (C) a manual copy-source button (doesn't scale
to frequent edits).

## Part 1 — Refactor: page content → `content.json`

Extract every `PAGES` entry (the 8 deep-dive pages **and** `resume`, so every
editable page round-trips uniformly) into **`worker/info/content.json`**:

```json
{
  "subagents":      { "title": "...", "subtitle": "...", "body": "<p>…</p>" },
  "trip-integrity": { "title": "...", "subtitle": "...", "body": "..." },
  "...":            { ... }
}
```

- `worker/info/pages.ts` becomes pure render logic: `import CONTENT from "./content.json"`
  (works — `resolveJsonModule: true`), typed as `Record<string, PageData>`.
  `getPageData` / `mergeOverride` / `renderInfo` / `isKnownSlug` / `infoPageHtml`
  are otherwise unchanged.
- `worker/info/resume.ts` (exports only `RESUME_BODY`, imported nowhere but
  `pages.ts`) is folded into `content.json` and **deleted**.
- **Byte-identical output requirement:** `content.json` holds the exact same
  strings as the current template literals, so rendered HTML is unchanged.
  Generation is mechanical (a one-shot vitest step that imports the current
  `PAGES` and `JSON.stringify`s it), not hand-transcription. The existing render
  tests + a new render-parity test are the regression guard.

### Generation procedure (one-shot, removed after)

1. Temporarily `export` `PAGES` from the current `pages.ts`.
2. A throwaway `worker/info/_gen-content.test.ts` imports `PAGES` and
   `writeFileSync("worker/info/content.json", JSON.stringify(PAGES, null, 2))`
   (vitest runs under Node — `fs` available). Run it once.
3. Rewrite `pages.ts` to import `content.json`; drop the inline literal + the
   `resume.ts` import; delete `resume.ts` and `_gen-content.test.ts`.
4. Run the suite — existing content assertions passing proves equality.

## Part 2 — Port script: `scripts/info-content.mjs`

Node ESM script (matches `scripts/*.mjs`). Subcommands:

- **`pull`** — read prod overrides:
  `npx wrangler d1 execute voygent-demo --remote --json --command
  "SELECT slug,title,subtitle,body FROM info_page_overrides"`, parse
  `out[0].results`, merge each row over the in-repo `content.json`, write it back
  pretty-printed (2-space, trailing newline). Print the changed slug list. A row
  whose slug is absent from `content.json` is **warned and skipped** (never
  silently dropped).
- **`status`** — list slugs that currently have a D1 override (what a `pull`
  would change), without writing.
- **`clear`** — `DELETE FROM info_page_overrides` on remote; **requires an
  explicit `--yes`** flag (it deletes prod rows). Resets the editor's
  "overridden ✎" chip to "source default".

**Pure core, testable:** the merge is an exported pure function
`mergeOverrides(content, rows) -> { content, changed: string[], skipped: string[] }`.
The CLI dispatch is guarded by a main-module check
(`if (process.argv[1] === fileURLToPath(import.meta.url)) main()`) so importing
the module in a test does not shell out to wrangler.

**No new prod surface:** the script uses the developer's local `wrangler` auth.
There is no HTTP export endpoint and no change to the live worker.

## Part 3 — The edit→port loop (ordering matters)

Documented in `docs/runbooks/info-page-editing.md`:

1. Edit live: `https://demo.voygent.ai/info/<slug>?edit=1` → enter `ADMIN_TOKEN`.
2. `node scripts/info-content.mjs status` (optional) → see what's overridden.
3. `node scripts/info-content.mjs pull` → `git diff worker/info/content.json` →
   commit.
4. `VITE_API_BASE="" npm run build:web && npx wrangler deploy` — the seed now
   matches the live pages.
5. **After deploy**, `node scripts/info-content.mjs clear --yes` — drop the now
   redundant D1 rows so chips reset and git is the single source of truth.

**Why clear is last:** if D1 were cleared before the new source deploys, the live
page would briefly render the *old* (pre-edit) seed. Deploy-then-clear closes that
window.

## Testing

- `mergeOverrides` unit tests: override fields replace seed fields; an
  all-fields override fully replaces; unknown slug → reported in `skipped`, not
  applied; empty override set → no change; existing untouched slugs preserved.
- Render-parity: every known slug still renders its existing key markers after
  the `content.json` refactor (reuses/extends `worker/info/pages.test.ts`).
- `tsc --noEmit`, full `vitest run`, `npm run build:web` green.
- Manual: run `pull` against prod after a test edit; confirm the diff is exactly
  the edited fields; `clear --yes` empties the table.

## Deploy

The refactor (content.json + pages.ts import) ships with one normal deploy
(worker-only; rebase onto latest `origin/main`, superset). The script is dev
tooling and is not deployed. No D1 schema change (the table already exists). No
secret change.

## Risks / mitigations

- **Non-byte-identical extraction** → mechanical generation + render-parity test.
- **`content.json` import typing** → cast to `Record<string, PageData>`; tsc gate.
- **wrangler `--json` shape drift** → parse defensively (`out?.[0]?.results ?? []`);
  fail loudly if empty-yet-expected.
- **Accidental prod data loss via `clear`** → requires `--yes`; documented as the
  last step; only ever deletes the override rows (never the seed, which is git).

## Out of scope

- No HTTP export endpoint, no editor changes, no revision history, no automated
  CI that pulls (kept a manual, reviewable command).
