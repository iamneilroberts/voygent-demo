# Runbook — editing `/info` deep-dive pages and porting edits back to git

The worker-served `/info/<slug>` pages render from a git seed
(`worker/info/content.json`) with a live **D1 override** layered on top. The
in-place editor writes overrides to D1 so edits go live instantly; this runbook
is how you fold those edits back into git so the repo stays the source of truth.

## Edit live

1. Open `https://demo.voygent.ai/info/<slug>?edit=1`.
2. At the prompt, paste the Worker's **`ADMIN_TOKEN`** value (stored in this
   browser's localStorage; the toolbar then shows on every `/info` page).
3. **Edit** → edit title/subtitle/body in place (or use **`</>` HTML** for raw
   markup) → **Save**. The edit is live immediately (D1 override). **Revert**
   drops the override back to the git seed.

## Port edits back to git

All commands run from the repo root.

1. **See what's overridden** (optional):
   ```
   node scripts/info-content.mjs status
   ```
2. **Pull** the overrides into the seed (also writes the guard snapshot):
   ```
   node scripts/info-content.mjs pull
   ```
3. **Review + commit** the seed change:
   ```
   git diff worker/info/content.json
   git add worker/info/content.json && git commit -m "content(info): port live edits"
   ```
4. **Deploy** so the live seed matches what you just committed:
   ```
   VITE_API_BASE="" npm run build:web && npx wrangler deploy
   ```
5. **Confirm the deploy is live** before clearing (worker propagation isn't
   instant; `no-store` on `/info` is a cache header, not a deploy barrier):
   ```
   npx wrangler deployments list   # new version at 100%
   ```
6. **Clear** the now-redundant D1 overrides (snapshot-guarded — preview first):
   ```
   node scripts/info-content.mjs clear            # dry run: shows what it would delete
   node scripts/info-content.mjs clear --yes      # execute
   ```
   The editor's "overridden ✎" chips return to "source default".

## Safety properties

- **`clear` never destroys an unported edit.** It deletes only rows whose
  `updated_at` is unchanged since the `pull` snapshot. If you (or anyone) edited
  a page live between `pull` and `clear`, that row is **skipped** and the command
  exits non-zero — pull again to capture it before clearing.
- **`pull` fails loud** on malformed/empty wrangler output (it never silently
  reports "no edits").
- `null` from D1 keeps the seed value; an empty string `""` is a real edit and
  replaces it — matching the live render exactly.
- `clear --slug <slug>` clears a single page.

## Ordering matters

`pull → commit → deploy → confirm-live → clear`. Clearing **before** the new seed
deploys would briefly serve the old (pre-edit) seed; clearing **after** deploy
closes that window, and the snapshot guard handles concurrent edits.
