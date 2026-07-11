## 2026-07-11 — Mobile reel overhaul + Pocket Guide + signup deep-link

Long live-QA session driven by Neil's phone screenshots. Signup CTAs deep-link to the #get field (demo `2abe071`; voygent-lite landing auto-focus `47ad8d7a` on origin/main). Then a full mobile-reel pass (mockup-first loop at demo.voygent.ai/mockups/mobile-zoom-header + reel-folio): header now flows instead of overlapping under text zoom, compact single-row transport, callout sits above the nav, chapters collapse during playback, disclaimer shows-then-collapses, folio pops on change/callout instead of an always-on strip (behavior B). Added the Pocket Guide to both DIY reels — first a tool-chip beat, then a real phone-styled `ReelPocketGuide` overlay (new interaction kind across recording/interaction/screenplay/highlights/pacing + component + CSS). Fixed car-rental price on the folio and clarified the finale "live total" copy. All shipped to prod, typecheck + 668 tests green, each deploy bundle-verified live. Also committed/cherry-picked another session's stranded docs WIP to voygent-lite origin/main (`4d742d57`).

Main artifact: demo main `2abe071..e2580de`, live bundle `index-BKaJ-vb-.js` (demo.voygent.ai)

## 2026-07-10 — DIY reel improvements + live-QA batch: 4 prod ships

Executed the reel-improvements plan (tasks 1–5 + Neil-approved Task 6) via SDD subagents, then folded in Neil's live-smoke feedback across three follow-up ships: intro/end-card CTAs + DIY-aware lists, per-audience signup URL (voygent.ai/travelers), honest hotel sources (wise-travel.com does NOT do hotels → Booking.com/Expedia/LiteAPI), folio Book affordance + in-folio signup CTA, cruise dead-air trim, callout copy clarity pass, kids-club claim backed by card data. 14 commits, all curator-verified live.

Main artifact: main `071ff71..e3ae785`, live bundle `index-0qiNjiuC.js` (demo.voygent.ai)

## 2026-07-10 — Reel share-fixes: QA persona sweep → 6 fixes shipped prod

QA-persona (sonnet, real browser) swept all 3 reel chapters + interactive mode, then fixed and shipped: live-mode flight/hotel boards (worker now hydrates voygent-lite's `__voygentBoardRef` MCP-app ref via `board_data` — boards never rendered before, model pointed at a phantom panel), inspector idle-rail expand (dead for the whole reel), ■ Stop control + free-trial CTA card, `?reel=` beats persisted live mode, header/nav overlap, and ch1's twice-reproduced 14s dead-air stall (folio re-renders now re-trigger reel follow-scroll). Every fix verified by the persona on a local build pre-deploy; post-deploy prod probe captured a real `board` event (5 cpmaxx flight candidates). Backend past-dates flaw found en route filed as voygent-lite#379. Curator-verified at close (all claims VERIFIED; board event evidenced by captured stream).

Main artifact: main f3f3811 (6 commits, ff from 7b552a6) · Worker 6eceae4a · bundle index-CejVkCzL.js

## 2026-07-10 — Free-tier persona probes ×2 (dirty-free + Tier-1 re-probe) + fix-lane handoff

Ran two 4-persona probe waves against staging with freshly minted free users (all subagent-driven, curl JSON-RPC): (1) the "dirty free" build (free-rollout@1efd2504) → docs/audits/2026-07-09-free-dirty/ — headline FB1: 0/4 personas reach a shareable deliverable, prompting steers free users into pro-only preview_folio_board; (2) after the Tier-1 merge (PR #377, ddc043e1) → docs/qa/2026-07-10-tier1-persona-report.md — h4h5 pick-persistence fixes confirmed live, but send_feedback is invisible on free (missing TOOL_BUCKETS entry, filed #378), Viator needed a staging secret (set from .env, now working), and GYG/TBL excursion geography remains the demo-story risk. Wrote + updated the fix-lane handoff (pause-2026-07-10-free-dirty-fixes.md) with Neil's list_render free-preview decision as the working plan. Both waves torn down (users/trips deleted, verified), staging left on main resting state, curator close-out 9/9 VERIFIED.

Main artifact: voygent-lite `c53f678f` (audit) + `677f22b7` (tier1 report) · issue voygent-lite#378 · handoff docs/summaries/pause-2026-07-10-free-dirty-fixes.md

## 2026-07-09 — Reel QA4 restructure shipped + voygent-lite free-surface supplier scrub

Rebuilt the demo reel into the plan/client/advisor arc (Read-default sticky speed, unified nav cluster, eng telemetry, scroll fixes) and root-caused the Chrome permission popup (bundle built without VITE_API_BASE baked localhost:8787; fallback now DEV-only) — merged, deployed, live-verified. Then fixed Neil's CPMaxx report in voygent-lite: tier-scoped router/profile/introspection docs so free (and pro) tools/list never names an over-tier supplier, with a whole-surface leak guard in the pre-deploy security gate; deployed twice, free surface live-verified clean (curator: 7/7 claims VERIFIED). Also converted ~/Downloads/Voygent_Tool_Catalog_by_Access_Class.docx (was Markdown mislabeled) to real docx.

Main artifact: voygent-demo main `41d1d27` (bundle index-DM1JJtAW.js live) · voygent-lite PRs #365 + #367 (prod f0c7c071 from `48f92dba`)

## 2026-07-08 — Ch3 client-folio chapter + C11 complete (three prod ships)

Shipped reel chapter 3 "Their trip, their window" (client-POV folio window; new mode-aware `ReelFolioView`, `folioview` interaction plumbing, `dublin-client` screenplay; Worker `590fe92a`), then redefined C11 with Neil (spec Decision 6 — FolioArtifact is the advisor surface, not a folio copy) and completed both halves: C11a ReelExplore retirement (ch1/ch2 now end on ReelFolioView interactive via `folioSessionFromClient`; Worker `8a95bdcc`) and C11b FolioArtifact alaska-warm restyle (CSS-only, WCAG-AA price color; Worker `a4c68e57`). Three code-review gates (17 findings addressed, 1 declined YAGNI), 25/25 live browser pass, full suite 590/591 (one pre-existing failure).

Main artifact: voygent-demo main `764dec4` · spec `docs/superpowers/specs/2026-07-08-ch3-client-experience-design.md` · live at https://demo.voygent.ai/?reel=client&mode=auto

## 2026-06-16 — Showcase go-live + docs refresh + cueframe

Took the public "Follow the build" showcase live (real Overview/Architecture/Milestones copy + 12-entry build log, `SHOWCASE_ENABLED=1`, deployed to demo.voygent.ai; comment→moderation loop smoke-verified — held-for-review + honeypot drop, no /info or /blog regression), documented the June features + cueframe on `/info/production-system` (+v2), and added a `/blog` → `/showcase` nav link. Also ran the voygent-hype full refresh and brought the system docs current (`features.md`, voygent-lite `docs/FEATURES.md` + `README.md`).

Main artifact: PR https://github.com/iamneilroberts/voygent-demo/pull/9 · live at https://demo.voygent.ai/showcase
## 2026-06-18 — Backplanes Spotlight redaction/security evaluation

Tested Backplanes Spotlight v2.3.0 (Claude-Code session-reporting tool) in an isolated, canary-swapped `voygent-demo` session: planted synthetic secrets+PII, captured the exact gRPC upload payload (keylog failed on the tonic path → reconstructed via `strace` of the daemon's `.upload-tmp` staging file), and audited redaction + report quality. Key finding: client-side redaction is **email-only** — phone, SSN, and credit-card left the laptop in cleartext, contradicting "strips PII before anything leaves your laptop"; report also over-claims "no credential leaks" and applies a misleading PR/CI framing. Verdict: do-not-adopt on secret/PII repos. Wrote a calibrated responsible-disclosure report + email. Full teardown done (CLI uninstalled, canaries removed, real secrets restored). Loose ends for Neil: delete the uploaded session server-side; send the disclosure email.

Main artifact: docs/summaries/backplanes-disclosure-report-2026-06-18.md (+ test plan: docs/summaries/backplanes-redaction-test-plan.md; evidence: ~/backplanes-test-backup/)

## 2026-06-16 — Public showcase page + moderated comments (shipped dark)

Built a public "follow the build" showcase page (`GET /showcase`) + self-hosted, no-login, moderated comment system on demo.voygent.ai, via spec→codex-review→plan→subagent-driven TDD (each task two-stage reviewed) + final whole-feature review. Shipped DARK: migration applied to prod D1, `COMMENT_IP_SALT` set, deployed with `SHOWCASE_ENABLED` unset (routes verified inert/404, `/blog` 200 no regression). Security: escape-at-every-sink, HMAC-only IP pseudonymity, fail-closed 503, CSRF-guarded moderation behind adminAuthed, strict `script-src 'none'` CSP. 537 tests/typecheck clean in the build worktree.

Main artifact: PR #8 (merge commit ec1f2f7) · module worker/showcase/ · plan docs/superpowers/plans/2026-06-16-public-showcase-comments.md

## 2026-06-10 — cpmaxx hotels wired + Inspector rail & surface polish

Wired credentialed cpmaxx hotels into the live demo (client-price/commission/photo/quote-sheet, folio synth, price-sanity filter), then brainstormed + spec'd + shipped a demo surface polish: Phase A price fixes (client-price headline + all-inclusive/traveler context, honest ladder, per-person flights), Phase B self-describing tool chips, Phase C skinny live Inspector rail (idle/peek/open, never auto-expands; extensible stat registry drives rail + stat-tied deep-dive links). 18 commits, all deployed to demo.voygent.ai (prod bundle `index-D4HAjykg.js`), 421 tests green.

Main artifact: commit 27e4ff0 (HEAD) · handoff: `docs/summaries/handoff-2026-06-10-inspector-polish.md` · spec/plan under `docs/superpowers/`

## 2026-06-10 — Reel R5 + live-demo orchestration overhaul

Built reel R5 (full collab screenplay + interactive end-state, badges, commission callout, engineering peek) then pivoted to the live demo: diagnosed that the public demo was globally FAITHFUL (every trip ran live, unorchestrated), made faithful default-off / opt-in via `?faithful=1`, hid `manage_trip_goal` so featured trips stay on the replayed+stepped board flow, added a live/sample honesty tag, and shipped a string of mobile + feedback fixes. 29 commits, all deployed to demo.voygent.ai (prod bundle `index-C4FvCoZY.js`), 403 tests green throughout.

Main artifact: commit 7ab0507 (HEAD) · handoffs: `docs/summaries/handoff-2026-06-10-live-board-polish.md` + `docs/summaries/handoff-2026-06-10-auth-redesign.md`
