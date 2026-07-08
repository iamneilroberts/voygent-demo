# Session Handoff: Demo design lane — ch3 + C11 all SHIPPED; next C9 / A2 / B6
**Date:** 2026-07-08 at 15:45
**Repo:** /home/neil/dev/voygent-demo-demo-design
**Branch:** demo-design (worktree; main clone = /home/neil/dev/voygent-demo)
**Uncommitted changes:** no (this handoff file itself will be the only new one)
**Transcript:** (current session — voygent-lite main-clone session driving the demo-design worktree)

## What Was Accomplished
Three production ships to demo.voygent.ai today, all through the code-review gate + a 25-check Playwright pass:
1. **Ch3 "Their trip, their window" SHIPPED** (Worker `590fe92a`, main then `a4e7bc7`): client-POV chapter — new mode-aware `ReelFolioView` (`scripted`|`interactive`), new `folioview` interaction kind (parallel to `clientview`), `dublin-client.screenplay.ts` (11 snapshots, fixture wire-truth totals 4640→4756→4946→4756), registry `id:"client"` chapter 3 + `run.next="client"`. Spec review with Neil added Decisions 4 (one surface, two modes) + 5 (section-cut scroll fallback); positioning spine = client-in-control → folio-makes-the-upsell → back-ready-to-book. Visual contract: `docs/reference/2026-07-08-alaska-warm-folio-staging.png`.
2. **C11 REDEFINED (spec Decision 6) then C11a SHIPPED** (Worker `8a95bdcc`, main `46510fe`): the literal "swap FolioArtifact→ReelFolioView" was retracted — FolioArtifact is the ADVISOR-view chat folio (commission, bookings, edits, threads, ch1/ch2 spotlight anchors, 0-based `folio-day-${i}` vs ReelFolioView's 1-based). Instead: **ReelExplore retired** — ch1/ch2's ended phase now renders ReelFolioView interactive via `web/src/lib/folio-session.ts` (`folioSessionFromClient(clientView, folio)`); ReelFolioView gained hotel chooser (`folio-hotel-choice`), undated-add-ons section (`folio-addons`), send-to-Voygent funnel (`cta.sendFunnel`), always-visible scripted disclosure. `ReelExplore.tsx` + `.cl-explore` CSS deleted. New `end-state.guard.test.ts` pins the App folio-state coupling + hotel fixture-shape reconciliation.
3. **C11b FolioArtifact alaska-warm restyle SHIPPED** (Worker `a4c68e57`, main `764dec4`): CSS-only (`cl-artifact*`, `cl-day*`, `cl-include` in `skin-claude.css`) — cream card, pine top edge + kicker, serif title, tan day cards, warm prices. Review caught the price orange at 4.37:1; shipped `#96561d` (≥4.5:1 on `#faf6ec` and `#f1ebdd`). Markup + every `data-reel-target` anchor untouched.

Review gates: 3 workflow runs (wf_f1fee23d, wf_db37fd3e, wf_9bf38a2e) — 17 findings fixed, 1 declined (registry-driven end-surface resolver, YAGNI). Session-end curator pass verified ships; full suite 590/591 (one pre-existing failure).

## Decisions Made (Neil, binding)
- **Spec Decision 6:** C11 split into C11a (ReelExplore retirement — done) + C11b (FolioArtifact restyle keeping structure/anchors — done). FolioArtifact stays the advisor surface; never render it as the client window.
- Decisions 4/5 (recorded during ch3 spec review): ReelFolioView is mode-aware from day one; beat-2 section-cut scroll fallback pre-approved.
- Send funnel appears only on ch1/ch2 end-states (`sendFunnel: true`), not ch3 (its Build-your-own CTA already funnels).

## Files Created or Modified (key code; all merged to main `764dec4` except the 3 docs commits noted in Git State)
| File | Action | Why |
|------|--------|-----|
| web/src/ReelFolioView.tsx | create | shared client folio surface (scripted\|interactive) |
| web/src/lib/recording.ts | modify | ReelFolioSession/ReelFolioNote types, folioview interaction, ReelAddon.day? |
| web/src/lib/interaction.ts / highlights.ts / screenplay.ts / pacing.ts | modify | folioview plumbing + verb + 4200ms dwell (table now exhaustively typed) |
| web/src/lib/reel-pricing.ts | modify | TripPricing slice (serves both session shapes) |
| web/src/lib/folio-session.ts (+test) | create | clientView+folio → ReelFolioSession adapter (C11a) |
| web/src/recordings/dublin-client.screenplay.ts (+test) | create | ch3 screenplay; no chat folio events (anchor-collision guard) |
| web/src/recordings/registry.ts (+test) | modify | client chapter 3; run.next=client |
| web/src/recordings/reel-targets.guard.test.ts | modify | dublinClient tuple |
| web/src/recordings/end-state.guard.test.ts | create | pins App folio-coupling + hotel-shape reconciliation |
| web/src/App.tsx | modify | folio window in playing + 3-way ended branch; ReelExplore removed |
| web/src/ReelExplore.tsx | DELETE | retired into ReelFolioView interactive |
| web/src/skin-claude.css | modify | cl-fv-* block; cl-explore block deleted; C11b artifact restyle |
| docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md | modify | Decisions 4-6 + visual-contract pointer |
| docs/superpowers/plans/2026-07-08-ch3-client-folio-chapter.md · 2026-07-08-reelexplore-retirement.md | create | executed plans |

## Git State
```
(clean — demo-design at cba4072)
```
⚠️ **demo-design is docs-only commits AHEAD of main** (`1ee4879`, `cba4072`, + this handoff once committed). main = origin/main = `764dec4` = prod. **Do NOT ff-merge the docs commits yet**: the main clone's `SESSION_LOG.md` carries ANOTHER session's uncommitted WIP — merging a branch that touches SESSION_LOG.md would checkout-conflict. Ride them with the next code merge, reconciling SESSION_LOG entries then.

## Checklist
- [x] Ch3 SHIPPED (Worker 590fe92a) · C11a SHIPPED (8a95bdcc) · C11b SHIPPED (a4c68e57); C11 COMPLETE
- [ ] C9: feature the folio in ch1/ch2 (mid-chapter pop-up) — ch3 ends on folio by construction; a scripted `folioview` cutaway in ch1/ch2 is now cheap (verb + surface exist)
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`web/src/ReelCallout.tsx:22-81`); needs visual iteration on a phone viewport
- [ ] B6: Rome hotel fixture price mix — recapture via `scripts/capture-fixtures.mjs` with a price spread (`worker/live/boards.ts:134-138` area)
- [ ] Merge the docs-only commits (1ee4879, cba4072, handoff) to main with the NEXT code merge; reconcile main-clone SESSION_LOG WIP
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted now that ch2 stays in reels
- [ ] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — small separate fix lane
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] voygent-lite #343 setup pages (separate lane, M3)

## Self-Critique
- **Least confident:** (1) hardcoded "Prepared for Mark & Julie Miller · Oct 4–11" hero line in `ReelFolioView.tsx` — truthful while every reel is the Millers' Dublin trip, but nothing guards it against a future non-Dublin chapter; (2) ReelClientView (mid-playback teal window) is now the one surface visually off the alaska-warm family — deliberate scope cut, reads slightly inconsistent in ch1/ch2 playback; (3) declined review finding: App's ended branch silently prefers `folioView` if a chapter ever sets both `folioView` and `clientView`; (4) send-funnel conversion behavior changed shape (button now sits in a 4-item CTA column on a taller surface) — no measurement either way.
- **Biggest thing being missed:** the demo has no analytics on end-state interactions, so "richer end state" vs "diluted funnel" is unfalsifiable; if conversion matters, that's the gap.
- **If it breaks in 3 months:** a ch4 authored against these surfaces without re-reading the spec — the hero line, the 1-based vs 0-based day-anchor split (`ReelFolioView` vs `FolioArtifact`), and the both-views-set ambiguity are the three traps; the guard tests catch fixture drift but not these.
- **Did NOT do:** C9/A2/B6; paste/gap-fill confirmation; pages.test.ts fix; LLM_MODEL decision; cache-purge permission for the deploy token; merging the trailing docs commits.
- **How to check:** hero line — `grep -n "Mark & Julie" web/src/ReelFolioView.tsx`; both-views ambiguity — author a test screenplay setting clientview then folioview and watch the ended branch; live bundle freshness — `curl -s https://demo.voygent.ai/ | grep -o 'index-[^"]*\.js'` (expect `index-BU4XgwpU.js`); full-suite baseline — `npx vitest run` expect 1 failure at pages.test.ts:72; docs-ahead state — `git log origin/main..demo-design --oneline` (expect only docs commits).

## Remaining Work
Priority per Neil's earlier ordering: (1) **C9** — mid-chapter folio cutaway in ch1/ch2; design-light now that `s.client.folioView` + ReelFolioView scripted mode exist; keep honesty rules + spotlight anchors in mind, run the same review→browser-pass→deploy pipeline; (2) **A2** — mobile reel callout iteration (phone viewport, chrome-devtools/Playwright); (3) **B6** — fixture recapture. The verification harness lives at scratchpad `ch3-pass.mjs` pattern (Playwright via `/home/neil/dev/voygent-desktop/node_modules/playwright/index.mjs`; `CH3_BASE` env for live) — recreate from the coordinate closet if scratchpad is gone. Keep the workflow code-review before every merge; it caught real regressions in all three rounds today.

## Open Questions
- C9 shape: quick spotlight-style pop-up vs a short scripted `folioview` cutaway (beat-length)? Neil's call at design time.
- LLM_MODEL: pin public demo to Haiku for the cost story? (carried)
- Paste/gap-fill in curated demo still wanted? (carried)

## Coordinate Closet
- `764dec4` (main = origin/main = prod) · `cba4072` `1ee4879` (docs-only, demo-design ahead) · `46510fe` (C11a review-fix merge tip) · `9c49eea` (ReelExplore deletion) · `1b22782` (folio-session adapter) · `a4e7bc7` (ch3 merge tip) · `fdb664a` (C11b restyle)
- Workers: `a4c68e57-c502-4533-8bf9-8db24d67b9dd` (current, C11b) · `8a95bdcc-9368-44f0-bb66-e3f749943836` (C11a) · `590fe92a-6cd7-4654-9496-f8a3589192d2` (ch3) · `65a2d231` (A10, rollback floor)
- Live bundle: `assets/index-BU4XgwpU.js` · CSS `index-BPOMUX6x.css` (contains `96561d`)
- Reviews: `wf_f1fee23d` (ch3) · `wf_db37fd3e` (C11a) · `wf_9bf38a2e` (C11b)
- `/home/neil/dev/voygent-demo-demo-design` (worktree) · branch `demo-design` · main clone `/home/neil/dev/voygent-demo` (⚠️ carries another session's SESSION_LOG.md + digest WIP — leave alone)
- Deploy: `CLOUDFLARE_API_TOKEN` via `awk -F= '/^CLOUDFLARE_API_TOKEN=/ ...' /home/neil/dev/voygent-lite/.env` (demo repo has none; .env NOT shell-sourceable — unquoted spaces); token lacks cache-purge perms
- Playwright: `/home/neil/dev/voygent-desktop/node_modules/playwright/index.mjs` (absolute import; chrome-devtools MCP can't attach — Neil's Chrome has no debug port)
- Anchors: ReelFolioView `folio-hero/folio-days/folio-day-${n}` (1-based)/`folio-total/folio-note/folio-status/folio-includes/folio-hotel-choice/folio-addons` · FolioArtifact `folio-day-${i}` (0-BASED)/`folio-bookings/folio-send/trip-commission` — the two surfaces must never share a DOM
- Highlight `nth` is **1-based** (`web/src/lib/highlights.ts`)
- Spec: `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` (Decisions 1-6) · plans `docs/superpowers/plans/2026-07-08-ch3-client-folio-chapter.md` + `2026-07-08-reelexplore-retirement.md`
- Visual contract: `docs/reference/2026-07-08-alaska-warm-folio-staging.png` · alaska-warm literals: pine `#3d5245` · cream `#faf6ec`/`#f4efe4` · tan `#f1ebdd`/`#efe8d8` · line `#e0d8c7` · price `#96561d` (AA) · orange accent `#c77f3c`
- Prices (wire-truth): flights 3180 · Dean 168×7=1176 · activities 284 (ch3)/740 (ch1) · Kilmainham 116 · whiskey 190 · ch2 end total 4830 · ch1 end total 5216
- QA queue source of truth: `docs/summaries/pause-2026-07-08-neil-demo-qa.md` · A2 target `web/src/ReelCallout.tsx:22-81` · B6 target `worker/live/boards.ts:134-138` + `scripts/capture-fixtures.mjs`

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). Present the rebuilt checklist +
Remaining Work and ask whether to continue or do something else. Work in the
`/home/neil/dev/voygent-demo-demo-design` worktree (NOT the main clone — it carries
another session's WIP). C9 has a light design gate (pop-up vs scripted cutaway —
ask Neil) before building; A2/B6 are ungated. Run the workflow code-review before
every merge, and do NOT ff-merge the trailing docs-only commits until the next
code merge (SESSION_LOG checkout-conflict risk, see Git State).
