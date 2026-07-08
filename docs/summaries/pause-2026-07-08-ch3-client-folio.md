# Session Handoff: Demo design lane — A10 shipped live, ch3 spec approved & committed
**Date:** 2026-07-08 at 11:46
**Repo:** /home/neil/dev/voygent-demo-demo-design
**Branch:** demo-design (worktree; base main a41ae10)
**Uncommitted changes:** no (only untracked docs/summaries/CHECKLIST.md, this lane's own mirror)
**Transcript:** (current session — voygent-lite main-clone session driving the demo-design worktree)

## What Was Accomplished
1. **Picked up** `pause-2026-07-08-demo-design-lane.md`; created worktree `/home/neil/dev/voygent-demo-demo-design` (branch `demo-design`, journal entry live, `.dev.vars`/`.env` symlinked, deps installed).
2. **Cache verified** — demo.voygent.ai edge rolled over on its own; no purge was needed (that lane item closed).
3. **A10 chapter discoverability SHIPPED LIVE**: no-param visitors default to chapter 1 (`collab`) instead of localStorage round-robin (rotation code deleted); intro card lists all chapters (current marked "watching", others navigate); next-chapter CTA on BOTH end surfaces — `ReelExplore` (where ch1 AND ch2 actually end; the prior handoff wrongly assumed ReelEndCard) and `ReelEndCard` (dublin-oct today, ch3+ later). `?reel=<id>` navigation pins `mode=auto`. Commits `c2afdad` (feature) + `1afcd81` (review cleanups: shared `reloadWith` helper ×3 sites, shared `NextChapterCta` type). Merged ff to `main` = `1afcd81`, pushed, deployed Worker Version `65a2d231`, live-smoked (default=ch1 + chapter list on the real site; new bundle `index-BlRY-zV7.js` served immediately — no cache lag).
4. **Review**: workflow code-review (high, `wf_80bea244-f46`) — zero correctness bugs, 2 confirmed cleanups, both applied pre-merge. Typecheck clean; 175 web tests green; Playwright e2e of intro-list click-through, ch1 seek-to-end → "Watch Chapter 2" CTA → lands ch2, ch2/dublin-oct end surfaces unchanged.
5. **Ch3 designed with Neil (brainstorm complete)** — spec committed `38154af` (demo-design only, NOT merged): `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md`.

## Decisions Made (Neil, binding)
- **Ch3 POV = client as main stage** (option A): viewer watches the Millers' folio window; advisor surface only as framing/cutaway.
- **Ch3 slice = fresh pre-trip story** (option B): proposal arrives → explore → customize (toggle + note) → 2-way advisor update lands live → Final. Does NOT replay ch2's whiskey-walk beat.
- **Ch3 surface = new `ReelFolioView` component** (option B), styled to production alaska-warm via a staging screenshot as visual contract (not an extended ReelClientView, not an iframe). Becomes the shared folio surface; C11's FolioArtifact swap is a follow-up step in this lane, out of the ch3 plan.
- Ch3 registration: `id:"client"`, `chapter:3`, title "Chapter 3 · Their trip, their window", `run.next="client"` (A10 chain extends automatically).
- Honesty rules: scripted-walk-through framing like ch1/ch2; beat-4 copy capability-true to M7 (product ships folio→advisor hint server-side; demo relay is a scripted rendering).

## Files Created or Modified (all on demo-design; A10 files also on main+prod)
| File | Action | Why |
|------|--------|-----|
| web/src/recordings/registry.ts | modify | chapter/next fields, CHAPTERS, pickReel default→ch1, rotation removed |
| web/src/recordings/registry.test.ts | rewrite | default-to-ch1 + chapter-arc tests (14 green) |
| web/src/ReelIntro.tsx | modify | chapter list below CTAs |
| web/src/ReelEndCard.tsx | modify | nextChapter CTA (primary when present) + exported NextChapterCta |
| web/src/ReelExplore.tsx | modify | nextChapter CTA in actions row |
| web/src/App.tsx | modify | gotoReel + reloadWith helper (dedup ×3), wiring to intro/end surfaces |
| web/src/skin-claude.css | modify | .cl-reel-chapters / .cl-reel-chapter styles |
| docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md | create | approved ch3 design |
| docs/summaries/CHECKLIST.md | create (untracked) | lane checklist mirror |

## Git State
```
?? docs/summaries/CHECKLIST.md
```
demo-design = 38154af (spec commit UNPUSHED, branch local-only). main = 1afcd81 pushed = prod Worker 65a2d231.

## Checklist
- [x] A10 chapter discoverability — SHIPPED LIVE (main 1afcd81, Worker 65a2d231)
- [x] Edge cache — rolled over on its own, verified; no purge needed
- [x] C10-ch3 brainstorm + spec — committed 38154af
- [ ] Neil reviews ch3 spec → then superpowers:writing-plans → implement ch3 (screenshot staging alaska-warm folio FIRST as visual contract)
- [ ] C11: swap curated demo's FolioArtifact (ClaudeChatView.tsx:97-250) to ReelFolioView — follow-up AFTER ch3 ships
- [ ] C9: feature the folio in ch1/ch2 (mid-chapter pop-up) — separate item; ch3 ends on folio by construction
- [ ] A2: mobile reel scroll (ReelCallout.tsx:22-81) — needs phone-viewport visual iteration
- [ ] B6: Rome hotel fixture price spread (boards.ts:134-138, scripts/capture-fixtures.mjs)
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted now that ch2 stays
- [ ] Pre-existing main test failure: worker/info/pages.test.ts em-dash voice rule (info-page body) — small fix lane, NOT this diff
- [ ] voygent-lite #343 setup pages (separate lane, M3) + signup email covers ChatGPT

## Self-Critique
- **Least confident:** (1) alaska-warm visual fidelity is entirely unverified until the staging-screenshot contract step runs; (2) beat 2's "scripted scrolling" — the reel player has no scroll-driving verb today; DSL shape was deliberately deferred to the implementation plan and may prove the hard part; (3) demo deploys used voygent-lite's `.env` `CLOUDFLARE_API_TOKEN` (demo repo has none of its own) — worked for `wrangler deploy`, still lacks cache-purge perms; (4) chapter list on small/mobile viewports never looked at (A2 is open for exactly this reason).
- **Biggest thing being missed:** ReelExplore and the planned ReelFolioView are about to be two interactive folio-ish surfaces; the ch3 plan should decide whether ReelExplore eventually renders via ReelFolioView or they intentionally stay separate — otherwise we recreate the drift C11 exists to kill.
- **If it breaks in 3 months:** a ch4 gets added without updating `next` on `client` and nothing fails — the chain just silently ends; also the carried-over fixture-vs-live shape split from the prior handoff still has no contract test.
- **Did NOT do:** ch3 implementation plan (gated on Neil's spec review); staging folio screenshot; push of the demo-design branch (spec commit is local-only); the pre-existing pages.test.ts fix; any mobile verification.
- **How to check:** spec content — read `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md`; A10 live — open `https://demo.voygent.ai/` (no params) and expect ch1 intro + chapter list, then seek ch1 to end and expect "Watch Chapter 2 · Run the trip →"; unpushed spec — `git -C /home/neil/dev/voygent-demo-demo-design log origin/main..demo-design --oneline` (expect 38154af); pre-existing failure — `npx vitest run worker/info/pages.test.ts` on main (expect the em-dash assertion at pages.test.ts:72).

## Remaining Work
Priority order: (1) Neil reviews the ch3 spec (only open gate); (2) invoke superpowers:writing-plans for ch3, starting with the staging alaska-warm screenshot as visual contract; (3) implement ch3 in THIS worktree/branch (registry entry `client`, ReelFolioView, dublin-client screenplay, tests incl. seek-to-end Playwright pass); (4) C11 FolioArtifact swap as the follow-up step; (5) A2 / B6 / B4-remainder per checklist. Keep the workflow code-review before every merge — it caught real cleanups this session and Criticals in prior ones.

## Open Questions
- Ch3 spec sign-off (or edits) — Neil.
- LLM_MODEL: pin public demo to Haiku for the cost story? (one wrangler command, Neil's call — carried from prior handoff)
- Does the curated demo still need paste/gap-fill now that ch2 stays in the reels? (carried)

## Coordinate Closet
- `38154af` (ch3 spec commit, demo-design, UNPUSHED) · `1afcd81` (main tip, pushed, deployed) · `c2afdad` (A10 feature commit) · `a41ae10` (lane base)
- `65a2d231-6b21-4a6a-b235-b0de4c5b4e25` (voygent-demo Worker Version, this deploy) · `assets/index-BlRY-zV7.js` (live bundle) · `index-BT_t68ki.js` (prior bundle)
- `wf_80bea244-f46` (A10 code-review run id, clean)
- `/home/neil/dev/voygent-demo-demo-design` (worktree) · branch `demo-design`
- `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` (approved spec)
- `~/.claude/coordination/voygent-demo/journal.md` (lane journal entry `demo-design`)
- CLOUDFLARE_API_TOKEN lives in `/home/neil/dev/voygent-lite/.env` (demo repo's .env has none; needed for `npx wrangler deploy`)
- `worker/info/pages.test.ts:72` (pre-existing em-dash failure on main)
- `web/src/recordings/dublin-run.screenplay.ts` (ch2 fixture lineage for ch3) · `ClaudeChatView.tsx:97-250` (FolioArtifact, C11 target)
- `docs/summaries/pause-2026-07-08-neil-demo-qa.md` (12-finding QA queue, still source of truth) · `docs/summaries/pause-2026-07-08-demo-design-lane.md` (prior handoff)
- ch3 registration: id `client` · chapter 3 · title "Chapter 3 · Their trip, their window" · `run.next="client"`

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). Present the rebuilt checklist +
Remaining Work and ask whether to continue or do something else. Work in the
`/home/neil/dev/voygent-demo-demo-design` worktree (NOT the main clone). The ch3
implementation is gated on Neil's review of the committed spec; once he approves,
go through superpowers:writing-plans before building, and run the staging
alaska-warm folio screenshot (visual contract) as the first plan step.
