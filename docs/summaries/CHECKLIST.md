# Demo design lane — checklist

_Updated: 2026-07-08 11:48 — demo-design_

Source handoffs: `pause-2026-07-08-ch3-client-folio.md` (newest) · `pause-2026-07-08-demo-design-lane.md` · QA queue: `pause-2026-07-08-neil-demo-qa.md`

- [x] QA batch 1 (Miller, flight legs, promote errors, public links ×2, cost framing) — SHIPPED
- [x] Landing: Millers + assertive commission FAQ — SHIPPED PROD (voygent-lite)
- [x] Edge cache — rolled over on its own, verified 2026-07-08; no purge needed
- [x] A10: chapter discoverability — SHIPPED LIVE 2026-07-08 (main `1afcd81`, Worker 65a2d231): default no-param → ch1, intro chapter list, next-chapter CTA on ReelExplore + ReelEndCard; ?reel= navigation pins mode=auto. NOTE: ch1 AND ch2 both end on ReelExplore (not ReelEndCard — prior handoff's assumption corrected)
- [x] C10-ch3 design: brainstormed with Neil, spec COMMITTED `38154af` — `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` (client POV / fresh pre-trip slice / new ReelFolioView alaska-warm surface; id `client`, ch3, run.next="client")
- [ ] Neil reviews ch3 spec → superpowers:writing-plans → implement ch3 (staging alaska-warm screenshot FIRST as visual contract)
- [ ] C11: swap curated demo's FolioArtifact (`ClaudeChatView.tsx:97-250`) to ReelFolioView — follow-up AFTER ch3 ships (decided in ch3 spec)
- [ ] C9: feature the folio in ch1/ch2 (mid-chapter pop-up) — separate item; ch3 ends on the folio by construction
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`ReelCallout.tsx:22-81`); needs visual iteration on a phone viewport
- [ ] B6: Rome hotel fixture price mix — recapture via `scripts/capture-fixtures.mjs` with a price spread
- [ ] B4 remainder: sanity-check per-turn token counts behind $.27 early-step cost; decide LLM_MODEL value (Neil)
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted now that ch2 stays in reels
- [ ] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — small fix lane, not this diff
- [ ] voygent-lite #343 setup pages (separate lane, M3) + signup email covers ChatGPT too
