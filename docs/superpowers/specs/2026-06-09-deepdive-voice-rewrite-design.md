# Design — deep-dive page voice/structure rewrite (companion `-v2` pages)

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `deepdive-voice-rewrite`, branch off `main`)
**Brief:** `voygent-lite` branch `claude/fervent-edison-nzkyvq`,
`docs/summaries/handoff-2026-06-09-demo-deepdive-voice-rewrite.md` (the §-references
below point at it). The brief carries the voygent-lite "Source facts" §4 ground truth.

## Goal

Rewrite the engineering deep-dive pages in Neil's voice and a blog structure,
as **additive companion pages** so the originals stay for comparison. Neil does
the finishing pass manually; this produces first drafts with honest stubs.

## Decisions (confirmed)

- **Companion form:** a new slug per page in `worker/info/content.json`, e.g.
  `context-economics-v2`, rendered live at `/info/<slug>-v2`, editable in-place
  (the existing editor), portable to git via `scripts/info-content.mjs`. Originals
  untouched.
- **Process:** reference-first. Ship `context-economics-v2` alone, get Neil's
  voice sign-off, then batch the other nine.
- **Naming + index:** `-v2` suffix; an `engineering-v2` index page listing every
  companion (title + one-line summary + link), added to the footer nav, built in
  the batch phase once companions exist.
- **Scope:** the 10 engineering deep-dives. **Exclude `resume`** (it is a CV, not
  an engineering topic).

## Canonical voice sample

Neil supplied a full rewrite of the context-economics "Too many tools" opening
(2026-06-09 chat). That text is the **voice yardstick** — first person, dry,
numbers-first, no em-dashes, no "not X / it's Y" antithesis, no marketing
register, honest about dead ends (15+ abandoned versions since Oct 2024). It is
used near-verbatim as the spine of `context-economics-v2` and as the tone
reference for the other nine.

## Style rules (from brief §2)

Strip: em-dashes (→ comma/period/colon/parens); the "not X, it's Y" antithesis
(→ plain declarative); marketing words (seamless, powerful, robust, leverage,
unlock, delve, elevate, game-changing, blazing-fast, effortless), exclamation
points, rule-of-three cadence, overclaiming. Write: first person, concrete
problem + real numbers first, honest trade-offs, short-to-medium sentences,
plain connectives ("So", "Then", "The problem was").

## Per-page blog structure (brief §2.3)

1. The challenge. 2. Initial approaches and why I dropped them. 3. The solution
I run now, justified against the discards. 4. Future improvements (stub if none).
Keep each original's real technical content; rewrite voice + structure only.
Where a claim isn't backed by the brief's §4 facts, mark `> TODO(neil): …` — do
not invent specifics. Honor the §4.13 honesty ledger (label net-new/demo-only
work as planned, never as shipped-in-prod; never claim live bot-defeat for
Carnival-class BMP).

## Page → source-fact mapping (for the batch phase)

| companion slug | grounds in brief § | notes |
|---|---|---|
| context-economics-v2 | §4.4, §4.13, §2.2/§7 | DONE first (reference); too-many-tools + distillation + templates + patch + ADR-0007 finding |
| bot-defeat-v2 | §4.1, §4.2 | edge adapters, 5 Akamai postures, MSC SHA1 rotation, CPMaxx-nginx correction, JA3 excursion trio, Kasada (browser-only), falsification discipline |
| record-replay-v2 | original + §4.10 | demo-honesty; keep existing tech content |
| cost-engineering-v2 | §4.4, §4.8 | caching, budget gate, MCP $0-marginal; multi-model is net-new (honest) |
| production-system-v2 | §4.7, §4.9, §4.11, §4.12 | scale, commission firewall ref, QA judge harness, /onboard, telemetry |
| trip-integrity-v2 | §4.5, §4.6, ADR-0006 | guards + self-heal; commission firewall; price_sanity_check |
| data-stores-v2 | original | KV/D1/R2/DO; no dedicated §4 — rewrite existing voice/structure |
| llm-options-v2 | §4.8, §4.9 | provider seam; net-new toggle labeled honestly |
| phase-machine-v2 | §4.3 | server-managed checklist, one action per turn (batching times out) |
| subagents-v2 | original | email/offers agent; keep coming-soon framing |

## Mechanics

- Add slugs by script (`node` reads `content.json`, sets the new keys, writes
  2-space + trailing newline) to keep JSON valid; bodies authored as HTML
  fragments matching the existing house classes (`<h2>`, `<code>`, `<span
  class="stat">`, `<span class="artifact">sources:…</span>`, `<a class="cta">`).
- `isKnownSlug` already covers any key in `content.json`, so `-v2` pages render
  and are editable with no route changes.
- `engineering-v2` added to `INFO_NAV` (`worker/info/layout.ts`) in the batch phase.

## Testing / deploy

- `tsc --noEmit`, `vitest run` (info pages render; new slugs non-null + carry a
  `sources:` line / `TODO(neil)` where stubbed), `npm run build:web`, wrangler
  dry-run bundles `content.json`.
- Deploy reference page; Neil eyeballs `/info/context-economics-v2`. On sign-off,
  batch the nine + index, redeploy. Rebase onto latest `origin/main` (shared
  Worker; reel sessions active but client-only — no `worker/info` overlap).

## Out of scope

No edits to originals; no new routes; no rewrite of `resume`; no re-research of
facts beyond the brief's §4 + the originals.
