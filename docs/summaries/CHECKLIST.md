# Reel system improvements — checklist (diy-free-reels worktree)

_Updated: 2026-07-10 — diy-free-reels_ (previous demo-design-lane checklist superseded; its two open carry-overs moved to the bottom)

Plan: `docs/superpowers/plans/2026-07-10-reel-system-improvements.md` · handoff `pause-2026-07-10-reel-improvements.md` · SDD ledger `.superpowers/sdd/progress.md`

- [x] Task 1: duration estimator lib + derived labels (`1201486`)
- [x] Task 2: actorLabels overrides "✓ You chose this" (`e204e3b`)
- [x] Task 3: ReelComponent line items + cruise fare migration (`4ba73ad`)
- [x] Task 4: honesty chip on DIY reels (`61b7df3`)
- [x] Task 5: chapter copy → screenplay meta exports (`9091609`)
- [x] Task 6 (Neil APPROVED): DIY discoverability on intro card (`70b96fe`, with Task 7)
- [x] Task 7 (Neil live QA): split note line, DIY-aware chapter lists, free-signup CTAs intro+end card (`70b96fe` + fixes `ebc5abe`, signup-style fix pending)
- [x] Task 8 (Neil live QA): hotel sources → Booking.com/Expedia, folio Book affordance, in-folio signup CTA, cruise dead-air trim (`50559eb`)
- [x] Final whole-branch review (opus): READY TO MERGE + a11y nits fixed (`687e867`)
- [x] Merge to main (ff `687e867`, pushed) + deployed 2026-07-10 + bundle `index-CcR1C74D.js` verified served
- [ ] Neil browser smoke: ?reel=ireland and ?reel=cruise (incl. new CTAs + hierarchy)

## Carried over (from demo-design lane)
- [ ] N18 asset: Neil generates inbox-blur image → web/public/scenes/inbox-blur.jpg → redeploy
- [ ] B4 remainder: per-turn token sanity behind $.27 early-step cost; LLM_MODEL value decision (Neil)
