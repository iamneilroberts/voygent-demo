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
- [ ] B6. Rome hotel prices per-night insanely high in curated demo — needs a
      realistic mix (data source issue? party-total vs per-night? currency?).
- [ ] B7. Rome hotel "more details" links to CPMaxx (credentialed) — must go to a
      PUBLIC site. Curated demo: pre-select public detail URLs. Off-menu demo:
      Google Places or similar for hotel details.

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
