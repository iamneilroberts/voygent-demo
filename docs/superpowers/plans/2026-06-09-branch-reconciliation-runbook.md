# voygent-demo Branch Reconciliation Runbook

**Date:** 2026-06-09 · **Status:** plan, awaiting go-ahead to execute. **Author:** session `improve-demo`.
**Why:** `main` is a stale docs-mostly branch; **prod is deployed from `demo-enrichment`**. Three lines
forked from `eddffa5` and never reconciled, creating a deploy landmine. This runbook makes the trunk
match reality, safely, without losing work and without a force-push.

> This is a git-ops runbook, not a TDD feature plan. Each step has a verification. Do not skip them.
> **Nothing here has been executed yet.** The author stopped at planning per the user's instruction.

---

## Verified situation (ground truth, 2026-06-09)

| Branch | Tip | Relationship | Contents |
|--------|-----|--------------|----------|
| `main` | `673ef38` | 4 commits not in demo-enrichment | **docs only** — 3 spec/plan files (access-control design+plan, faithful-thin-client design). Zero code. |
| `demo-enrichment` | `fc023d3` | 113 commits not in main | **DEPLOYED TO PROD.** Verified: `GET /stats` → 200, route exists only here. Phase-machine, multi-provider (DispatchProvider/DeepSeek/Ollama), stats/session-store/storeops, info pages, enriched fixtures, live pass-through, record/replay. `session-do.ts` = 611 lines. |
| `demo-access-control` | `5b9bfcd` | 19 commits, based on **main** (`8add43e`) | Passcode gate, D1 access-control, admin console, HMAC cookies. **Still active in a worktree** (`/home/neil/dev/voygent-demo-access-control`). |
| `phase-machine` | — | **fully contained in demo-enrichment** (0 commits outside) | stale — already folded. |
| `claude-skin`, `demo-ui-port` | — | **fully contained in main** (0 commits outside) | stale — already merged. |

Common ancestor of all three lines: `eddffa5` ("claude-skin shipped handoff").

**The landmine:** merging `demo-access-control` → `main` and deploying `main` **as it is today** would
ship a tree that lacks the 113 `demo-enrichment` commits → regress prod (lose phase-machine, multi-provider,
stats, enrichment, …). Phase 1 below defuses it permanently.

---

## Coordination prerequisite (do this first, before any git surgery)

The `demo-access-control` worktree is **active**. Phase 1 advances `main` under it. That does *not* break
its base (`8add43e` stays reachable), but that session must know `main` moved so it can rebase later.

- [ ] Post a coord note so the access-control session sees it on its next prompt:
```
/branch coord main is being reconciled: demo-enrichment (prod truth, 113 commits) folded into main. Your base 8add43e stays reachable but you are now behind main; rebase/merge onto the new main before your next prod deploy or you will regress prod. Conflict surface = App.tsx, sse-client.ts, worker/index.ts, worker/session-do.ts, wrangler.toml + migration renumber. See docs/superpowers/plans/2026-06-09-branch-reconciliation-runbook.md Phase 2.
```
- [ ] Confirm no other session is mid-deploy (`git status` in each worktree; check journal `## Active`).

---

## Phase 1 — Fold `demo-enrichment` into `main` (SAFE, do now)

**Goal:** make `main` a superset of prod so the trunk matches the deployed code. Clean auto-merge
(main's only delta is docs; verified via `git merge-tree` — no code conflicts). **No force-push.**

- [ ] **Step 1 — Snapshot safety net (cheap, reversible).**
```bash
git -C /home/neil/dev/voygent-demo tag pre-reconcile-main-2026-06-09 main
git -C /home/neil/dev/voygent-demo tag pre-reconcile-enrich-2026-06-09 demo-enrichment
```
These tags let you `git reset --hard` back to either tip if anything looks wrong.

- [ ] **Step 2 — Verify you are on a clean main.**
```bash
git -C /home/neil/dev/voygent-demo checkout main
git -C /home/neil/dev/voygent-demo status --porcelain   # expect: only docs/worktree-journal.md + the two new plan/memory docs from this session
```
Commit this session's journal + plan docs first if you want them in the merge base (optional):
```bash
git add docs/worktree-journal.md docs/superpowers/plans/2026-06-09-branch-reconciliation-runbook.md docs/superpowers/plans/2026-06-09-faithful-thin-client-keystone.md
git commit -m "docs(reconcile): branch-state finding + reconciliation runbook + keystone plan (pre-merge)"
```

- [ ] **Step 3 — Merge demo-enrichment into main.**
```bash
git -C /home/neil/dev/voygent-demo merge --no-ff demo-enrichment -m "merge: fold demo-enrichment (deployed prod truth) into main — reconcile trunk"
```
Expected: clean auto-merge (docs vs code, no overlap). If git reports a conflict, STOP — re-verify against
this runbook's assumptions before resolving; a conflict here means something changed since 2026-06-09.

- [ ] **Step 4 — VERIFY the merged tree's *code* equals current prod (demo-enrichment).**
```bash
# Worker + shared + web code must be byte-identical to demo-enrichment tip (main only added docs).
git -C /home/neil/dev/voygent-demo diff --stat demo-enrichment HEAD -- worker/ shared/ web/ wrangler.toml migrations/
```
Expected: **empty** (no differences). If non-empty, the merge altered code — investigate before proceeding.

- [ ] **Step 5 — Build + test the reconciled trunk.**
```bash
cd /home/neil/dev/voygent-demo && npx tsc --noEmit && npx vitest run
```
Expected: typecheck clean; full suite green (demo-enrichment was ~221–222 tests green per its handoffs).

- [ ] **Step 6 — Push main (normal push, no `--force`).**
```bash
git -C /home/neil/dev/voygent-demo push origin main
```
(If `origin/main` has diverged remotely, do NOT force — fetch, inspect, and reconcile the remote first.)

- [ ] **Step 7 — (Optional) Re-deploy main to prove parity.** Because Step 4 proved code == current prod,
deploying `main` now is a no-op change to prod. Only do this if you want to flip the deploy *source* to main:
```bash
cd /home/neil/dev/voygent-demo && VITE_API_BASE="" npm run build:web && npx wrangler deploy
```
Then re-verify `GET /stats` → 200 and `/info/phase-machine` → 200 (the two prod-only-on-enrichment routes).
**Deploy gotcha (from journal):** must build with `VITE_API_BASE=""` or the bundle bakes localhost.

**After Phase 1:** the landmine is gone — any future deploy from `main` includes the 113 commits, so it
can never silently regress prod.

---

## Phase 2 — Integrate `demo-access-control` (when that branch is READY, not now)

Do this only once the access-control session declares its branch complete. It is the conflict-heavy step.

**Overlap (touched by BOTH access-control and demo-enrichment) — expect conflicts in exactly these 5:**
`web/src/App.tsx`, `web/src/sse-client.ts`, `worker/index.ts`, `worker/session-do.ts`, `wrangler.toml`.

**Plus two structural issues:**
1. **Migration numbering collision** — both branches add `migrations/0001_*.sql`
   (`0001_access_control.sql` vs `0001_session_stats.sql`). Different files (no text conflict) but two
   `0001_` is wrong for ordered application. **Renumber access-control's to `0002_access_control.sql`**
   after Phase 1, and update any reference to it.
2. **wrangler.toml — two distinct D1 bindings must coexist:**
   - enrichment: `STATS_DB` → `voygent-demo-stats` (`20321ac2-…`)
   - access-control: `DEMO_DB` → `voygent-demo` (`7825123d-…`)
   These are different bindings + different DBs → the resolution is **keep BOTH `[[d1_databases]]` blocks**,
   plus access-control's `[vars]` `APP_ORIGIN`. The shared `SESSION` DO + `migrations tag=v1` are identical
   on both branches → no DO conflict.

- [ ] **Step 1 — Choose merge-once over rebase-19×.** Access-control is 19 commits, several of which each
  touch `session-do.ts`/`index.ts`; a `git rebase main` would replay conflicts up to 19 times. Prefer a
  single integration merge so you resolve the 5-file overlap **once**:
```bash
git -C /home/neil/dev/voygent-demo checkout demo-access-control
git -C /home/neil/dev/voygent-demo merge main      # resolve the 5 overlapping files + renumber migration
```
  (If a linear history is required instead, `git rebase --rebase-merges main` and resolve iteratively —
  only worth it if the team mandates no merge commits.)

- [ ] **Step 2 — Resolve each overlap by KEEPING BOTH features** (they are additive, not contradictory):
  - `worker/index.ts`: keep enrichment routes (`/stats`, `/info/*`) **and** access routes (`/auth`, `/auth/me`,
    admin, the `/chat` admission gate).
  - `worker/session-do.ts`: keep the phase-machine + enrichment + DispatchProvider wiring **and** the
    per-code reconcile / admission logic. (This is the hardest file — 611 lines on one side, gate logic on
    the other. Read both hunks fully; do not accept either side wholesale.)
  - `web/src/App.tsx` + `sse-client.ts`: keep autoplay/model-selector/folio shapes **and** the Gate +
    credentialed same-origin chat.
  - `wrangler.toml`: keep both D1 blocks + APP_ORIGIN (above).
  - Rename `migrations/0001_access_control.sql` → `0002_access_control.sql`.

- [ ] **Step 3 — Verify:** `npx tsc --noEmit && npx vitest run` (both feature suites green: stats/phase/enrichment
  tests AND access/admin/codes/money/session tests). Manually smoke the `/chat` gate + `/stats` together.

- [ ] **Step 4 — Merge to main + deploy:** `git checkout main && git merge --no-ff demo-access-control`,
  then apply the new D1 migration (`wrangler d1 execute voygent-demo --remote --file migrations/0002_access_control.sql`),
  build (`VITE_API_BASE=""`), `wrangler deploy`, re-verify `/stats`, `/info/phase-machine`, and the gate.

---

## Phase 3 — Branch hygiene (after Phases 1–2)

All verified fully contained, so deletion loses nothing:
- [ ] `git branch -d phase-machine` (⊆ demo-enrichment)
- [ ] `git branch -d claude-skin` (⊆ main)
- [ ] `git branch -d demo-ui-port` (⊆ main)
- [ ] After Phase 1 lands: `git branch -d demo-enrichment` **only once** `main` ⊇ it is pushed and confirmed
  (it will be, by construction). Keep the `pre-reconcile-*` tags until you're confident.
- [ ] Delete corresponding `origin/*` branches with `git push origin --delete <name>` once locals are gone.

---

## Phase 4 — Re-baseline the faithfulness work (the original task)

The 2026-06-09 faithful-thin-client **spec** and the **keystone plan** were written against `main`'s OLD
tree (288-line `session-do.ts`, single `ClaudeProvider`, embedded `SYSTEM_HINT`). After Phase 1, `main` IS
the demo-enrichment tree, so:
- [ ] Re-read `worker/session-do.ts` (now 611 lines: `SYSTEM_HINT` @58 + `ENRICHMENT_WORKFLOW` + `LIVE_TRIP_WORKFLOW`,
  phase-machine wiring, `DispatchProvider`), `worker/agent/loop.ts` (now has `afterToolBatch`/`continueDirective`
  hooks), `worker/llm/provider.ts` + `dispatch.ts`.
- [ ] Rewrite `docs/superpowers/plans/2026-06-09-faithful-thin-client-keystone.md` against the real tree.
  The keystone *idea* is unchanged (`initialize.instructions` as the operating core; graceful degradation;
  object brief), but: (a) the seed is now assembled from 3 constants + phase directives, not one `SYSTEM_HINT`;
  (b) the provider is multi-tier (`DispatchProvider`), so "system prompt" plumbing differs; (c) Decision K1's
  "demo doesn't expose manage_trip_goal" must be re-checked against the phase-machine, which may already be
  the demo's own orchestration the faithfulness spec wants to *remove*.
- [ ] Consider whether the faithfulness goal and the phase-machine are in tension (the phase-machine IS
  demo-side orchestration; the spec says "let the server loop drive"). That is the real design question to
  resolve before re-planning.

---

## Rollback

Any time during Phase 1: `git checkout main && git reset --hard pre-reconcile-main-2026-06-09`.
The `demo-enrichment` branch and the `pre-reconcile-*` tags are untouched, so prod's source is always recoverable.
