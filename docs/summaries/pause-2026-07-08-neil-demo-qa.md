# Neil demo QA queue — 2026-07-08

Source: Neil's hands-on review of demo.voygent.ai after the ch2 ship (2026-07-07).
Owner session: main (Fable). Status: triaged, execution starting.

## Instructions
Work these in the voygent-demo repo (worktree per lane). Quick fixes first, then
investigations, then the design-gated items (brainstorm with Neil before building).
Check items off here as they ship.

## A. Quick fixes (no design gate)
- [ ] A1. Rename travelers "Henderson" → "Jones" across demo reels/fixtures.
      NOTE: the voygent-lite LANDING hero also says "the Hendersons'" (shipped
      2026-07-07) — propose changing it to "the Joneses'" for cross-surface
      continuity (one-string + voice tests stay green). Ask Neil only if he
      objects to touching the landing.
- [ ] A2. Reel auto-scroll keeps pertinent section in view on MOBILE (animation
      scrolls insufficiently; content hidden below fold). Applies to the animated
      reel AND the curated demo (same problem per Neil items 2 & 8).
- [ ] A4. "You don't pay per interaction — it's part of the subscription" made
      prominent wherever per-call costs show. PLUS (Neil 07-08): show WHICH MODEL
      each cost line came from (Haiku default is itself a selling point).
      Root cause note: costs are LIVE telemetry (tokens × rates), demo default =
      claude-haiku-4-5 (session-do.ts:67), LLM_MODEL secret may override in prod.
- [ ] A10-discoverability. Neil "doesn't see the second chapter" — the reels
      rotate via ?reel= param with no visible chapter navigation. Add an explicit
      chapter picker / next-chapter affordance (end-card CTA "Watch chapter 2" +
      intro-card chapter list).

## B. Bugs to investigate then fix
- [ ] B3. Interactive demo: flight routing + aircraft detail does NOT display when
      an option is selected (expand-on-click broken in live/interactive mode?).
- [ ] B4. Engineering cost implausibly high for first steps ($.27) — find where
      the number comes from (real telemetry vs fixture) and correct/calibrate.
- [ ] B5. Curated demo: candidate list errors when PROMOTING (repro, capture the
      error envelope, fix).
- [x] B6. Rome hotel prices per-night insanely high in curated demo — needs a
      realistic mix (data source issue? party-total vs per-night? currency?).
      DONE 2026-07-08: root cause was the capture's `sort_by:"profit", top_n:8`
      (returned only $649–$1,460/night luxury). capture-fixtures.mjs now pulls a
      wide price-sorted pool and band-picks 3 budget / 3 mid / 2 upscale (3★+,
      commission-preferred within band). Rome recaptured: $378–$1,486/night, 3–5★.
- [ ] B7. Rome hotel "more details" links to CPMaxx (credentialed) — must go to a
      PUBLIC site. Curated demo: pre-select public detail URLs. Off-menu demo:
      Google Places or similar for hotel details.

## N7-N12: Neil reel QA round 2 (2026-07-08 evening, ch1 collab reel)
- [x] N7. Advisor-edit beat shows the SAME text on both sides of the ADVISOR EDITED
      tag: the folio update is emitted AFTER the edit interaction, and the spotlight
      pauses on the interaction frame — old text renders while the callout dwells.
      Fix: screenplay edits() emits the resulting folio BEFORE the edit interaction.
- [x] N8. Dead air: demo dwells with nothing changing at (a) post-"Here's the week"
      chat, (b) includes cards after all picked. If nothing is changing and the
      callout is gone, skip to the next thing (pacing).
- [x] N9. Cutaway callout copy is nonsensical to viewers: "Chapter 3 rides along in
      their window" — remove the meta chapter reference.
- [x] N10. Cutaway needs a BIGGER callout framing the folio as the travel document,
      then quickly expand several sections to show the depth of detail.
- [x] N11. "Ready to book" moves for no good reason (movement/scroll without visible
      cause near the closing beats).
- [x] N12. Commission display should be much more impressive: which components bring
      how much commission, and how much various tours would add.

## N13-N19: Neil reel QA round 3 (2026-07-08 evening, chapter nav + ch2 + scenes)
- [x] N13. Chapter-end CTA stack looks like part of the folio. Chapter controls should
      be unobtrusive in the margins; chapters should continue automatically OR raise a
      clearly-dedicated "watch the next step?" modal.
- [x] N14. Chapter-picker modal is confusable with the end-card modal. Replace with a
      breadcrumb / table-of-contents style interface.
- [x] N15. ch2 paste beat needs a PREPARATORY callout BEFORE the messy confirmation is
      pasted ("copy an email, paste it in, Voygent figures out what it is and applies
      it"). "The confirmation reads itself" → plain language: "You can paste the
      confirmation as it comes to your email, no matter how messy it is."
- [x] N16. "Voygent notices first" is too cute → "Voygent sees the empty day and
      suggests profitable tours."
- [x] N17. "Same link, already current" inscrutable (and the ring highlights Good-to-know
      while the body talks about day 6) → plain: Voygent automatically includes detailed
      extra information; the advisor keeps control of what ends up on the proposal.
- [x] N18. Client-side beats must read as an obviously different SCENE: blurred fake
      email-inbox background behind the client window (Neil will generate the image
      from a prompt we supply); obvious advisor → client → advisor view shifts.

### N7-N18 resolution notes (2026-07-08 late)
- N7 — DONE: renderer shows the edit marker's `now` text when the folio hasn't caught up — old→NEW always reads.
- N8 — DONE: post-callout pre-delay cap (250ms) in replayChat — after a callout resolves the reel moves on.
- N9 — DONE: cutaway callout rewritten, meta chapter reference removed.
- N10 — DONE: hero-variant callout ("This is their travel document") + scripted quick flips expanding day 2, day 4, good-to-know.
- N11 — DONE: pricing-widget status is now DERIVED (hotel picked?) — "Pick your hotel to finish" → "✓ Ready to book"; arbitrary progress bar removed.
- N12 — DONE: itemized "Your commission" section in the folio artifact (earned rows + Booked-so-far total + "if they add it" potential rows) in ch1+ch2 finals; closing callout rewritten.
- N13 — DONE: demo controls moved OUT of the folio window to a margin rail; 12s auto-advance countdown to the next chapter, cancelled by any folio interaction ("Stay and explore").
- N14 — DONE: chapter-to-chapter nav autoplays (?autoplay=1, no second modal) + persistent margin breadcrumb (1/2/3, ✓ done, click to jump).
- N15 — DONE: pre-paste hero callout ("Copy an email, paste it in") + bookings callout rewritten plain ("Paste it as messy as it comes").
- N16 — DONE: title now "Voygent sees the empty days and suggests profitable tours".
- N17 — DONE: plain copy ("Their page updates automatically... advisor stays in control") + ReelCallout re-measures on captured scroll so the ring tracks the right section.
- N18 — DONE (CSS fallback): blurred fake-inbox backdrop + "The clients' view — the Millers' window" label on both client windows; drop web/public/scenes/inbox-blur.jpg to replace the CSS inbox with Neil's image.

## C. Design-gated (brainstorm with Neil before building)
- [ ] C9. Feature the folio: pop up once or twice during the reel, END on the folio.
- [ ] C10 (REVISED 2026-07-08 after Neil watched ch2): KEEP "Run the trip" as-is
      ("the paste is impressive, keep it"). ADD a new client-experience chapter
      (2-way updates between live client view and advisor folio — M7 lane).
      Original "drop paste/gap-fill" decision REVERSED by Neil.
- [ ] C11. Curated-demo folio looks nothing like current production folio (warm
      editorial, alaska-warm theme). Make it match production and impress.

## Coordinates
- Demo prod: merged main (reel ch2 + showcase), worker Version d99e5c54→(showcase merge redeploy).
- Landing prod (voygent-lite): 17dc913e from 33c1e79.
- Ch2 reel: web/src/recordings/dublin-run.screenplay.ts; guard test reel-targets.guard.test.ts.
- Verification doc: docs/summaries/2026-07-07-reel-run-verification.md.
