# Demo design lane — checklist

_Updated: 2026-07-09 23:15 — main_ (QA4 restructure **SHIPPED**: merged to main `41d1d27`, pushed, deployed — live bundle `index-DM1JJtAW.js` verified served; demo-design worktree + branch pruned, local and origin)

## QA4 (Neil 2026-07-09, 17-item batch) — spec `docs/superpowers/specs/2026-07-09-reel-restructure-qa4.md`
- [x] Chapter restructure: 1 `plan` (advisor-only + gap-fill tours + projected commission + Neil's handoff end card) · 2 `client` (invite email → folio w/ pinned advisor note, hotel flips reprice live, tour drill-down, one-click send-back) · 3 `advisor` (inbound reply notification, feedback incorporated, messy confirmation email → paste → ticketed corrections, booked commission $280). Legacy ids collab/run alias in pickReel.
- [x] Playback: Read mode default at 1x, sticky via localStorage `voygent-reel-speed`; pacing rebalance (slower text/board/folio, faster tool beats); reel tool chips stop the wall-clock "Working… 163s" counter
- [x] Nav: transport + breadcrumb unified top-right (`.cl-reel-nav`, "3 short demos"), persists playing+ended; orientation hero callout on ch1 frame 0; plain-language titles
- [x] Chrome permission popup ROOT-CAUSED: live bundle built without VITE_API_BASE baked `http://localhost:8787` → Local Network Access prompt + broken live mode. API_BASE localhost fallback now DEV-only; prod builds can never leak it. (Fix reaches users on next deploy.)
- [x] Eng peek: representative telemetry (model/tokens/cache/cost) + "representative" tag; callout ring re-measures through entrance animations
- [x] Scroll/static fixes: selected multi-select boards unpin follow-scroll (folio below fold), missing-target callouts dim light (no gray wall), ch1 commission callout was bound to the wrong folio frame (fixed + binding guards)
- [x] End cards: interstitials on all chapters, big Build-your-own CTA at arc end
- [x] DEPLOYED to demo.voygent.ai 2026-07-09 (wrangler re-login by Neil; bundle `index-DM1JJtAW.js` live, `/` `/blog` `/stats` 200, no localhost in bundle)
- [x] Merged demo-design → main (`41d1d27`), pushed; worktree + branch pruned (local + origin)
- [ ] **Neil smokes all 3 chapters in a fresh browser profile**: no permission popup, Read-mode default + orientation callout, speed choice sticky into ch2, ch2 invite-email + advisor-note + hotel-flip repricing, ch3 inbound reply + messy-email paste + itemized commission, big final CTA

## Carried over
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted (gap-fill now demoed in reel ch1)
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] voygent-lite #343 setup pages (separate lane, M3)

Source handoffs: `pause-2026-07-08-c9-a2-b6-lane.md` (newest) · `pause-2026-07-08-ch3-client-folio.md` · QA queue: `pause-2026-07-08-neil-demo-qa.md`

- [x] Ch3 "Their trip, their window" SHIPPED (Worker 590fe92a) · C11a ReelExplore retirement SHIPPED (8a95bdcc) · C11b FolioArtifact restyle SHIPPED (a4c68e57) — C11 COMPLETE
- [x] C9 SHIPPED (Worker f56e126d, bundle index-DWPCIHrc.js): scripted folioview cutaways in ch1 (post-send: hero + shortlist-as-choice, $3,920) and ch2 (post-Wicklow-pick: day 6 current, $4,640); spec Decision 7 (Neil: cutaway). + z-index fix `56eaadf`: callouts/spot ring/pause were UNDER .cl-fv-scrim on every folio surface incl. shipped ch3 — overlay 65, controls 66. 2 review rounds (wf_7868a755 · wf_43a466bc clean), 24/24 live pass + ch3 regression 4/4. main = origin/main = prod = `56eaadf`
- [x] Trailing docs-only commits merged with the C9 code merge; main-clone SESSION_LOG WIP preserved via stash/pop (0 conflict markers, other session's entries intact as uncommitted WIP)
- [x] A2 DONE: mobile follow-scroll + callout re-scroll (068cf26) + review-round redesign (scroll-intent mark/consume, hold-vs-paused callout props, audit-script portability); all 3 chapters PASS `scripts/reel-scroll-audit.mjs`
- [x] N1: "Send to Voygent →" → "Send to your advisor →" (client folio CTA)
- [x] N2: "Read" speed control — 1× playback, every callout holds for Continue (recovery scroll stays live via the separate `hold` prop)
- [x] N3: callout body contrast → ink-2
- [x] N4: "chose this" mark on its own line INSIDE the card (wrap scoped to picked cards; unpicked desktop cards stay single-line)
- [x] N5: tour drill-down — ch3 beat 3 scripted (link → tour page → CTA scroll → add → 4640→4756) + live on interactive end-states; add-ons carry optional detail content
- [x] N6: onboarding placeholder → "Any questions or comments? (optional)"
- [x] B6: Rome hotel fixture price mix DONE — capture now band-picks 3 budget / 3 mid / 2 upscale (3★+) from a price-sorted pool; Rome recaptured $378–$1,486/night
- [x] N7-N18 (QA rounds 2+3, 2026-07-08 late): edit-marker text, post-callout pacing, cutaway hero + section flips, callout copy ×4 plain-language, derived ready-state, itemized commission section, margin chapter rail + autoplay + breadcrumb, client-scene inbox backdrop + label — commit b4c09aa
- [ ] N18 asset: Neil generates inbox-blur image (prompt provided) → drop at web/public/scenes/inbox-blur.jpg → redeploy
- [ ] Paste/gap-fill in CURATED demo — confirm with Neil whether still wanted
- [x] Pre-existing main test failure: `worker/info/pages.test.ts:72` em-dash voice rule — FIXED on main (`b48a3c4`); re-verified 17/17 green 2026-07-09 (sweep SW-D4)
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
- [ ] voygent-lite #343 setup pages (separate lane, M3)
