# Demo UI design system — "Departure Board × CLI"

**Date:** 2026-06-06
**Status:** exploration (static mockups). The chosen direction gets reimplemented in `web/src/` later.
**Files:** `web/public/mockups/_system.css` (tokens + shared primitives), `…/interviewer.html` (built first),
`…/{recruiter,investor,travel}.html` (stubs until sign-off), `…/index.html` (landing).
**Hosted:** `https://voygent-demo.somotravel.workers.dev/mockups/`

## The idea
One theme, two motifs, audience-tuned intensity:
- **Airport split-flap signage** for the travel surfaces — warm, legible, travel-native. Flight codes and the
  trip title *clack* in; the price total rolls up on an odometer; an SVG route arc draws origin→destination.
- **Authentic amber/green CRT terminal** for the engineering boards — the Inspector is a real observability
  tool, so a terminal is an *earned* medium, not "mono = techy" shorthand.

The two share one token set, so the four cuts read as the same product at different volumes (interviewer =
terminal-forward; recruiter = warm, terminal as a reveal; investor = business-case forward; travel = least
terminal).

## Anti-slop decisions (why this won't read as AI default)
- **No slate, no cyan-on-dark.** The board black is *warm* (`#0c0a07`, amber-CRT body), neutrals are tinted
  toward the brand hue, and the active-state color is **amber** (`#ffcf6b`), not the AI-default cyan.
- **Two real typefaces**, not system-default everywhere: **Space Grotesk** (prose/headings) + **JetBrains Mono**
  (board, codes, terminal). Mono is confined to where it's *functional* (tabular alignment, terminal); prose
  stays in the grotesk so it isn't mono-everywhere.
- **No pure black/white, no gradient text, no glassmorphism, no card-soup.** One distinctive signature element
  per surface (split-flap board; CRT inspector).
- **Honest numbers.** Every figure in the mockups is the real Inspector's telemetry — no invented multipliers.

## Tokens (see `_system.css` for the full set)
| Token | Value | Role |
|---|---|---|
| `--board` / `--board-2` | `#0c0a07` / `#14110c` | warm CRT body / raised panel |
| `--paper` | `#f4f0e6` | boarding-pass cream |
| `--amber` / `--amber-hi` | `#f5a623` / `#ffcf6b` | signature + active state |
| `--phosphor` | `#79d98a` | terminal "ok", context-saved |
| `--red` | `#f0746a` | errors |
| type | Space Grotesk + JetBrains Mono | scale 1.25 (12→44) |
| spacing | 8px base | 4 8 12 16 24 32 48 |

## Motion (all gated by `prefers-reduced-motion`)
Split-flap clack (staggered char flip) · odometer count-up (ease-out-quart) · pipeline packet dot traveling
stage→stage with cyan-free amber node pulses · `wrangler tail`-style live log typing with a blinking block
cursor · skippable boot sequence · SVG route-arc draw. Only `transform`/`opacity` animated; reduced-motion
shows the end state.

## Craft signals shown on purpose
`prefers-reduced-motion` fallbacks · designed focus rings (`:focus-visible`, amber) · tabular-nums on every
moving number · 60fps transform/opacity-only motion · keyboard-navigable. A quiet meta-touch in the footer
notes the interface was itself built by a coding agent — the thesis, stated once, classily.
