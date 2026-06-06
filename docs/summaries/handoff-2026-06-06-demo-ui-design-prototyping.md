# Session Handoff: Rapid-prototype demo UI design directions (HTML mockups, hosted)

**Date:** 2026-06-06
**Repo:** `~/dev/voygent-demo` (the portfolio demo; live at https://voygent-demo.somotravel.workers.dev)
**Type:** Design exploration — brainstorm + rapid static HTML mockups. NOT production wiring yet.

## Goal (Neil's words, distilled)
Produce a **thoughtful, impactful UI that does not look like AI slop** for the voygent-demo. Explore **several
design-language variations tuned to different audiences while keeping one coherent theme.** Neil specifically
likes the idea of a **CLI/terminal-style display for the engineering boards** (the Inspector). Deliver as
**quick standalone HTML mockups, hosted so Neil can view them remotely** (he's often away from the box).

This is a résumé piece — the UI craft is itself part of the pitch. The current demo UI is functional but plain
(plain header, basic chips, a dark Inspector drawer); the bar here is **distinctive + production-grade**, not
another generic chat-with-cards layout.

## What exists today (the thing being redesigned)
The shipped demo SPA (`web/src/`): `App.tsx` (header + 2-col chat/folio + Inspector drawer), `ChatView.tsx`
(welcome chips + bubbles + tool chips), `FolioPanel.tsx` (flight/hotel cards), `Inspector.tsx` (3-region
drawer: Live this session / Behind the scenes / Business case — orchestration graph, tool timeline,
scoreboard, cost+tier table, context-saved, observer-effect), `styles.css` (current look: light app, dark
`#0f172a` Inspector). The spec `docs/superpowers/specs/2026-06-06-engineering-inspector-design.md` has an ASCII
mock of the Inspector that already hints at the CLI aesthetic — reuse that as a seed.
**Don't restyle the React app in this session** — this is mockup-first exploration to pick a direction; wiring
the winner into `styles.css`/components is a later session.

## Use the design tooling (this is what keeps it from looking like slop)
1. **`superpowers:brainstorming`** to open — and **accept its Visual Companion** (browser-based mockup
   companion) so you can show Neil options live. Ask audience/theme questions one at a time.
2. **`interface-design:init`** (or `:extract` from the current `styles.css`) to establish a real **design
   system** first — type scale, color tokens, spacing, motion, components — so the variations are one product,
   not four unrelated skins. `interface-design:status` to check state.
3. **`impeccable:frontend-design`** to generate the actual mockup HTML with craft (it's explicitly tuned to
   avoid generic AI aesthetics). Follow with **`impeccable:i-critique` / `i-polish` / `i-bolder` /
   `i-quieter`** to tune each variation's intensity to its audience.
4. Keep everything **standalone static HTML/CSS** (inline or one shared `mockups/_system.css`) — no React, no
   build step — so iteration is instant and hosting is trivial.

## The design brief (starting point — refine in brainstorming, don't treat as final)
**One theme, audience-tuned surfaces.** Candidate unifying themes to put in front of Neil (pick/blend one):
- **"Instrument panel / control room"** — travel meets live telemetry; the agent's work is shown as gauges,
  a live tail, a pipeline. Fuses the travel product with the engineering story.
- **"Departure board / boarding pass"** — split-flap / airport-signage motif for the travel surfaces, which
  pairs naturally with…
- **Terminal/CLI for the engineering boards** (Neil's lead): monospace, box-drawing (`├─ ● ─▶`), phosphor
  green/amber on near-black, a `wrangler tail`-style live log, the orchestration graph as an ASCII pipeline
  that lights up stage-by-stage, the scoreboard as a `htop`/`btop`-style panel. This is the hero for the
  technical-interviewer cut.

**Audience variations (same tokens/theme, different emphasis + tone):**
- **Technical interviewer / staff engineer** — Inspector is the hero; terminal-forward, dense, "every number
  is real." Lead with the engineering boards.
- **Non-technical recruiter** — the **live folio building itself** is the hero (the 2-second "wow"); warmer,
  more spacious; Inspector is a tasteful, optional reveal, not the front door.
- **Investor / founder** — the **business-case + scoreboard** ("$0 marginal", subscription-vs-API) forward;
  confident, metric-led.
- **Travel-industry / product** — folio quality + supplier breadth forward; trustworthy, polished, less
  terminal.
(Source for audience framing: `~/dev/voygent-lite/docs/strategy/2026-06-05-demo-feature-discovery-findings.md`
§4 "Per-audience tailoring".)

**Anti-slop guardrails:** a real type scale (not default system stack everywhere), intentional color tokens
(not Tailwind-default indigo), purposeful motion (stage lighting, count-ups — `impeccable:i-animate` if it
earns its place), generous and consistent spacing, and ONE distinctive signature element per theme. Avoid:
gradient-on-everything, emoji-as-design, centered-card-soup, the generic "AI assistant" purple.

## Hosting the mockups (so Neil can view them remotely)
Recommended **rapid** path — serve them as static assets off the already-deployed demo Worker:
- Drop mockups in `web/public/mockups/` (vite copies `web/public/*` to `dist-web/` root on build), e.g.
  `web/public/mockups/interviewer.html`, `recruiter.html`, `investor.html`, `travel.html`, plus a
  `mockups/index.html` linking them.
- `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy` →
  reachable at `https://voygent-demo.somotravel.workers.dev/mockups/<name>.html`.
- **GOTCHA to verify first:** the Worker uses Workers Static Assets serving `dist-web`. Confirm the
  `wrangler.toml` `[assets]` config / `not_found_handling` serves a real `.html` file directly rather than
  SPA-rewriting every path to `index.html`. If it rewrites, either adjust the assets config for the
  `/mockups/*` prefix or serve them via a tiny explicit route in `worker/index.ts`. (I did NOT verify this
  config this session — check it before assuming the URL works.)
- **"On voygent.ai" proper:** the apex/`demo.voygent.ai` is the prod-Worker domain and `demo.voygent.ai` is
  blocked by the `*.voygent.ai` wildcard → prod Worker (deferred, needs CF-dashboard coordination — see the
  Phase-6 note in `handoff-2026-06-06-phase3-next.md`). So for now the demo `*.workers.dev` URL is the
  pragmatic reachable host; **confirm with Neil** whether the workers.dev URL is fine for review or whether he
  specifically needs the voygent.ai domain (which is a separate infra task). Don't block the design work on it.

## Deliverables for this session
1. A short **design-system note** (tokens + the chosen theme rationale) — `docs/` or inline in the mockups.
2. **4 audience-tuned mockups + an index**, static HTML, hosted + reachable, with the **CLI/terminal Inspector**
   realized in at least the interviewer cut.
3. A brief **recommendation** to Neil: which direction to wire into the React app next, and why.
4. Commit the mockups (stage by name; this repo deploys from `main`, no remote).

## Constraints / notes
- Mockups are **throwaway exploration** — favor speed + visual range over reuse; the winner gets reimplemented
  in React later, so don't over-engineer the HTML.
- Keep content **honest** even in mockups (the demo's whole thesis): use realistic numbers from the real
  Inspector, not invented "10000x faster" hype.
- Don't touch `web/src/` production components or `styles.css` this session (mockups only).
- This is design/taste work — a good fit to **keep on Claude + the design skills**, and to show Neil options
  via the visual companion rather than guessing his taste. Ask before committing to a single direction.

## First actions
1. `superpowers:brainstorming` + accept the Visual Companion; ask Neil: preferred unifying theme? how
   terminal-forward overall vs. terminal-only-for-Inspector? workers.dev URL OK or must be voygent.ai?
2. `interface-design:init` to lay down tokens/system from the answers.
3. `impeccable:frontend-design` to build the interviewer (CLI/Inspector-hero) mockup first — it's the riskiest
   and most distinctive — host it, get Neil's reaction, then fan out the other three audiences off the same
   system.
