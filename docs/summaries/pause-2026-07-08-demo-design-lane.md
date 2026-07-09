# Session Handoff: Demo design lane — client-experience chapter, folio polish, remaining QA
**Date:** 2026-07-08 at 22:30
**Repo:** /home/neil/dev/voygent-demo
**Branch:** main
**Uncommitted changes:** yes (OTHER sessions' WIP only: SESSION_LOG.md + docs/digests/2026-06-11-issue-triage.md + untracked docs — do NOT commit or clean these)
**Transcript:** (current session — the rely.is→landing→reel-ch2→QA-batch session, voygent-lite main clone)

## What Was Accomplished
This session (spanning 07-07→07-08, driven from the voygent-lite main clone):
1. **rely.is evaluation** → `~/dev/voygent-lite/docs/evaluations/2026-07-07-rely-is.md`; idea #343 (setup pages, M3).
2. **Advisor landing SHIPPED PROD** — voygent.ai root = advisor arc (voygent-lite merge `1055977`, prod now `e0978f72` from `45577d1` after two copy fixes: assertive commission FAQ, family name → **Millers**). Consumer page preserved at `/travelers`. 17 voice-rule tests in `src/landing.test.ts`.
3. **Reel chapter 2 "Run the trip" SHIPPED** (`?reel=run`), merged with the showcase go-live after a brief deploy race (resolved; live has both).
4. **Neil QA batch 1 SHIPPED to demo.voygent.ai** (merge `ad93bf8`, 7 commits): Miller rename; live flight legs (prod `segments` → display legs via new `worker/agent/legs.ts`); structured promote-error surfacing (`worker/agent/loop.ts` hasJsonError + `tool-summary.ts` chip); PUBLIC hotel detail links on BOTH paths (board `boards.ts` + folio `folio-sync.ts` — credentialed `hotelSheetUrl` now unreachable client-side); cost display: subscription note + model attribution.
   ⚠️ At session end the Cloudflare edge still served the PREVIOUS index.html (`cf-cache-status: HIT`, cache rule ignores query strings). New bundle `assets/index-BT_t68ki.js` live at origin; old bundle still 200 (no breakage). Neil to purge (dashboard → Caching → Purge by URL `https://demo.voygent.ai/`) or wait for TTL.
5. **QA queue triaged with root causes**: `docs/summaries/pause-2026-07-08-neil-demo-qa.md` (the 12-finding doc; check items off there as they ship).

## Decisions Made (Neil, binding)
- **Keep "Run the trip" chapter as-is** ("the paste is impressive, keep it") — his earlier "drop paste/gap-fill" choice was made before he'd seen ch2 and is REVERSED.
- **Client-experience chapter is an ADDITION** (new chapter ~3): client's folio view, toggles with live price recalc, notes, **2-way updates between live client view and advisor folio (M7 lane, shipped in product 2026-07-06)**.
- Family name = **Miller** everywhere (landing + demo).
- Model attribution next to costs: approved (shipped in batch 1). Demo default model is `claude-haiku-4-5` (`worker/session-do.ts:67`) but the `LLM_MODEL` prod secret is SET (value unreadable, likely sonnet). If Neil wants the Haiku story: `npx wrangler secret put LLM_MODEL` → `claude-haiku-4-5` (his call).
- Better chapter discoverability: approved, not yet built (see Remaining Work).

## Files Created or Modified (this repo, all merged to main)
| File | Action | Why |
|------|--------|-----|
| worker/agent/legs.ts | create | shared segments→legs conversion for live path |
| worker/agent/loop.ts, worker/agent/tool-summary.ts | modify | surface {ok:false,error:{code}} envelopes |
| worker/agent/boards.ts, worker/agent/folio-sync.ts, web/src/FolioPanel.tsx | modify | public googleHotelUrl detail links both paths |
| web/src/Inspector.tsx, web/src/lib/inspector-drills.tsx | modify | subscription note + model attribution |
| web/src/recordings/dublin-run.screenplay.ts | modify | Henderson→Miller |
| docs/summaries/pause-2026-07-08-neil-demo-qa.md | create | the 12-finding QA queue (source of truth for this lane) |

## Git State
```
 M SESSION_LOG.md                      (other session's WIP — leave)
 M docs/digests/2026-06-11-issue-triage.md   (other session's WIP — leave)
?? docs/summaries/* + docs/superpowers/specs/2026-06-1[34]-cueframe-*  (other sessions' untracked — leave)
```
main = a41ae10, pushed. No worktrees owned by this lane (advisor-landing, reel-run, qa-fixes all pruned).

## Checklist
- [x] QA batch 1 (Miller, flight legs, promote errors, public links ×2, cost framing) — SHIPPED
- [x] Landing: Millers + assertive commission FAQ — SHIPPED PROD (voygent-lite)
- [ ] Edge cache purge for demo.voygent.ai index.html (Neil, dashboard) or confirm TTL rolled over
- [ ] A10: chapter discoverability — default no-param visitors to chapter 1 (`collab`) instead of localStorage round-robin (`registry.ts:70-83` selectReel), add chapter list to intro card (`ReelIntro.tsx:11-26`), add "Watch chapter 2 →" next-chapter CTA to end card (`ReelEndCard.tsx:15-27`)
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`ReelCallout.tsx:22-81`, scrollIntoView block:"start" + card placement from window.innerHeight); needs visual iteration on a phone viewport
- [ ] C10-ch3: NEW client-experience chapter (client folio view, toggles + live price, notes, 2-way client↔advisor folio updates) — design then screenplay (mirror dublin-run.screenplay.ts patterns; reel-targets.guard.test.ts guards anchors)
- [ ] C9: feature the folio in reels — pop up mid-chapter, END on the folio (end-card redesign interacts with A10's next-chapter CTA)
- [ ] C11: curated-demo folio must look like PRODUCTION folio (alaska-warm warm-editorial; demo's FolioArtifact in ClaudeChatView.tsx:97-250 + FolioPanel.tsx are hand-rolled and share nothing with voygent-lite/src/folio-renderer.ts) — "needs to impress"
- [ ] B6: Rome hotel fixture price mix (fixtures skew $758-818/night; per-night derived from marked-up clientPrice at boards.ts:134-138; recapture via scripts/capture-fixtures.mjs with a price spread)
- [ ] B4 remainder: sanity-check per-turn token counts behind the $.27 early-step cost; decide LLM_MODEL value (Neil)
- [ ] Paste/gap-fill demonstrated in CURATED demo (Neil chose this home for them before reversing on reels — confirm whether still wanted now that ch2 stays)
- [ ] voygent-lite #343 setup pages (separate lane, M3) + signup email covers ChatGPT too (follow-up from landing final review)

## Self-Critique
- **Least confident:** (1) the edge-cache behavior — I never SAW the new bundle served from demo.voygent.ai; (2) whether promote-error surfacing behaves well against every legitimate `ok:false` producer in live mode (reviewer adversarially checked the tree but not live traffic); (3) the demo folio's `quoteUrl` semantics after the folio-sync fix — the field now always carries a Google link even when trip data had none before; (4) C10-ch3's 2-way-updates beat must not overclaim — M7 shipped the folio-board→model hint server-side, but the DEMO's live client-view relay is its own simulation.
- **Biggest thing being missed:** the reels and the curated demo are drifting into two products with different data, styling, and honesty rules; the C-items (esp. C11) are a chance to unify folio rendering rather than hand-polish a third copy.
- **If it breaks in 3 months:** the fixture-vs-live split — every live-path fix this session (legs, error envelopes) existed because fixtures and live results have different shapes; next supplier change will silently break live mode again. A shape-contract test between replay fixtures and live tool outputs would catch it.
- **Did NOT do:** cache purge (no token permission); any mobile visual verification (no Chrome in env); B6 fixture recapture; all C-items; did not verify LLM_MODEL's actual value; did not run the curated demo end-to-end live (promote fix verified by tests only).
- **How to check:** cache — `curl -s https://demo.voygent.ai/ | grep -o 'index-[^.]*\.js'` should say `index-BT_t68ki.js`; promote — run a curated session, promote a hotel, expect friendly error or success, never a silent prose blob; quoteUrl — open folio after hotel promotion, link should be Google not crushhotels/cpmaxx; model — flip a live session and read the new attribution line in the Inspector cost drill.

## Remaining Work
Priority order for the fresh session: (1) verify cache rolled over; (2) A10 discoverability (small, mechanical, unblocks everything being seen); (3) C10-ch3 design → brainstorm beat sheet with Neil, then screenplay via the dublin-run pattern; (4) C9+C11 folio work (consider ONE lane: make FolioArtifact impress AND end reels on it); (5) A2 mobile scroll; (6) B6 fixtures. Use SDD with subagents; reviews caught real Criticals every round this session — keep the fable-tier final reviews.

## Open Questions
- LLM_MODEL: pin the public demo to Haiku for the cost story? (one wrangler command, Neil's call)
- C11 approach: restyle demo's FolioArtifact to mimic alaska-warm, or render/iframe an actual production folio (staging `preview_folio` output) inside the curated demo?
- Does the curated demo need paste/gap-fill now that ch2 stays in the reels?

## Coordinate Closet
- `a41ae10` (demo main tip, pushed)
- `ad93bf8` (qa-fixes merge) · `148fb80` `92a91ff` `836c115` `aae64f1` `9b0fb92` `9972024` `5823162` (batch commits)
- `assets/index-BT_t68ki.js` (new bundle) · `assets/index-CTWIeiCA.js` (stale cached)
- `e0978f72` (voygent-lite prod Version, Millers) · `45577d1` (its deploy SHA) · `1055977` (landing merge) · `17dc913e` (first advisor-landing prod Version) · `33c1e79` (its deploy SHA)
- `docs/summaries/pause-2026-07-08-neil-demo-qa.md` (QA queue, source of truth)
- `~/dev/voygent-lite/docs/superpowers/specs/2026-07-07-advisor-landing-demo-arc-design.md` (spec)
- `worker/session-do.ts:67` (DEFAULT_MODEL=claude-haiku-4-5) · `LLM_MODEL` (prod secret, set, value unknown)
- `registry.ts:70-83` (selectReel rotation) · `ReelIntro.tsx:11-26` · `ReelEndCard.tsx:15-27` · `ReelCallout.tsx:22-81`
- `boards.ts:134-138` (per-night from clientPrice) · `worker/fixtures/rome-amalfi.json` · `scripts/capture-fixtures.mjs`
- `ClaudeChatView.tsx:97-250` (FolioArtifact) · `~/dev/voygent-lite/src/folio-renderer.ts` + `folio-renderer/themes.ts` (alaska-warm)
- `5648cbc3` (voygent.ai zone id prefix; purge needs dashboard, token lacks perms)
- issue `#343` (voygent-lite setup pages, M3)
- `~/dev/voygent-demo/.superpowers/sdd/qa-fixes-report.md` + `qa-fixes-review.md` (batch evidence)

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). Present the rebuilt checklist +
Remaining Work and ask whether to continue or do something else. Design items
(C9/C10-ch3/C11) go through superpowers:brainstorming with Neil before any build.
Work in a worktree, never the main clone; leave the other sessions' dirty
SESSION_LOG.md / digest / untracked docs alone.
