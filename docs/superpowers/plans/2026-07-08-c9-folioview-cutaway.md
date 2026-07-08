# C9 — mid-chapter folio cutaway in ch1/ch2 (scripted `folioview`)

**Date:** 2026-07-08 · **Lane:** demo-design worktree · **Spec:** `../specs/2026-07-08-ch3-client-experience-design.md` Decision 7 (Neil: cutaway over pop-up).

## Goal

Viewers of ch1/ch2 see the folio — the product's hero artifact — mid-chapter, not only in ch3/end-states. One short ReelFolioView scripted cutaway per chapter; the concept each cutaway lands: **the folio is a live page**.

## Design

- **Ch1 (`dublin-collab`), after Act 7's `sendsToClient`:** cut to the Millers' window as the folio lands. Snapshot 1: `withIncludes` folio, hero focus, spotlight ("a living page, not an attachment" angle + ch3 teaser). Snapshot 2: scroll to `folio-hotel-choice` — the advisor's shortlist rendered as the client's choice (no spotlight; Act 3 already set it up). Close (`null`). Pricing: flights 3180 + activities 740, no hotel picked → total $3,920, matching Act 8's opening `cvBase`.
- **Ch2 (`dublin-run`), after the Wicklow pick lands (`withTour`):** one snapshot focused on `folio-day-6` (`expandedDay: 6`) — the day the advisor just filled, already on the client's page. Spotlight: same link stays current, no re-send. Close. Pricing: 3180 + Dean 1176 + 284 = $4,640 (matches ch3's opening total). `addons: []` — the two remaining tours are only OFFERED in beat 3; showing them as toggles before the send would be dishonest. `status: "draft"` matches the end-state convention (`folioSessionFromClient` hardcodes draft; a mid-chapter "Final" would visibly regress to "Draft" at the ended surface).

## Known traps (from the ch3 handoff self-critique) and how this build guards them

1. **Anchor collision:** ReelCallout resolves targets with a global `document.querySelector`; ch1/ch2 keep FolioArtifact in the DOM behind the cutaway scrim (ch3 dodged this by having no chat folio events). Shared anchors: `folio-days`, `folio-day-1..5` (0- vs 1-based overlap). Cutaway spotlights use ReelFolioView-exclusive anchors only. **New guard** in `reel-targets.guard.test.ts`: any highlight bound to a `folioview` frame in a recording that also emits chat folio events must target an anchor NOT emitted by `ClaudeChatView.tsx`.
2. **Both-views-set at ended:** App's ended branch prefers `folioView` over `clientView`. Cutaways close with `folioView(null)` so ch1/ch2 end-states still derive from the client session. **New guard** in `end-state.guard.test.ts`: if a ch1/ch2 recording has a `folioview` track, it ends with `null`.
3. **Grounding tests that pin exact counts:** ch1's interaction-kind set gains `"folioview"`; callout count 11 → 12.

## Steps

1. Tests first: extend the two guards + ch1/ch2 grounding tests (fail).
2. Implement the two screenplay cutaways (pass).
3. `npx tsc --noEmit` + `npx vitest run` (expect the one pre-existing failure at `worker/info/pages.test.ts:72`).
4. Workflow code-review; fix findings.
5. Playwright browser pass on both chapters (cutaway opens, spotlight anchors to the right surface, closes, end-states unchanged).
6. Deploy + merge to main (this code merge carries the trailing docs-only commits; reconcile main-clone SESSION_LOG WIP at merge time).
