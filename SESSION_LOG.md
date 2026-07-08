## 2026-07-08 — Ch3 client-folio chapter + C11 complete (three prod ships)

Shipped reel chapter 3 "Their trip, their window" (client-POV folio window; new mode-aware `ReelFolioView`, `folioview` interaction plumbing, `dublin-client` screenplay; Worker `590fe92a`), then redefined C11 with Neil (spec Decision 6 — FolioArtifact is the advisor surface, not a folio copy) and completed both halves: C11a ReelExplore retirement (ch1/ch2 now end on ReelFolioView interactive via `folioSessionFromClient`; Worker `8a95bdcc`) and C11b FolioArtifact alaska-warm restyle (CSS-only, WCAG-AA price color; Worker `a4c68e57`). Three code-review gates (17 findings addressed, 1 declined YAGNI), 25/25 live browser pass, full suite 590/591 (one pre-existing failure).

Main artifact: voygent-demo main `764dec4` · spec `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` · live at https://demo.voygent.ai/?reel=client&mode=auto

## 2026-06-16 — Showcase go-live + docs refresh + cueframe

Took the public "Follow the build" showcase live (real Overview/Architecture/Milestones copy + 12-entry build log, `SHOWCASE_ENABLED=1`, deployed to demo.voygent.ai; comment→moderation loop smoke-verified — held-for-review + honeypot drop, no /info or /blog regression), documented the June features + cueframe on `/info/production-system` (+v2), and added a `/blog` → `/showcase` nav link. Also ran the voygent-hype full refresh and brought the system docs current (`features.md`, voygent-lite `docs/FEATURES.md` + `README.md`).

Main artifact: PR https://github.com/iamneilroberts/voygent-demo/pull/9 · live at https://demo.voygent.ai/showcase

## 2026-06-10 — cpmaxx hotels wired + Inspector rail & surface polish

Wired credentialed cpmaxx hotels into the live demo (client-price/commission/photo/quote-sheet, folio synth, price-sanity filter), then brainstormed + spec'd + shipped a demo surface polish: Phase A price fixes (client-price headline + all-inclusive/traveler context, honest ladder, per-person flights), Phase B self-describing tool chips, Phase C skinny live Inspector rail (idle/peek/open, never auto-expands; extensible stat registry drives rail + stat-tied deep-dive links). 18 commits, all deployed to demo.voygent.ai (prod bundle `index-D4HAjykg.js`), 421 tests green.

Main artifact: commit 27e4ff0 (HEAD) · handoff: `docs/summaries/handoff-2026-06-10-inspector-polish.md` · spec/plan under `docs/superpowers/`

## 2026-06-10 — Reel R5 + live-demo orchestration overhaul

Built reel R5 (full collab screenplay + interactive end-state, badges, commission callout, engineering peek) then pivoted to the live demo: diagnosed that the public demo was globally FAITHFUL (every trip ran live, unorchestrated), made faithful default-off / opt-in via `?faithful=1`, hid `manage_trip_goal` so featured trips stay on the replayed+stepped board flow, added a live/sample honesty tag, and shipped a string of mobile + feedback fixes. 29 commits, all deployed to demo.voygent.ai (prod bundle `index-C4FvCoZY.js`), 403 tests green throughout.

Main artifact: commit 7ab0507 (HEAD) · handoffs: `docs/summaries/handoff-2026-06-10-live-board-polish.md` + `docs/summaries/handoff-2026-06-10-auth-redesign.md`
