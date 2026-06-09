# Design — easy port-back of /info page edits to git

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `info-content-portback`, branch off `main` e1b9161)
**Status:** design — revised per codex-review (2026-06-09); ready to implement

> **codex-review applied:** snapshot-guarded `clear` (was unconditional DELETE),
> exact render-parity, robust wrangler-output parsing, null-vs-`""` merge
> semantics, injectable wrangler-runner for CLI tests, dynamic slug derivation,
> resume provenance note. See the revised sections below.

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
  `pages.ts`) is folded into `content.json` and **deleted**. JSON can't carry the
  provenance comment, so `pages.ts` keeps a one-line comment noting the resume
  body originated in `resume.ts` (git history has the rest).
- **Byte-identical output requirement (proven exactly, not by markers):**
  `content.json` holds the exact same strings as the current template literals.
  Generation is mechanical (a one-shot vitest step that imports the current
  `PAGES` and `JSON.stringify`s it). The conversion step **asserts exact equality**:
  for every slug, `renderInfo(slug, fromOldPages)` must `===` `renderInfo(slug,
  fromContentJson)` (full rendered HTML string), and `JSON.parse(JSON.stringify(
  PAGES))` must deep-equal the imported JSON. That one-shot equality gate (run
  while both the old literal and the new JSON exist) is the real parity proof;
  the permanent suite keeps the lighter marker/structure tests (exact-HTML golden
  tests would be brittle against every legitimate future content edit).
- **Slugs are derived dynamically** from `content.json` (and from the D1 result
  set in the script) — no hardcoded page counts anywhere. (The repo currently has
  8 deep-dive pages + resume = 9 entries; code must not assume a number.)

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
  "SELECT slug,title,subtitle,body,updated_at FROM info_page_overrides"`. **Parse
  defensively:** only after a zero exit code; require `Array.isArray(out)`,
  `out[0].success === true`, `Array.isArray(out[0].results)` — otherwise **throw
  loudly** (malformed output must never read as "no edits"). Merge each row over
  the in-repo `content.json` (see null-vs-`""` rule below), write it back
  pretty-printed (2-space, trailing newline). Print the changed slug list. A row
  whose slug is absent from `content.json` is **warned and skipped** (never
  silently dropped). Also write a **pull snapshot** `worker/info/.pull-snapshot.json`
  (gitignored) recording `{ slug: updated_at }` for every pulled row — the
  guard `clear` checks against.
- **`status`** — list slugs that currently have a D1 override (what a `pull` would
  change), without writing.
- **`clear`** — **snapshot-guarded, not a blind DELETE.** Re-reads current D1,
  then for each row compares its `updated_at` to `.pull-snapshot.json`. It deletes
  **only** rows whose `(slug, updated_at)` still match the snapshot
  (`DELETE … WHERE slug=? AND updated_at=?`), so a live edit made after the `pull`
  is **never** destroyed — such rows are reported and skipped, and the command
  exits non-zero if any were skipped (signalling "pull again"). Requires `--yes`.
  Optional `--slug <slug>` to clear a single page. A missing snapshot → refuse
  (must `pull` first).

**Null vs empty-string merge semantics (match the runtime exactly):** the live
`mergeOverride` treats `null` as "keep default" and any string — **including
`""`** — as a real override ([worker/info/pages.ts](../../worker/info/pages.ts)),
and the editor's save posts `""` (never null) for absent fields
([worker/index.ts](../../worker/index.ts)). So the script's merge replicates it:
a field is replaced when its override value is a string (incl. `""`) and kept when
it is `null`/absent. Tested both ways.

**Pure, injectable core (testable without wrangler):** the merge is an exported
pure function `mergeOverrides(content, rows) -> { content, changed[], skipped[] }`.
The wrangler call is an **injected runner** (`runQuery(sql) -> rows`) so `pull`,
`status`, and `clear` are unit-tested with a fake runner. The CLI dispatch is
guarded by a main-module check
(`if (process.argv[1] === fileURLToPath(import.meta.url)) main()`) so importing
the module in a test does not shell out.

**No new prod surface:** the script uses the developer's local `wrangler` auth.
There is no HTTP export endpoint and no change to the live worker.

## Part 3 — The edit→port loop (ordering matters)

Documented in `docs/runbooks/info-page-editing.md`:

1. Edit live: `https://demo.voygent.ai/info/<slug>?edit=1` → enter `ADMIN_TOKEN`.
2. `node scripts/info-content.mjs status` (optional) → see what's overridden.
3. `node scripts/info-content.mjs pull` → `git diff worker/info/content.json` →
   commit. (Writes `.pull-snapshot.json`.)
4. `VITE_API_BASE="" npm run build:web && npx wrangler deploy` — the seed now
   matches the live pages.
5. **Confirm the deploy is live** before clearing: `npx wrangler deployments list`
   shows the new version at 100% (worker propagation isn't instant, and `no-store`
   on `/info` is a cache header, not a deploy barrier). Optionally re-fetch a
   changed `/info/<slug>` to eyeball.
6. `node scripts/info-content.mjs clear --yes` — snapshot-guarded; drops only the
   rows that are unchanged since the pull, so any edit made in the meantime is
   preserved (and reported, telling you to pull again). Chips reset to "source
   default"; git is the single source of truth.

**Why clear is last and guarded:** if D1 were cleared before the new source
deploys, the live page would briefly render the *old* (pre-edit) seed — hence
deploy-then-clear. And if someone edits between pull and clear, an unconditional
DELETE would lose that edit forever — hence the `(slug, updated_at)` snapshot
guard (codex-review Critical).

## Testing

- **`mergeOverrides` unit tests:** override string fields replace seed fields;
  an all-fields override fully replaces; **`null` keeps the default, `""` replaces
  it** (matches runtime); unknown slug → reported in `skipped`, not applied; empty
  override set → no change; untouched slugs preserved; **body strings with quotes,
  backticks, unicode, backslashes, and `</script>` round-trip intact**.
- **CLI tests with a fake wrangler runner** (injected `runQuery`): `pull` writes
  the merged file + snapshot; `status` lists overridden slugs; `clear` deletes only
  snapshot-matching rows and **skips + non-zero-exits when a row's `updated_at`
  changed** since the pull; malformed/non-JSON/`success:false`/empty runner output
  → throws, not silent "no edits".
- **Exact render-parity (one-shot, at conversion):** for every slug,
  `renderInfo(slug, oldPages)` `===` `renderInfo(slug, contentJson)` full HTML.
  Permanent suite keeps the marker/structure tests in `worker/info/pages.test.ts`.
- `tsc --noEmit`, full `vitest run`, `npm run build:web` green.
- **Manual against prod:** edit a test page → `pull` → confirm the `git diff` is
  exactly the edited fields → deploy → confirm deploy live → `clear --yes` removes
  only that row; a second edit during the window is preserved (skip + non-zero).

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
- **Accidental prod data loss via `clear`** → snapshot-guarded: deletes only
  `(slug, updated_at)` rows unchanged since the pull, refuses without a snapshot,
  requires `--yes`, and non-zero-exits if it skipped a changed row. Never touches
  the seed (which is git).
- **Two-writer drift (D1 live store vs git source)** → the pull→commit→deploy→clear
  loop collapses D1 back to empty so git is authoritative between sessions; the
  snapshot guard makes the collapse safe under concurrent editing. `content.json`
  merge conflicts are normal git text conflicts (one editor at a time in practice).
- **Implementation note:** `worker/info/.pull-snapshot.json` is gitignored
  (ephemeral, machine-local handoff between `pull` and `clear`).

## Out of scope

- No HTTP export endpoint, no editor changes, no revision history, no automated
  CI that pulls (kept a manual, reviewable command).
