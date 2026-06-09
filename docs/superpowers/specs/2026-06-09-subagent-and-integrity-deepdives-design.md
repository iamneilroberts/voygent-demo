# Design — Subagent + Trip-Integrity deep-dive pages (and engineering-view wiring)

**Date:** 2026-06-09
**Repo:** voygent-demo (worktree `demo-subagent-deepdives`, branch off `main`)
**Status:** approved design, ready for implementation plan

## Goal

Extend the demo's `/info/*` "deep-dive" set so the engineering view's existing
elements all have a story to click into, and add a forward-looking "coming soon"
page about subagents that handle routine advisor drudge work without taking the
human out of the loop. Three product topics were identified as missing or
under-linked; all three are actioned here.

## Context (what exists today)

- Deep-dive pages are worker-served standalone HTML at `/info/<slug>`, content in
  `worker/info/pages.ts`, shell in `worker/info/layout.ts` (`INFO_NAV` footer nav).
- The engineering view (`web/src/Inspector.tsx`) links a curated subset via
  `INFO_LINKS` (7 of the 8 substantive topics — omits `phase-machine`) and shows
  live stats (`MCP tools exposed`, `tools used`, `persisted writes`,
  `context kept out`, `observed cost`, `validation X/Y`), a stage rail
  (Create→Search→Distill→Stage→Promote→Render), a **Trip integrity ✓/↻/✗** block,
  and a Workflow-engine trail.
- House style for every page: amber/green theme, `<h2>` sections, a `<blockquote>`
  punchline, a `<span class="artifact">sources: …</span>` line citing **real**
  repo artifacts, a closing `.cta`. The honesty discipline: *every claim names its
  source; shipped is stated as shipped, proposals as proposals.*

## Changes

### 1. New page `subagents` — "Subagents for the drudge work"

Subtitle: *Routine inbox-and-offers toil, handled by an agent that proposes and
never disposes — the advisor stays in the loop by construction.*

Sections:
- **The shipped one: the offers inbox.** The real `voygent-mailagent` system:
  IMAP IDLE watcher running **read-only (`EXAMINE` only** — a `STORE`/`MOVE`/
  `EXPUNGE`/`APPEND` is treated as a bug), Haiku-4.5 classifier over 13 categories
  (confidence `<0.6` → `UNCERTAIN`), two-pass promo extraction that **already
  POSTs structured offers into voygent-lite's offers index**, a trip-linker
  pulling active trips from the Voygent API, and a **deterministic 06:00 digest**
  (zero LLM — pure SQL→markdown). Live numbers: ~3,700 messages ingested, ~2,300
  classified, ~$4.50 of Haiku to date. A DeepSeek-V4-Flash classifier runs in A/B
  against Haiku, judged by Sonnet.
- **Propose, never dispose.** `DRY_RUN` is the default and the only Phase-1 value.
  The `actions` table records *proposed* actions; `executed_at` stays `NULL`. The
  advisor triages from a digest / mobile-triage web app; nothing touches the
  mailbox or a client until the human acts. Codified constraint hierarchy:
  *mailbox safety > classification correctness > feature completeness > speed.*
- **Coming soon — the roadmap.** Clearly labeled forward-looking. Candidate
  advisor-in-the-loop subagents: offers ingestion surfacing into trip-building;
  an **adapter-audit watchdog** (the `/onboard --audit` drift detector run on a
  schedule, filing an issue when a shipped adapter drifts); a **trip-integrity
  sweeper** (links to page #2). The through-line: each is drudge work; each only
  ever *proposes*; the advisor keeps the final call.
- Blockquote: the human-in-the-loop principle as an engineering property, not a
  policy promise.
- `sources:` — `~/dev/email` (`deploy/voygent-mailagent-watcher.service`,
  `src/mailagent/classification/`, `extraction/promo.py`, `digest/generator.py`,
  CLAUDE.md hard-rules + constraint hierarchy) · voygent-lite `manage_offers` /
  offers index.
- CTA: back to the live demo.

`INFO_NAV` entry carries a "coming soon" cue in copy; the page itself states
plainly which parts are shipped vs. roadmap.

### 2. New page `trip-integrity` — "Trip integrity: the data is the product"

Subtitle: *A weak model will ship a blank or fabricated proposal unless the
server won't let it. Voygent owns data quality end-to-end.* (ADR-0006)

Sections:
- **Lite owns it end-to-end.** Reverses the old "Lite writes raw JSON, Pro
  reconciles" split — data-quality findings are Lite bugs, fixed at the source.
- **Guard, don't hope.** Server-side `validateAndCleanTripData`, `reconcilePricing`,
  the **empty-decisions guard** on `preview_folio_board`, the decisions builder
  (`buildDecisions`), and `completenessHint` `_meta` nudges — the server refuses
  to render a blank or under-populated folio.
- **Advisory vs. blocking.** `patch_trip`'s `consistencyWarnings[]` (amber,
  non-blocking) versus the hard guards that stop a publish.
- **Self-heal.** The `/proposal/unknown` 404 fix via `meta.tripId` stamping;
  duplicate-bookings normalization; double-encoded-HTML-entity cleanup — these
  are the **"↻ repaired"** outcomes the engineering view already surfaces.
- **Hooks to the live panel.** Explicitly ties to the `validation X/Y` stat and
  the `Trip integrity ✓/↻/✗` block, which currently have no page to click into.
- Blockquote: honesty/data-quality as a structural invariant, distinct from the
  demo's record/replay honesty (production guards, not demo fixtures).
- `sources:` — voygent-lite `docs/adr/0006-lite-owns-data-integrity-end-to-end.md`,
  `validateAndCleanTripData`, `preview_folio_board` empty-decisions guard,
  `patch_trip consistencyWarnings`, the `/proposal/<tripId>` self-heal.
- CTA: watch the integrity checks run live.

### 3. Extend `context-economics` — strengthen consolidation + new schema section

**3a. Make the router-consolidation section current and honest about the wave.**
The existing section frames the ~70→~35 collapse as already-done ("collapsed").
Reality is a risk-sequenced, *verify-then-remove* migration in flight, which is a
better story: a **cruise pilot shipped first** (`cruise_search` + `cruise_detail`
replacing ~18 standalones, −17 catalog names, live in prod), a **five-domain
fan-out following** (flight / hotel / package / car / excursion routers), and the
**old per-supplier tools retired only after each router is verified against the
adapters** — which is the work a parallel session is doing right now. Tie the
narrative to the `MCP tools exposed` stat: the count drops as each wave lands.
Frame the deletion discipline (don't remove a standalone until its router is
proven equivalent) as the point, not an aside.

**3b. New `<h2>` "Schemas are context too."** The intent-routed schema-discriminator
finding (ADR-0007, **proposed / measured — not yet in `src`**, stated honestly as
a finding from the schema-eval harness): replacing a literal `source` enum with a
semantic `need` discriminator plus a server-side `INTENT_MAP` cut schema tokens
~54% while holding dispatch accuracy across five models. Complements 3a — fewer
tools *and* leaner schemas per tool.

Update the page's `sources:` line to add the cruise pilot (PR #167), the M1
fan-out, and the ADR-0007 reference.

### 4. `Inspector.tsx` `INFO_LINKS` wiring

- Add `phase-machine` (currently missing despite its page pointing readers to the
  Engineering panel's Workflow-engine trail).
- Add `trip-integrity`.
- Add `subagents` with a new optional `comingSoon?: boolean` field on the
  `INFO_LINKS` item type, rendered as a small "soon" chip next to the label.
  Minimal CSS for the chip (reuse existing inspector chip/tag styles if present).

### 5. `layout.ts` `INFO_NAV` wiring

Add `trip-integrity` (placed near `production-system`) and `subagents` (after it)
to the footer nav so both pages are reachable from every `/info/*` page and the
footer of the demo.

## Testing

- Extend `worker/info/pages.test.ts` to assert the two new slugs render non-null
  HTML and contain a `sources:` artifact line; assert `infoPageHtml("subagents")`
  and `infoPageHtml("trip-integrity")` are non-null.
- If an Inspector unit test exists, assert the `comingSoon` chip renders for
  `subagents`; otherwise rely on typecheck + a manual render check.
- `npx tsc --noEmit` (or repo's typecheck script) + `vitest run` green.

## Out of scope

- No new live data sources in the demo (the offers feed is described, not wired
  into the demo session).
- No business-model/strategy pages (warm-lead handoff, etc.).
- The annotation-driven polish loop page is recommended for later, not built here.

## Honesty checklist (house discipline)

- `subagents`: shipped parts (mailagent IMAP/classifier/digest/offers POST,
  the live counts) stated as shipped; the roadmap clearly labeled coming-soon.
- `trip-integrity`: all guards cited to real voygent-lite artifacts/ADR-0006.
- `context-economics` addition: ADR-0007 marked **proposed/measured, not shipped**.
