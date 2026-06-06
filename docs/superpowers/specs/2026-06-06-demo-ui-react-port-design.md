# Design spec: Departure-Board × CLI — React port of the demo UI

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` (portfolio demo; live at https://voygent-demo.somotravel.workers.dev)
**Status:** approved design, ready for implementation planning
**Predecessor:** `docs/summaries/handoff-2026-06-06-demo-ui-mockups-shipped.md` (design exploration + hosted
mockups), `docs/design/2026-06-06-departure-board-cli-system.md` (design-system note)

## Purpose

Reimplement the chosen **Departure-Board × CLI** design in the live React app (`web/src/`), replacing the
current AI-default look (cyan-on-slate Inspector, system fonts, gray neutrals) with the warm amber-CRT system
explored in the static mockups. This is a **visual re-skin, not a logic rewrite** — the SSE data flow, React
state, and component responsibilities are correct as-is and do not change.

## Locked decisions (do not re-litigate)

From the mockup-shipped handoff + this session's brainstorm:

- **Theme:** Departure-Board × CLI. Airport split-flap signage for travel surfaces; authentic amber/green CRT
  for the engineering Inspector. One token set, audience-tuned intensity.
- **Palette default:** amber CRT (Neil confirmed). The cyan-on-slate / AI-default palette is removed entirely.
- **Cut:** interviewer + recruiter blend — interviewer two-column layout (product-left / engineering-right) as
  the baseline, with the recruiter cut's warmer, reveal-on-first-interaction folio choreography.
- **Inspector prominence:** persistent **but quiet until first trip**. The engineering column renders as a
  dimmed narrow rail when no tools have fired (`insTools.length === 0`), and expands to full width the moment
  the first tool fires. A manual collapse control lets a viewer re-quiet it.
- **Theme switcher:** keep the discreet 5-palette switcher (amber / phosphor / sodium / dusk / paper) in the
  live app as a craft signal; persist the pick to `localStorage`. Amber is the default.
- **Set-pieces (Focused tier):** wire **split-flap** (folio title + flight route codes), **orchestration
  packet** (live STAGES pipeline), and the **CRT scanline** Inspector. **Drop** the SVG route arc (folio carries
  no geo coordinates) and the price odometer (low payoff).
- **Layout:** folio stacks **under** the chat in the left "product" column (not a separate third column).

## Anti-slop contract (carry from the mockups)

- No slate, no cyan-on-dark. Warm near-black board (`#0c0a07`), neutrals tinted toward amber, active state is
  amber (`#ffcf6b`) not cyan.
- Two real typefaces: Space Grotesk (prose/headings) + JetBrains Mono (board/codes/terminal). Mono confined to
  where it's functional.
- No gradient text, glassmorphism, card-soup, pure black/white.
- **Honest numbers.** Every Inspector figure remains real telemetry (live SSE `inspector` events +
  `inspector-data.ts` for tier/BTS/biz tables). No invented multipliers. Plan figures stay labeled as
  community-observed estimates.
- All motion gated by `prefers-reduced-motion`; only `transform`/`opacity` animated.

## Architecture — file changes

**Approach (C): two-file CSS split.** Keep plain global CSS (matches today's setup), but separate the reusable
design system from app-specific layout so each is a legible, independently-understandable unit.

| File | Action | Responsibility |
|---|---|---|
| `web/src/theme.css` | **new** | Design system ported near-verbatim from `web/public/mockups/_system.css`: tokens, `.flap` / `.term.crt` / `.pipe` / `.fold` / `.spark` primitives, all 5 palette variants, `prefers-reduced-motion` block. Imported once in `main.tsx`. |
| `web/src/styles.css` | **rewrite** | App layout + component classes consuming the theme tokens. The old cyan-on-slate `:root` and all slate/cyan/terracotta values are deleted. |
| `web/src/main.tsx` | **edit** | `import "./theme.css"` before `./styles.css`. |
| `web/src/App.tsx` | **edit** | Layout restructure (see below); inline Inspector instead of fixed drawer; activity-driven expansion state; mount `ThemeSwitch`. |
| `web/src/Inspector.tsx` | **edit** | Remove fixed-drawer positioning + `open`/`onClose`; render inline in the engineering column; collapsed/expanded state; re-skin `ins-graph` → `.pipe` with traveling packet; `.term.crt` styling. Content + computations unchanged. |
| `web/src/FolioPanel.tsx` | **edit** | Boarding-pass card re-skin; folio title rendered via `SplitFlap`; flight route codes via `SplitFlap`. |
| `web/src/ChatView.tsx` | **edit** | Amber bubble / preset / welcome / tool-chip re-skin. Content + behavior unchanged. |
| `web/src/SplitFlap.tsx` | **new** | Renders `.flap` with one `<b>` per character; fires the `.flip` stagger on mount and on text change. |
| `web/src/ThemeSwitch.tsx` | **new** | Discreet control setting `document.documentElement.dataset.theme` across the 5 palettes; persists to `localStorage`; restores on load. |

No backend / worker / `shared/` changes — the port is frontend-only.

## Layout restructure (`App.tsx`)

Today: `.cols` grid `1fr | 380px` (chat | folio) + a fixed-position Inspector drawer behind a `🔍` toggle.

New (interviewer two-column blend):

```
<div class="app">
  <header>  Voygent · "AI travel-planning agent" · built by Neil Roberts · [ThemeSwitch] </header>
  <main class="stage">                         grid: product 0.78fr | engineering 1fr
    <section class="product">                  left column
      <ChatView/>                              chat on top
      <FolioPanel/>                            folio stacked beneath
    </section>
    <section class="engineering" data-state={idle|live}>   right column
      <Inspector .../>                         inline (not fixed); collapsible
    </section>
  </main>
  <footer>  meta-note: "this interface was itself built by a coding agent"  </footer>
</div>
```

- `data-state` is `"live"` once `insTools.length > 0` (or the first `tool` event), else `"idle"`. CSS collapses
  the engineering column to a dimmed narrow rail when idle and expands it when live. State derives from existing
  `App` state — no new event types.
- Manual collapse control inside the engineering column header lets a viewer toggle back to the rail after
  activity starts (replaces the old `inspectorOpen` toggle).
- **Mobile (< 760px):** the two sections stack, **product first** (engineering starts quiet).

## Set-pieces — live-data wiring

1. **SplitFlap** — `folio.title` and each flight's route codes (`flight.route`, e.g. `"JFK→CUN"`). The component
   splits the string into characters, renders `.flap > b` cells, and replays the staggered `flap-in` animation
   on mount and whenever the text prop changes. Reduced-motion shows the end state (already handled by
   `_system.css`'s media block).
2. **Orchestration packet** — re-skin the existing `STAGES` graph in `Inspector.tsx` (`stageActive()` already
   computes done/active per stage) into `.pipe` `.node` elements (`done` / `active` / idle), with the traveling
   `.packet` dot present while any stage is active. No new data.
3. **CRT Inspector** — apply `.term.crt` (scanline + corner glow) and the `.prompt` / `.ok` / `.err` / `.dim` /
   `.hi` classes to the inline Inspector. Tool timeline rows, scoreboard, tiers table, context-saved,
   observer-effect, BTS cards, business-case table keep their content + real numbers, restyled to the terminal.

Dropped (YAGNI): SVG route arc, price odometer, animated `wrangler-tail` log.

## Theme switcher

`ThemeSwitch` sets `document.documentElement.dataset.theme` to one of `amber` (default) / `phosphor` / `sodium`
/ `dusk` / `paper`, reading + writing `localStorage` so the pick survives reload. The 5 variants already exist
in the ported `theme.css`; switching is a single attribute write. Discreet placement in the header (the meta
note lives in the footer); keyboard-navigable with designed focus rings (already in `theme.css`).

## Testing

vitest (already configured). Keep existing tests green; add focused component tests:

- `SplitFlap` renders exactly one `.flap > b` cell per input character; re-renders on text change.
- `ThemeSwitch` writes `data-theme` to `document.documentElement` and persists/restores from `localStorage`.
- Inspector idle→live: `data-state` flips from `idle` to `live` on the first tool, and the manual collapse
  control returns it to the rail.

Build/typecheck gates: `npm run typecheck` clean; `npm run test` green. Manual smoke via
`npm run dev:web` against a live `dev:worker`, plus the prod build+deploy recipe from the handoff
(`rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`).

## Out of scope (YAGNI)

- SVG route arc, price odometer, animated live-log typing.
- The `investor` and `travel` cut layouts (this is one app; the blend is the chosen hierarchy).
- Any backend, worker, `shared/`, or SSE-protocol change.
- Removing the hosted `/mockups/` — they stay as a design-reference artifact (Neil's call later).

## Risk / review

This touches the real production demo components, so per the repo's established discipline the risky
integration (layout restructure + inline-Inspector refactor) gets a `/codex-review` pass before it's considered
done. Stage on a worktree branch off `main`; do not `git add -A` (stage by name); no push without sign-off.
