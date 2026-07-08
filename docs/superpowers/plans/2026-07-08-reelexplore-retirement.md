# ReelExplore retirement (C11 step a) — short plan

**Goal:** ch1/ch2's ended phase renders the full ReelFolioView (interactive) instead of the compact ReelExplore pricing panel; ReelExplore is deleted. Per spec Decision 6 (`2026-07-08-ch3-client-experience-design.md`).

**Approach:** runtime adapter — screenplays stay untouched. `folioSessionFromClient(clientView, folio)` combines the canonical chat folio (App.tsx:52 `folio` state, content) with the end-of-reel `ReelClientSession` (pricing state). ReelFolioView grows the three features ReelExplore had that it lacks; everything else (days, includes, live total) is a strict upgrade.

Wire-truth check: ch1 end total parity with old ReelExplore (same computeTripTotal over the same fields); ch2 end shows whiskey-walk ON (cvClosed state), total $4,830.

## Tasks (each: test-first where testable, typecheck+vitest green, commit)

1. **Adapter** — `web/src/lib/folio-session.ts` + test: maps the five pricing fields verbatim, forces `open: true`, `status: "draft"`, empty notes, no focus/expandedDay; total invariant `computeTripTotal(adapt(v, f)) === computeTripTotal(v)`.
2. **ReelFolioView additions** (interactive parity with ReelExplore):
   - Hotel chooser section (`data-reel-target="folio-hotel-choice"`, radio-style, local `pickedHotelId` in interactive mode) rendered when `view.hotels.length > 1`, replacing the `folio.hotels` display line in that case.
   - Undated add-ons section (`data-reel-target="folio-addons"`) for `addons` without `day`, after the days section (ch1: transfers/insurance; ch2: kilmainham/whiskey).
   - Send-to-Voygent funnel: `cta.sendFunnel?: boolean` → "Send to Voygent →" button + the guided-demo dialog (ported from ReelExplore; `cl-fv-send`/`cl-fv-dialog` styles). Not shown for ch3 (its "Build your own trip" CTA already funnels).
3. **App wiring** — ended branch: `folioView?.open` (ch3, unchanged) → else `clientView && folio` → `ReelFolioView mode="interactive" view={folioSessionFromClient(...)} cta={{..., sendFunnel: true}}` → else ReelEndCard. Delete ReelExplore import/usage.
4. **Delete** `web/src/ReelExplore.tsx` + the `.cl-explore-*` CSS block (667–~709); fix the stale ReelExplore mention in ReelEndCard's comment.
5. **Browser pass** (extend ch3-pass.mjs): ch1 seek-to-end → folio window, 3-hotel chooser works (pick Beckett Locke → total drops by $217), addons section present, "Watch Chapter 2" CTA, send-funnel dialog opens; ch2 seek-to-end → folio window, whiskey ON, $4,830, "Watch Chapter 3" CTA; ch3 checks unchanged (16/16 baseline).
6. **Ship** — code-review gate → ff-merge → deploy → live smoke (same Task-9 procedure as ch3).

## Out of scope
FolioArtifact restyle (C11 step b, next). ReelClientView (mid-playback window) stays — ch1/ch2 playback is untouched.
