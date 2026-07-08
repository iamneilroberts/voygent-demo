# Demo design lane — checklist

_Updated: 2026-07-08 15:45 — demo-design_

Source handoffs: `pause-2026-07-08-c9-a2-b6-lane.md` (newest) · `pause-2026-07-08-ch3-client-folio.md` · QA queue: `pause-2026-07-08-neil-demo-qa.md`

- [x] Ch3 "Their trip, their window" SHIPPED (Worker 590fe92a) · C11a ReelExplore retirement SHIPPED (8a95bdcc) · C11b FolioArtifact restyle SHIPPED (a4c68e57) — C11 COMPLETE; main = origin/main = prod = `764dec4`
- [ ] C9: feature the folio in ch1/ch2 (mid-chapter pop-up or scripted folioview cutaway — Neil's call); cheap now that the verb + surface exist
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`web/src/ReelCallout.tsx:22-81`); phone-viewport visual iteration
- [ ] B6: Rome hotel fixture price mix — recapture via `scripts/capture-fixtures.mjs` with a price spread
- [ ] Merge trailing docs-only commits (1ee4879, cba4072, handoff) with the NEXT code merge — do NOT ff now (main-clone SESSION_LOG.md carries another session's WIP → checkout conflict)
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted
- [ ] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — small separate fix lane
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] voygent-lite #343 setup pages (separate lane, M3)
