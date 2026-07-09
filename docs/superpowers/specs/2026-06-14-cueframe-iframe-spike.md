# Cueframe ↔ claude.ai iframe spike

**Date:** 2026-06-14
**Parent plan:** `2026-06-13-cueframe-live-reel-anchors.md`
**Question the spike answers:** can cueframe attach callouts to elements inside the claude.ai
**MCP-app iframe** (where the folio widget renders), and to claude.ai's own **tool chips**, well
enough to author the live reel?

## TL;DR — cueframe needs two changes before it can touch claude.ai at all

Audited `/home/neil/dev/cueframe`. As written, it **cannot** do this, for two independent reasons:

1. **No auth.** Capture always `chromium.launch()` fresh + anonymous
   (`src/capture/capture.ts:190`). No CDP / persistent-context / storageState path. claude.ai
   requires login → capture never reaches the page.
2. **No frame support.** Anchor discovery uses `page.locator(sel)` on the **top document only**
   (`src/capture/digest.ts:192`). It never walks `page.frames()` / `frameLocator`, and stores
   `handle.boundingBox()` as if it were top-page coordinates with **no iframe offset**. The MCP
   app pane is a sandboxed (likely opaque-origin) iframe → invisible to discovery, and mispositioned
   even if found.

**The player needs no change** (`src/player/runtime.ts:97` just looks up a stored rect by selector
and scales it — frame-agnostic). So the work is entirely in `capture/`.

This is good news in one way: the changes are small and precisely located. But it means the spike
is a **small cueframe feature spike**, not a config exercise.

---

## Phase 0 — Recon FIRST (cheap, decisive, no cueframe code)

Before changing cueframe, learn how the claude.ai MCP frame actually appears, because that dictates
the fix. The unknowns: is the widget frame a navigated **URL** (voygent.ai), a **`srcdoc`**, or a
**blob:** doc? Is it one iframe or a nested sandbox wrapper? Can Playwright reach into it at all?

1. Launch a real Chrome with remote debugging and a persistent profile, log into claude.ai, open a
   trip that renders the folio board widget:
   `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/cf-chrome`
2. Run a throwaway Playwright recon script that attaches over CDP and dumps the frame tree:

```js
// /tmp/cf-recon.mjs  —  node /tmp/cf-recon.mjs
import { chromium } from 'playwright';
const b = await chromium.connectOverCDP('http://localhost:9222');
const ctx = b.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('claude.ai'));
for (const f of page.frames()) {
  console.log({ name: f.name(), url: f.url(), parent: f.parentFrame()?.url() });
}
// try to reach the widget's existing semantic id through each candidate frame:
for (const f of page.frames()) {
  const n = await f.locator('#itinerary').count().catch(() => -1);
  if (n > 0) {
    const box = await f.locator('#itinerary').boundingBox();
    console.log('FOUND #itinerary in frame', f.url(), box);
  }
}
await b.close();
```

**Decision gate:** if `#itinerary` is found in some frame and `boundingBox()` returns a rect →
Playwright **can** reach the widget; proceed. Record how that frame is identified (url substring,
name, or "the only opaque child frame") — Phase 2's frame-selection logic keys off this. If NOTHING
reaches it (sandbox truly opaque to CDP) → stop and go to the fallback (record the widget standalone
at a `*.voygent.ai` URL, outside claude.ai, and composite).

> Note: `boundingBox()` on an in-iframe element returns the rect **relative to the iframe**. Phase 2
> must add the iframe element's own top-page offset. Phase 0 just proves reachability.

---

## Phase 1 — Auth + an "observe" capture mode (cueframe change #1)

For a **real** reel we do NOT want cueframe driving claude.ai (LLM nondeterminism, login, bot
checks). The right model: **Neil drives a real logged-in browser; cueframe attaches and captures.**
That is CDP-attach, not scenario-automation.

- Target: `src/capture/capture.ts:190` (`browser = await chromium.launch({ headless })`).
- Add a `--cdp <url>` branch: `browser = await chromium.connectOverCDP(url)` and reuse the existing
  context/page instead of `newContext`/`newPage`. Capture from the already-open, authenticated page.
- Capture trigger: since a human is driving, add a snapshot-on-demand trigger (keypress/CLI signal),
  not the scenario stepper. (Scope check: this may be a touch more than "a flag" — it's a second
  capture mode. Keep it minimal: attach + snapshot current page on demand.)

storageState/cookie injection is the fragile alternative — avoid for claude.ai.

## Phase 2 — Frame-aware discovery + offset math (cueframe change #2)

- Target: `src/capture/digest.ts:192–203` (`collectBoxes`, `page.locator(selector).elementHandles()`).
- Walk frames, select the MCP-app frame by the signature Phase 0 found, resolve selectors **in that
  frame**, and translate to top-page coordinates:

```js
// pseudocode for collectBoxes(), per selector:
const appFrame = page.frames().find(matchWidgetFrame);   // signature from Phase 0
const elt = appFrame.locator(selector);
const inFrame = await elt.boundingBox();                  // iframe-relative
const frameEl = await appFrame.frameElement();            // the <iframe> in its parent
const frameBox = await frameEl.boundingBox();             // top-page coords
const rect = { x: frameBox.x + inFrame.x, y: frameBox.y + inFrame.y, w: inFrame.w, h: inFrame.h };
```

- For opaque cross-origin/sandboxed frames, use `page.frameLocator(<sel>).locator(selector)` for
  resolution; still derive offset from the parent's `<iframe>` box.
- Keep top-page elements (tool chips) on the existing path — only folio-widget selectors go through
  the frame branch.

## Phase 3 — Validate (go/no-go for the whole approach)

1. With the widget rendered, `cueframe capture` (CDP mode) a frame containing the folio board.
2. Author a folio callout against an **existing semantic id**:
   `cueframe callout <spec-dir> "the day by day itinerary"` → should resolve to `#itinerary`.
3. `cueframe play <spec-dir>` (or export) and **eyeball**: callout lands on the itinerary section
   inside the widget, not offset by the iframe origin.
4. **Player-isolation control:** hand-author one callout with `anchor.rect` set to known top-page
   pixels (bypasses capture/discovery) to confirm the player draws where told — isolates a capture
   bug from a player bug.
5. **Tool-chip sub-test (top-page, lower risk):** author a callout via NL phrase that should match a
   claude.ai tool-use chip by its text/AX digest (`resolveAnchor` scores `axDigest`/`label`). Confirm
   it resolves and positions. This is the "every step is a real tool call" beat; if the chip text
   doesn't survive into `axDigest` well enough to match, fall back to the Inspector cutaway for that
   beat.

**Pass:** #itinerary callout lands correctly inside the widget AND the rect-fallback control works.
That clears the iframe boundary → proceed to add the two real anchors (`data-group-type="hotels"`,
`data-day-edited`) and record the three takes.

**Partial (chip sub-test fails):** proceed with folio callouts; carry all under-the-hood / tool-call
narration in the Inspector cutaway instead of anchoring claude.ai chips.

**Fail (Phase 0 unreachable):** fall back to recording the widget standalone at a `*.voygent.ai` URL
and compositing — loses "really inside Claude" authenticity; revisit with Neil.

---

## Supporting setup

**Enable the folio app + render it in claude.ai:** set `FOLIO_BOARD_APP_ENABLED=true` on the MCP
server env (prod gates the folio tools behind it), connect that MCP server URL in claude.ai as a
connector, and run a trip that produces a folio board.

**Fast widget iteration without a worker redeploy** (R2 override; bucket `travel-media`, key
`ui/folio-board.html`):
`cd /home/neil/dev/voygent-lite && npm run build:folio-board-widget && npx wrangler r2 object put travel-media/ui/folio-board.html --file prototypes/folio-board/folio-board-widget.html --remote`

> Check `src/publish/r2-guard.ts` — staging/prod may require a `WORKER_ENV` key prefix; match it or
> the override is rejected.

## Execution notes

- cueframe changes (Phases 1–2) and the voygent-lite anchor edits are **code** → do them in a
  `/branch` worktree per repo, not the main clones.
- Order: Phase 0 (recon) is the one that decides everything; it costs ~30 min and no code. Do it
  before committing to the cueframe changes.
