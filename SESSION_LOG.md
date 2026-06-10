## 2026-06-10 — Reel R5 + live-demo orchestration overhaul

Built reel R5 (full collab screenplay + interactive end-state, badges, commission callout, engineering peek) then pivoted to the live demo: diagnosed that the public demo was globally FAITHFUL (every trip ran live, unorchestrated), made faithful default-off / opt-in via `?faithful=1`, hid `manage_trip_goal` so featured trips stay on the replayed+stepped board flow, added a live/sample honesty tag, and shipped a string of mobile + feedback fixes. 29 commits, all deployed to demo.voygent.ai (prod bundle `index-C4FvCoZY.js`), 403 tests green throughout.

Main artifact: commit 7ab0507 (HEAD) · handoffs: `docs/summaries/handoff-2026-06-10-live-board-polish.md` + `docs/summaries/handoff-2026-06-10-auth-redesign.md`
