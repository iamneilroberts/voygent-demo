# Pause — reel system improvements (follow-on to the DIY free-tier reels)

_Written 2026-07-10 after the DIY reels shipped to prod. Branch context: `main` = origin/main = prod (merge `4235d30`, live bundle `index-CoQyx3zN.js`)._

## What just shipped (context, not work)

Two DIY traveller-only reels are LIVE: `?reel=ireland` (week in Ireland for two, $228 date-shift save, mixed-source boards, free walking tour, folio total $2,485) and `?reel=cruise` (family of 4, 7-night Caribbean, $284 connecting-cabin save, folio total $3,755). Plumbing that came with them: board kinds `car`/`cruise`, `BoardCandidate.source` attribution chip, configurable `ReelFolioView`/`ReelClientView` copy (`audienceLine`/`sceneLabel`/`totalLabel`/`helperLine`), `ReelEntry.showSend`, `s.agent.source()`. Suite: 659 tests green. Neil has NOT yet browser-smoked either reel.

## The remaining work

Execute `docs/superpowers/plans/2026-07-10-reel-system-improvements.md` (committed on main). Six TDD tasks with complete code in each step:

1. **Task 1** — shared duration estimator lib (`web/src/lib/reel-duration.ts`), registry derives all `durationLabel`s (ceil minutes), both DIY screenplay tests de-duplicate onto it (bounds drop to 130k–230k ms).
2. **Task 2** — `ReelEntry.actorLabels` overrides threaded App → ClaudeChatView → BoardView; DIY reels get `{ client: "You" }` so picks read "✓ You chose this".
3. **Task 3** — `ReelComponent` fixed line items in `TripPricing`/`ReelFolioSession` + "In this trip" section in `ReelFolioView`; migrate the cruise fare + 2 excursions out of "Optional extras" (wifi addon stays, it is the total-pop beat; total stays $3,755).
4. **Task 4** — `ReelEntry.honestyChip` rendered in the playback rail; set on both DIY reels.
5. **Task 5** — move the 3 advisor chapters' intro/endCard/recap copy from `registry.ts` into `meta` exports in their screenplay files. Was HOLD pending the advisor-fix session; that session is DONE and merged, so this is now UNBLOCKED — but copy the strings from the registry AS IT IS at execution time, verbatim.
6. **Task 6** — OPTIONAL, needs Neil's explicit yes: "Planning it yourself?" row on the intro card listing the DIY reels (`audience: "traveller"` field). Do not build without his sign-off.

## Instructions

1. Resume in the existing worktree `/home/neil/dev/voygent-demo-diy-free-reels` (branch `diy-free-reels`, already pushed). First: `git merge origin/main` there (main has the merge commit + possibly newer work) and confirm 659 tests green before starting.
2. Follow the plan file task-by-task (it is self-contained; superpowers:subagent-driven-development recommended — one sonnet subagent per task per the repo's delegation rules, review diffs between tasks).
3. Tasks 1–5 are all unblocked. Ask Neil about Task 6 before touching it.
4. After tasks complete: full suite + `npx tsc --noEmit` + `VITE_API_BASE="" npm run build:web`, merge to main, deploy (`npx wrangler deploy` from the main clone), verify the served bundle hash changed (cache-bust: `curl -s "https://demo.voygent.ai/?cb=$(date +%s)" | grep -o 'index-[^"]*\.js'`).
5. Heartbeat `/branch update` on state changes; the journal entry for `diy-free-reels` is Active in `~/.claude/coordination/voygent-demo/journal.md`.

## Checklist

- [ ] Task 1: duration estimator lib + derived labels
- [ ] Task 2: actorLabels overrides ("✓ You chose this")
- [ ] Task 3: ReelComponent line items + cruise fare migration
- [ ] Task 4: honesty chip on DIY reels
- [ ] Task 5: chapter copy → screenplay meta exports (unblocked)
- [ ] Task 6: DIY discoverability row — ASK NEIL FIRST
- [ ] Merge + deploy + verify served bundle
- [ ] Neil browser smoke: ?reel=ireland and ?reel=cruise (still pending from the ship)

## Open items riding along

- Ireland car board attribution says "via Travelpayouts"; once a real car source is picked (Economybookings / QEEQ / Discover Cars — see the 2026-07-10 session's research), swap the `source` strings in `ireland-diy.screenplay.ts` (minutes of work).
- wise-travel.com API lands today per Neil; when integrated in voygent-lite, no demo change needed (attribution already matches).
- Advisor chapters could adopt `honestyChip` after Task 5 (one line per entry).

## Coordinate closet (verbatim ids)

- Worktree: `/home/neil/dev/voygent-demo-diy-free-reels`, branch `diy-free-reels`
- Plan: `docs/superpowers/plans/2026-07-10-reel-system-improvements.md`
- Commits: plumbing `feccbf5`, reels `35439e1`, plan `e1a5650`, merge to main `4235d30`
- Live bundle: `index-CoQyx3zN.js`; baseline suite 659 tests / 86 files
- Reel URLs (access-gated): `https://demo.voygent.ai/?reel=ireland` / `?reel=cruise` (`#code=` in repo `.env` `DEMO_ACCESS_CODE`)
