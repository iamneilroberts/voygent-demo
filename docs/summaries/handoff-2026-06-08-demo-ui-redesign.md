# Session Handoff: Demo UI Redesign
**Date:** 2026-06-08
**Repo:** `voygent-demo` · **Branch:** `demo-ui-redesign` (worktree `../voygent-demo-demo-ui-redesign`, off `demo-enrichment`)
**Status:** ✅ **DEPLOYED to prod** (Worker `voygent-demo` @ https://voygent-demo.somotravel.workers.dev) as a SUPERSET merge `6f11dcb`.

> ⚠️ **Deploy collision caught + fixed.** First deploy went out from `demo-ui-redesign` (based on `1812216`) — but `demo-enrichment` had advanced to `acef57b` (the **phase-machine** feature) since I branched. That first deploy regressed `/info/phase-machine` (302→`/`). Fixed forward: merged `demo-enrichment` into the branch (resolved 4 overlapping files — `shared/events.ts`, `App.tsx`, `Inspector.tsx`, `styles.css` — keeping BOTH the validation/summary-strip and the phase-machine trail), re-verified **222 tests green**, redeployed `6f11dcb`. `/info/phase-machine` is back to **200**; both features live. `demo-enrichment` fast-forwarded to `6f11dcb` (prod branch == deployed code). Lesson (again): shared Worker = last-deploy-wins; deploy a superset, not a stale branch.
**Plan executed:** `docs/plans/2026-06-08-demo-ui-redesign-plan.md` (method: interface-design skill set).

## What shipped (5 commits on `demo-ui-redesign`)
1. `baab1d5` **Data fix (#1):** Dublin itinerary consistency. Outbound lands DUB Oct 13 07:20 (overnight via IAD), but the folio's `days[]` labeled Oct 12 "Arrive Dublin" with a full-day Glendalough tour. Inserted an Oct 12 "Depart Mobile (MOB)" travel day and shifted Dublin days so the arrival day (Oct 13) holds only the light Phoenix Park walk. All real activity/dining data preserved (5th dining pick → new Oct 17 day). Applied to BOTH folio events in `web/src/recordings/dublin-oct.json`. (Bonus: the assistant's existing narration already said "arrival Oct 13 morning + a travel day" — the fix makes the folio match the narration.)
2. `f3aa731` **Engineering panel (#2/#3/#4 + correction #1):**
   - **Summary strip** (10-sec read) atop the live Inspector: MCP tools exposed · tools used · persisted writes · context kept out · observed cost · validation N/N. `Inspector.tsx` `.ins-summary/.ins-strip/.ins-stat*` in `styles.css`.
   - **Trip-Integrity / Validation section:** new `kind:"validation"` inspector event (`shared/events.ts`), data-driven section (renders nothing until a validation event fires → live path never implies passing checks). 5 honest checks added to the replay; arrival-date marked **`repaired`** (ties to the data fix).
   - **Cost language:** "Observed routed cost" / "Counterfactual estimate" / "Deterministic render estimate".
   - **Light-mode (paper) harmonization:** scoped token override in `theme.css` gives the inspector a distinct warm light-terminal surface (`--board:#e9e1cd`) a notch deeper than the cream chat — not pure-black-on-white, not vanishing.
   - Adds `.interface-design/system.md` (the extract deliverable).
3. `69f7318` **Chat/brand/copy (#5/#6/#7 + correction #2/#4):** ribbon now Voygent-led ("A Voygent demo in a Claude-style chat surface — not affiliated with Anthropic"); subtle first-screen positioning line in the header (hidden on mobile); footer copy → "Built with coding-agent workflows; architecture, constraints, and review by Neil Roberts." Disambiguation preserved.
4. `8c20efe` **persisted-writes fix:** recording predates the store-ops widget (no `store` events), so the strip read 0. Now derived from fired tools via the production `storeOpsForTool` mapping (KV put/delete) → reads **10** (1 save + 7 patch + 2 promote).

## Verification (all green)
- `npx tsc --noEmit` clean · `npm test` **198/198** · `VITE_API_BASE="" npm run build:web` green.
- Headless-Chrome screenshots (`--virtual-time-budget` to fast-forward the replay), saved in `docs/review-shots/`:
  - `after-dark-desktop.png`, `after-light-desktop.png`, `after-mobile.png`, `after-summary-strip.png`, `after-trip-integrity.png`.
  - Dark: strip reads `106 / 17 / 10 / ≈2.4k / $0.58 / 5/5`; Trip-Integrity shows the `repaired` arrival check + 4 passes.
  - Light (paper): inspector is a distinct light-terminal, harmonized — **Rule 1 satisfied.**
  - Mobile (390px): conversational, positioning line hidden, Voygent-led ribbon — usable.

## Notes / chat-clarity (correction #2)
Left the `cl-*` chat structure as-is (right-bubble user vs serif assistant prose vs set-apart artifact card already reads as a clear human↔AI conversation). The mockup was the problem, not the live app; confirmed in screenshots. No risky rewrite.

## Open follow-ups (out of scope here)
- **StoreOps detail widget is still empty in the replay** (recording carries no `store` events). The summary strip's "persisted writes" is correct via projection, but the "Data-store ops" section won't render until the recording is re-captured with store events (`?skin=claude&record=1`, then `window.__exportRecording()`).
- **Live-path validation:** validation events are only in the replay. The live ("build your own") path won't show a Trip-Integrity section (honest — it's data-driven). Wiring the worker to emit validation events is a separate task.
- `.dev.vars` not needed for the replay verification (replay is client-side from the bundled recording).

## What the NEXT session / Neil should do
1. Review `docs/review-shots/` + the branch diff.
2. To deploy (Neil): `VITE_API_BASE="" npm run build:web && npx wrangler deploy` from a clean `demo-ui-redesign` (or after merge to `demo-enrichment`). `/info` pages are server-pre-rendered; a deploy refreshes them.
3. Optional: re-capture the Dublin recording with store events to populate the StoreOps detail widget.
