# Cueframe live-reel anchors — plan

**Date:** 2026-06-13
**Goal:** Replace the scripted `collab` reel with a **real cueframe recording** of a live
claude.ai session driving the in-chat folio MCP app, and instrument the folio app with stable
callout anchors so cueframe can attach annotations reliably.
**Decision (Neil, 2026-06-13):** this recording *replaces* `dublin-collab.screenplay.ts`. The
scripted reel is deprecated once every beat is reproduced, because it drifts out of accuracy as
the folio changes. The new reel is the honest depiction of "Voygent in claude.ai."

---

## What cueframe needs (from its README)

- Playwright captures a browser workflow → `spec.json` (frames + captions + a11y data + element
  coords). Callouts are authored in English and resolved to a **frame + DOM anchor + position**.
- It works best on **stable selectors** (`#id` / `[data-*]`). Our folio app already has these.
- **One workflow per spec, no branching** → the traveller's client window is a *second*
  recording, stitched after the chat recording. Not one continuous take.
- **Nondeterministic UIs won't reproduce identically** → expect to re-shoot takes; a live Claude
  session varies run-to-run.

## PROD REALITY CHECK (2026-06-14) — read this before the older sections below

Audited the **live** widget (not local snapshot). Findings that revise the plan:

- **Prod = `voygent-lite` main, in sync**, deployed commit `7de7d28` (2026-06-13, "folio-board
  parity Lane 1 shipped + Lane 3 handoff"). **No R2 override exists** (`travel-media/ui/folio-board.html`
  absent) → prod serves the bundled base64. Neil's "main is trunk" choice is correct and current.
- **The widget already emits a semantic `id` anchor system.** Every decision `.group` renders
  `id="${anchor}"` (e.g. `id="flights"`, `id="athens-hotel"`), and sections carry static ids:
  `#itinerary` (day-by-day), `#budget`, `#next-steps`. Plus a `.fb-jumpnav` of `[data-jump]` pills
  that jump to them. **This largely obsoletes a separate `data-cf-anchor` namespace** for
  sections/groups — cueframe can anchor to these existing ids. Only ADD hooks where none exist.
- **The folio has advanced well past the old screenplay.** New surfaces now live in prod that the
  reel can/should showcase: **Travelers** (`data-tg-travelers`, `.tv-list/.tv-row`), **Action
  items / next-steps** (`data-tg-ai`, `#next-steps`), **Packing** (`data-tg-pack`, `.pack-list`),
  **Apps to download** (`data-tg-apps`, `.app-list`), **jump-nav** (`.fb-jumpnav`), and richer
  inline editing (group-note `data-gn-*`, text fields `data-tx-*`/`data-ts-*`). Reproducing the
  old beats is now the floor; the reel should also show these.

### Revised per-anchor verdict (live widget)

| Anchor | Live status | Selector / action |
|---|---|---|
| Flights group | ✅ exists | `#flights` (existing semantic id) |
| Hotels group | ⚠️ no `#hotels` | Multi-hotel trips get `#athens-hotel` etc. `[id$="-hotel"]` works but is convention. **Add `data-group-type="hotels"`** to the group renderer for a stable contract. |
| Day-by-day | ✅ exists | `#itinerary` / `[data-tg-days]` |
| Advisor-edited day | ❌ **no DOM marker** | Day headers carry only `data-tg-day="<idx>"`. **New surface needed** — add `data-day-edited` in `dayBlock()` when the day carries an edit. |
| Extras/includes | ✅ exists | `[data-tg-includes]` |
| Commission | ❌ **not in widget at all** | The projector (`buildFolioBoardData`) **strips** `commission`/`commissionPct`/`commissionSource` — they're on `TripDecisionOption` but never reach the projected `BoardOption`. The widget renders no commission element. **This is a feature, not an anchor** — and likely stripped on purpose so the client-facing widget can't leak commission. Reviving it needs an **advisor-mode gate** (must not show in the traveller view). See decision below. |

**Net:** 3 anchors are wire-today via existing ids (`#flights`, `#itinerary`, `[data-tg-includes]`).
1 needs a small attribute (`data-group-type="hotels"`). 2 (`day-edited`, `commission`) need new
rendered surface, and commission is a real advisor-gated feature, not a callout hook.

---

## The folio app (what we're anchoring into)

- Repo: `voygent-lite`, **trunk = `voygent-lite` main** (Neil, 2026-06-13). Note: main does NOT
  yet have `folio_board_text`/`registerFolioBoardTextTool` (that's only on the
  `voygent-lite-folio-imagery-csp` branch) — so the `extras` text-edit beat may not exist on main
  yet. Confirm the extras-edit surface is present on main before anchoring `extras-section`, or
  the CSP work lands on main first.
- Source: `prototypes/folio-board/folio-board-widget.js` (vanilla JS, ~960 lines), shell
  `folio-board-widget.shell.html`. Build: `npm run build:folio-board-widget` →
  `scripts/build-folio-board-widget.mjs` regenerates `folio-board-widget.html` and re-encodes
  base64 into `src/folio-board/folio-board-widget-html.ts`.
- Render model: full re-render of `#fb-root.innerHTML` from a template literal on every state
  change. No React. Stable authored classes (`.group`, `.card`, `.day`, `.budget`, `.inc-list`).
- Already-stable interaction selectors: `[data-tg-group="{id}"]`, `[data-tg-day="{idx}"]`,
  `[data-tg-days]`, `[data-tg-budget]`, `[data-tg-includes]`, `[data-did]/[data-oid]`,
  `[data-submit]`, `[data-folio]`, etc.
- Served as `text/html;profile=mcp-app` in a **sandboxed iframe** inside claude.ai, CSP
  `resourceDomains: ["https://*.voygent.ai"]`. Widget version tag = djb2 hash of the HTML, so
  **adding anchors auto-busts the claude.ai cache** (no manual cache step).
- R2 override (`wrangler r2 put ui/folio-board.html`) lets us iterate the widget **without a
  worker redeploy** — use this during the anchor/spike loop.

---

## Track B FIRST — the iframe spike (de-risk before writing all anchors)

The single biggest unknown is whether cueframe (Playwright) can resolve an anchor **inside the
sandboxed MCP iframe** and draw the callout at the right place on the *top* claude.ai page. The
callout overlay is on the host page; the anchor element is inside a (possibly cross-origin)
iframe, so cueframe must add the iframe's offset to the element's in-frame box. Prove this with
ONE anchor before investing in the full set.

1. Enable the folio app (`FOLIO_BOARD_APP_ENABLED`) on a test MCP server; connect claude.ai.
2. Add a single `data-cf-anchor="commission"` anchor, rebuild, push via R2 override.
3. Drive a claude.ai session that renders the folio; point cueframe at it; try to resolve
   `[data-cf-anchor="commission"]` through the MCP iframe and place a callout.
4. Confirm: (a) Playwright reaches the element across the frame boundary, (b) cueframe computes
   correct top-page coordinates (iframe offset handled), (c) the callout re-lands across a
   re-record.

**If the spike fails:** fallbacks, in order of preference —
- Record the folio app standalone at a `*.voygent.ai` URL (outside claude.ai's iframe) and
  composite it into the chat recording. Loses the "really inside Claude" authenticity.
- Anchor folio callouts at the chat level only (brittle, claude.ai DOM). Worst option.

This is why we spike before bulk anchor work.

---

## Track A — the anchor set

### Principle: anchor to semantic state, not fixture indices

The recording is **live**, not a scripted fixture, so anchors must latch onto roles/states the
app can identify at render time — not positions in a script. Example: the advisor-edited day
gets `data-cf-anchor="day-edited"` derived from the edit marker the app already renders, NOT
`[data-tg-day="2"]`. Robust if days reorder or the advisor edits a different day on a given take.

### Why a dedicated `data-cf-anchor` namespace (not reuse `data-tg-*`)

The existing `data-*` are *interaction* targets keyed by dynamic IDs. Callouts want a **stable,
semantic, singular** anchor per concept, decoupled from fixture data and self-documenting
("exists for the reel"). Greppable, survives data changes, won't be removed by an interaction
refactor.

### Beat → anchor map (from `dublin-collab.screenplay.ts`)

| # | Old target | New anchor | Surface / who controls the DOM |
|---|---|---|---|
| 1 | `tool-save_trip` | (text/aria anchor) | **Chat chrome** (claude.ai tool chip) — we don't control it. Minimize or drop; see below. |
| 2 | `board-flight` | `data-cf-anchor="group-flights"` | Folio app flights decision `.group` — **we control** |
| 3 | `board-hotel` | `data-cf-anchor="group-hotels"` | Folio app hotels decision `.group` — **we control** |
| 4 | `folio-days` | `data-cf-anchor="days-section"` | Folio day-by-day section — **we control** |
| 5 | `eng-panel` | — | **No claude.ai analog** (Inspector is a demo-only surface). DECISION NEEDED: drop from the in-chat reel, or cut away to the interactive demo? |
| 6 | `folio-day-2` | `data-cf-anchor="day-edited"` | Folio day row carrying the advisor-edit marker — **we control** (semantic, not index) |
| 7 | `board-includes` | `data-cf-anchor="extras-section"` | Folio "Good to know"/extras section — **we control** |
| 8 | `handoff-notice` | TBD | Send-to-client action — **depends on the real send UI** (folio control vs chat action). Resolve when the live flow is wired. |
| 9 | `client-view` | (own anchors) | **Separate recording** — traveller window is its own `*.voygent.ai` surface we control; easy anchors there. Stitched after the chat take. |
| 10 | `comment-thread-food` | TBD | Client note — likely a folio day note or chat message. Resolve against the real flow. |
| 11 | `trip-commission` | `data-cf-anchor="commission"` | Folio commission/budget display (advisor mode) — **we control** |

**Core "we control" anchors to add now (6):** `group-flights`, `group-hotels`, `days-section`,
`day-edited`, `extras-section`, `commission`. These are pure additive `data-cf-anchor` attributes
in the `folio-board-widget.js` render templates.

### Anchor-add mechanics

- Add `data-cf-anchor="<name>"` in the relevant template-literal sections of
  `folio-board-widget.js`. State-coupled ones (`day-edited`) emit only when the marker is present.
- Rebuild (`npm run build:folio-board-widget`), push via R2 override for fast iteration, then a
  real worker deploy once stable. Cache busts automatically via the version-tag hash.

---

## The beats with no clean claude.ai analog (DECIDED 2026-06-13)

Neil chose **text-anchor the tool chips AND a separate Inspector cutaway** (options 2 + 3).

- **Tool-call callouts (beat 1, "every step is a real tool call").** Tool-use chips are claude.ai
  DOM we don't control → anchor via **cueframe's text/a11y matching** against the chip (the README
  says it captures a11y data). Keep this to one or two chips; accept it's the most fragile part of
  the reel and will need re-validation when claude.ai's chip UI changes. **Spike this too** during
  Track B — confirm cueframe can resolve a callout against a claude.ai tool chip by text, not just
  by `data-*`. If it can't, fall back to the Inspector cutaway carrying the tool-call story.
- **eng-panel / Inspector (beat 5).** No analog inside claude.ai → record a **short Inspector
  cutaway** on our own surface (stable anchors, like the client-view) and stitch it in as a
  cutaway. This is a third recording. The Inspector is `voygent-demo`'s own surface, so anchors
  there are easy and fully under our control.
- **client-view (beat 9).** A second recording on our own `*.voygent.ai` surface (easy anchors),
  stitched after the chat take.

**Recording count: 3 stitched takes** — (1) the live claude.ai chat+folio session, (2) the
traveller client-view window, (3) the Inspector cutaway. cueframe is one-workflow-per-spec, so
these are separate specs sequenced in the final reel.

---

## Downstream (not this plan, noted)

- "Try it for yourself" demo web page must be updated to mimic the new folio-app features to stay
  honest once the reel shows them. Separate task in `voygent-demo`.

## Resolved decisions (2026-06-13/14)

1. **Trunk:** `voygent-lite` main — and it IS prod (commit `7de7d28`, no R2 override). ✅
2. **Tool-call + eng beats:** text-anchor one or two claude.ai tool chips AND stitch a separate
   advisor-only **Inspector cutaway** (3 stitched recordings total). ✅
3. **Commission beat:** carry it in the **Inspector cutaway**, NOT the folio widget — avoids the
   advisor/traveller shared-widget leak and needs no widget change. ✅
4. **Iframe spike (Track B) runs first**, before bulk anchor work. ✅

## Finalized anchor worklist (on `voygent-lite` main, in a `/branch` worktree)

| # | Concept | Action |
|---|---|---|
| 1 | Flights group | **None** — use existing `#flights` |
| 2 | Hotels group | **Add `data-group-type="hotels"`** in the `.group` renderer (stable contract vs the `#…-hotel` naming convention) |
| 3 | Day-by-day | **None** — use existing `#itinerary` / `[data-tg-days]` |
| 4 | Advisor-edited day | **Add `data-day-edited`** in `dayBlock()` when the day carries an edit marker (semantic, not index) |
| 5 | Extras/includes | **None** — use existing `[data-tg-includes]` |
| 6 | Commission | **No widget change** — Inspector cutaway carries it (in `voygent-demo`; confirm the Inspector renders commission, add if missing) |

Optional reel expansion (new prod surfaces worth showing): Travelers (`#…`/`data-tg-travelers`),
Action items (`#next-steps`), Packing (`data-tg-pack`), Apps (`data-tg-apps`), jump-nav.

## Execution order

1. **Spike (Track B)** — see `2026-06-14-cueframe-iframe-spike.md`. **Key finding: cueframe cannot
   record claude.ai as written** — it has no auth-attach (always launches anonymous) and no iframe
   support (top-document `page.locator` only). The spike adds two small, precisely-located capture
   changes (CDP attach at `capture.ts:190`; frame-aware discovery + offset at `digest.ts:192`; the
   player needs none), then validates a callout lands on `#itinerary` inside the widget. Phase 0
   recon (frame-tree dump over CDP) is the cheap go/no-go and runs before any cueframe code.
2. If spike passes → add anchors #2 and #4 on a `voygent-lite` worktree, rebuild widget, R2-push.
3. Record: (1) live claude.ai chat+folio, (2) traveller client-view, (3) Inspector cutaway.
4. Author callouts against anchors; stitch the 3 specs; deprecate `dublin-collab.screenplay.ts`
   once every beat is reproduced.
