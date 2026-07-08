# Demo design lane — checklist

_Updated: 2026-07-08 16:45 — demo-design_

Source handoffs: `pause-2026-07-08-c9-a2-b6-lane.md` (newest) · `pause-2026-07-08-ch3-client-folio.md` · QA queue: `pause-2026-07-08-neil-demo-qa.md`

- [x] Ch3 "Their trip, their window" SHIPPED (Worker 590fe92a) · C11a ReelExplore retirement SHIPPED (8a95bdcc) · C11b FolioArtifact restyle SHIPPED (a4c68e57) — C11 COMPLETE
- [x] C9 SHIPPED (Worker f56e126d, bundle index-DWPCIHrc.js): scripted folioview cutaways in ch1 (post-send: hero + shortlist-as-choice, $3,920) and ch2 (post-Wicklow-pick: day 6 current, $4,640); spec Decision 7 (Neil: cutaway). + z-index fix `56eaadf`: callouts/spot ring/pause were UNDER .cl-fv-scrim on every folio surface incl. shipped ch3 — overlay 65, controls 66. 2 review rounds (wf_7868a755 · wf_43a466bc clean), 24/24 live pass + ch3 regression 4/4. main = origin/main = prod = `56eaadf`
- [x] Trailing docs-only commits merged with the C9 code merge; main-clone SESSION_LOG WIP preserved via stash/pop (0 conflict markers, other session's entries intact as uncommitted WIP)
- [ ] A2: mobile reel scroll — callout geometry vs target compete for the fold (`web/src/ReelCallout.tsx:22-81`); phone-viewport visual iteration
- [ ] B6: Rome hotel fixture price mix — recapture via `scripts/capture-fixtures.mjs` with a price spread
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted
- [ ] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — small separate fix lane
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] voygent-lite #343 setup pages (separate lane, M3)
