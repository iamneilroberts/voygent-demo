# Voygent demo — design system (extracted 2026-06-08)

Extracted from `web/src/theme.css`, `web/src/styles.css`, `web/src/skin-claude.css`
and the React components, to anchor the UI-redesign session. **We evolve this
system; we do not rewrite it.** Source of truth for tokens stays `theme.css`.

Concept: **"Departure Board × CLI"** — one warm token set, two motifs: airport
split-flap signage (travel-native) + amber/green CRT (engineering). No slate, no
pure black/white, no decorative gradients/blobs.

## Tokens (from theme.css)

- **Spacing** (8px base): `--s1 4` `--s2 8` `--s3 12` `--s4 16` `--s6 24` `--s8 32` `--s12 48`.
- **Type scale** (1.25 modular): `--t-12 .75rem` `--t-13 .8125` `--t-15 .9375` `--t-18 1.125` `--t-24 1.5` `--t-32 2` `--t-44 2.75`.
- **Radius**: `--r 8px` (boarding-pass); terminal surfaces stay square; pills `999px`.
- **Depth**: **borders-only** (`1px solid var(--line)`). Shadows reserved for the
  claude artifact/board cards (`0 1px 3px rgba(31,30,28,.05)`) and overlays. Don't add new shadows to the board/terminal side.
- **Fonts**: `--sans` Space Grotesk; `--mono` JetBrains Mono. Claude skin uses its
  own `--cl-sans` (system) + `--cl-serif` (Georgia) for assistant prose.
- **Color** (amber default): `--amber #f5a623` signature · `--amber-hi #ffcf6b`
  active/focus · `--phosphor #79d98a` ok/saved · `--red #f0746a` error. Surfaces
  `--board #0c0a07` (warm near-black, **not #000**) / `--board-2` / `--board-3`.
- **Numbers** are `font-variant-numeric: tabular-nums` + mono everywhere they're scanned.

## Themes (data-theme; 5-palette switcher, default `amber`)

`amber` (dark, default) · `phosphor` (green CRT) · `sodium` (warm grayscale) ·
`dusk` (aubergine) · **`paper` (the one light option)**. Each overrides only color
tokens; layout/motion are theme-agnostic.

**The light/dark axis = `paper` vs `amber`.** There is no separate binary toggle.

## Two-skin composition (data-skin)

- `board` skin: the amber-CRT "Departure-Board" product pane + Inspector. Tokens from theme.css.
- **`claude` skin (the live default, what the mockups reference):** a claude.ai-
  lookalike chat pane (`.product`, class namespace `cl-*`, **its own hardcoded
  `--cl-*` light tokens** — cream `#faf9f5`, white surfaces, terracotta `#c96442`
  accent) **beside** the Inspector (`.engineering`), which still reads the
  `data-theme` palette. Chat-turn structure already exists: `cl-msg-user` (right
  bubble) / `cl-prose` (serif assistant prose) / `cl-artifact` + `cl-board`
  (set-apart cards) / `cl-toolchip` (pills).

### Engineering Inspector section order (Inspector.tsx, when live)
head → headExtra(switchers) → Model routing → **Live this session** (pipe ·
timeline · scoreboard · cost · context-kept-out · observer-effect) → StoreOps →
Across-all-sessions → Deep dives.

## DESIGN DIRECTION — Neil's two non-negotiable corrections (encode as rules)

### Rule 1 — Light-mode telemetry must harmonize, never stark-contrast
The ChatGPT mockup paired a light chat with a **pure-black** engineering panel —
rejected. Two real states in THIS app:
- **Dark (amber theme):** cream chat + warm near-black amber-CRT inspector
  (`#0c0a07`, not `#000`) → already harmonized. Keep.
- **Light (`paper` theme):** today the inspector `--board` is `#f4f0e6` ≈ the
  chat's `#faf9f5` → the terminal **vanishes**. FIX: give the paper inspector a
  distinct **light-terminal** surface — a notch deeper/tinted than the chat
  (warm pale, ~`#e8e2d2`-ish), keep mono + a very faint scanline + restrained
  amber/green accents so it still reads as telemetry. "A notch away, not maximal
  contrast." Never `#000` on white.

### Rule 2 — It must obviously be a human↔AI conversation
Reject the mockup's "left side reads like a dashboard/folio." At minimum it must
be unmistakable that this is a chat between a human and the AI, with **AI
responses and artifacts clearly distinguished from the user's prompt** (claude.ai/
chatgpt-style turn structure, sender distinction, artifacts/cards set apart from
message text). The `cl-*` structure is the foundation — strengthen sender
distinction and artifact separation; do not let folio cards dominate the column.

### Rule 3 — Voygent-owned skin, restrained
Brand prominent over "simulated claude.ai," disclaimer preserved, host-chat-
inspired not cloned. Dense-but-readable engineering UI: compact tables, chips,
accordions, clear labels, restrained color. No gradients/blobs/AI flourishes.
Mobile preserved (panels stack < 760px; claude skin uses an engineering overlay + folio sheet).
