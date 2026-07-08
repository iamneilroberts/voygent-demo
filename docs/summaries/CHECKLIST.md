# Demo design lane — checklist

_Updated: 2026-07-08 13:30 — demo-design_

Source handoffs: `pause-2026-07-08-ch3-client-folio.md` (newest) · `pause-2026-07-08-demo-design-lane.md` · QA queue: `pause-2026-07-08-neil-demo-qa.md`

- [x] QA batch 1 (Miller, flight legs, promote errors, public links ×2, cost framing) — SHIPPED
- [x] Landing: Millers + assertive commission FAQ — SHIPPED PROD (voygent-lite)
- [x] Edge cache — rolled over on its own, verified 2026-07-08; no purge needed
- [x] A10: chapter discoverability — SHIPPED LIVE 2026-07-08 (main `1afcd81`, Worker 65a2d231): default no-param → ch1, intro chapter list, next-chapter CTA on ReelExplore + ReelEndCard; ?reel= navigation pins mode=auto. NOTE: ch1 AND ch2 both end on ReelExplore (not ReelEndCard — prior handoff's assumption corrected)
- [x] C10-ch3 design: brainstormed with Neil, spec COMMITTED `38154af` — `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` (client POV / fresh pre-trip slice / new ReelFolioView alaska-warm surface; id `client`, ch3, run.next="client")
- [x] Neil reviewed ch3 spec 2026-07-08 (edits: self-serve add-on positioning `011340a`; Decision 4 one-surface-two-modes + Decision 5 scroll fallback `f3ff77c`)
- [x] Ch3 plan written (`docs/superpowers/plans/2026-07-08-ch3-client-folio-chapter.md`, `ea27235`) and IMPLEMENTED on demo-design (tasks 1-8: visual contract `bb5878a`, types `d9978ee`, plumbing `cab5c64`, screenplay `aa36478`, ReelFolioView `cf0dc5a`, registry `789edb7`, App wiring `99723dd`, beat-4 visibility fix `d2f5e83`); browser pass 16/16
- [x] Ch3 SHIPPED LIVE 2026-07-08: review gate wf_f1fee23d (5 findings → 4 fixed `a4e7bc7`, 1 declined YAGNI); main ff to `a4e7bc7`, pushed; Worker Version `590fe92a`; live bundle `index-JAD2xy6t.js`; live smoke 16/16 (default intro 3 chapters, ch3 plays→ends on interactive folio, ch2 end offers ch3, mobile full-bleed)
- [x] C11 REDEFINED (spec Decision 6, Neil 2026-07-08): literal FolioArtifact→ReelFolioView swap retracted (FolioArtifact is the advisor-view chat folio: commission/bookings/edits/threads + ch1/ch2 anchors). Split: (a) ReelExplore retirement, (b) FolioArtifact alaska-warm restyle.
- [x] C11a: ReelExplore retirement — SHIPPED LIVE 2026-07-08 (main ff to `46510fe`, Worker `8a95bdcc`, bundle `index-D3SNzA4Q.js`, live smoke 25/25). Review wf_db37fd3e: all 5 findings fixed (disclosure restored, first-hotel fallback, day-hint copy scoped, 2 latent invariants pinned by end-state.guard.test.ts). ch1/ch2 now end on ReelFolioView interactive (hotel chooser, extras, send funnel); ReelExplore + cl-explore CSS deleted.
- [x] C11b: FolioArtifact alaska-warm restyle — SHIPPED 2026-07-08 (main ff to `764dec4`, Worker `a4c68e57`, bundle `index-BU4XgwpU.js`). CSS-only (`fdb664a` + AA contrast fix `764dec4` — price #96561d ≥4.5:1 on both card/day bgs, review wf_9bf38a2e). Anchors/markup untouched; 25/25 pass. NOTE: bare `/` html was an edge-cache HIT at ship time (new bundle confirmed via cache-buster; token lacks purge perms — rolls over on its own, same as A10 day).
- [ ] C9: feature the folio in ch1/ch2 (mid-chapter pop-up) — separate item; ch3 ends on the folio by construction
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`ReelCallout.tsx:22-81`); needs visual iteration on a phone viewport
- [ ] B6: Rome hotel fixture price mix — recapture via `scripts/capture-fixtures.mjs` with a price spread
- [ ] B4 remainder: sanity-check per-turn token counts behind $.27 early-step cost; decide LLM_MODEL value (Neil)
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted now that ch2 stays in reels
- [ ] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — small fix lane, not this diff
- [ ] voygent-lite #343 setup pages (separate lane, M3) + signup email covers ChatGPT too
