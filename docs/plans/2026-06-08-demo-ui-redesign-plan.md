# Demo Site UI Redesign — Plan for a New Session

**Date:** 2026-06-08
**For:** the next session, executing in the **demo repo** (`/home/neil/dev/voygent-demo`).
**Method:** the Claude Code **interface-design** skill set, driven by the ChatGPT feedback + Neil's design direction below.
**Live site:** https://voygent-demo.somotravel.workers.dev/ · **Audience:** technical hiring reviewers judging AI-app architecture, MCP/tool orchestration, persistence, validation, model routing, cost control, and production-minded UI.

---

## ⚠️ READ-FIRST facts (easy to get wrong)

- **The demo is its OWN repo: `voygent-demo`** (`/home/neil/dev/voygent-demo`). It is **NOT** part of `voygent-lite`. File tree is `worker/ web/ shared/ docs/` (no `src/`). The web UI is a **Vite React SPA** under `web/src/`.
- **`demo-enrichment` is the LIVE prod branch** (deployed Worker `voygent-demo`). **Do all work on a new branch off `demo-enrichment`; do NOT commit on `demo-enrichment` directly, and do NOT deploy — Neil drives the deploy.** Recommended: `/branch demo-ui-redesign` (worktree) off `demo-enrichment`.
- The main demo clone currently has **unrelated uncommitted WIP on `main`** (`docs/worktree-journal.md`, `docs/Neil_Roberts_FDE_Resume.md`) and a separate `phase-machine` worktree — **do not touch those.** Branch off `demo-enrichment`, not `main`.
- **Inputs are co-located in THIS repo** under `docs/plans/` (copied 2026-06-08 from `voygent-lite/docs/plans/`): the ChatGPT brief `2026-06-07-ChatGPT-demo-site-feedback.md`, and the mockups `darkmode-mockup.png` + `lightmode-mockup.png`. Read all three at the start. (Originals also live in `voygent-lite/docs/plans/`.)
- Demo recently shipped (2026-06-07/08): LLM-agnostic provider seam (live Claude + DeepSeek, grayed Ollama), a projected **KV/D1 store-ops widget**, `byModel.other` cost bucket, and two `/info` deep-dive pages. The Engineering/Inspector panel already renders most of the telemetry the mockups want — this is a **redesign of presentation, not a rebuild of the data.**

---

## The North Star (what "better" means here)

Make the demo read less like "travel chatbot" and more like **"a credible MCP-based AI application with real engineering depth."** Restrained, dense-but-readable engineering UI. No marketing gloss, no decorative gradients/blobs/AI flourishes. The chat/demo stays the primary first screen.

Two surfaces, side by side:
1. **A clearly Claude/ChatGPT-like chat** (left) — the human↔AI conversation that builds a trip.
2. **An engineering telemetry panel** (right) — terminal-evoking, showing the system working live.

---

## Neil's design direction (authoritative — corrections to the ChatGPT mockups)

Neil reviewed the two ChatGPT mockups. **He likes the overall design concept** (the 10-second telemetry summary strip, tool timeline, model routing, cost methodology, versioned run data). But four corrections are non-negotiable:

1. **Light mode must not be stark.** The `lightmode-mockup.png` pairs a light chat panel with a **pure-black** engineering panel — too much contrast. In light mode the engineering panel should still **read as telemetry and evoke a terminal**, but **harmonize** with the light chat side (e.g. a soft tinted/off-dark or a light-terminal treatment — monospace, subtle tint, restrained amber/green accents — not pure `#000` against white).
2. **Don't drift from Claude.** The mockups went **too far** from the familiar host-chat look. At a **minimum** it must be **obvious there is a chat interface between a human user and the AI**, with **AI responses and artifacts easily visually distinguished from the user's prompt/initial message** — exactly like claude.ai and chatgpt (clear turn structure, sender distinction, artifacts/cards set apart from message text). The light mockup's left side reads like a dashboard/folio; it must read like a **conversation**.
3. **Keep the design concept** otherwise — the engineering content and layout ideas from the mockups are good; evolve them, don't discard them.
4. (From the ChatGPT brief, reinforced) **Make the Claude-like skin feel owned by Voygent** — keep the familiar chat interaction, but Voygent brand prominent over "simulated claude.ai," preserve the disclaimer, not a literal clone.

> Treat the mockups as **concept reference, not pixel spec.** Mine them for the engineering-panel information architecture; reject their chat-clarity and light-mode-contrast choices.

---

## Method: use the interface-design skill, don't freehand it

This is the point of the session — apply the **interface-design** skill set rather than ad-hoc CSS edits. Suggested flow:

1. **`interface-design:extract`** — point it at the existing `web/src/*.css` (`styles.css`, `skin-claude.css`, `theme.css`) and components to produce a **`system.md`** capturing the current tokens, the terminal/CRT aesthetic of the Inspector, the Claude-skin patterns, and the light/dark theme variables. This anchors the redesign to what exists so we **evolve, not rewrite**.
2. **Set design direction** in the system: codify the two corrections above as rules (chat-turn clarity; light-mode telemetry harmonization). Define the **light-mode terminal treatment** explicitly (off-dark/tinted surface + mono + accent scale that sits a notch away from the chat surface, not maximal contrast).
3. **Design the two-pane composition** for both modes: chat-clarity pattern (user vs assistant turns, assistant artifacts/cards as distinct blocks) + the engineering panel's **10-second summary strip** over the existing detail sections.
4. **Implement against existing components** — prefer editing `ClaudeChatView.tsx`, `Inspector.tsx`, `FolioPanel.tsx`, and the three CSS files over new components. Keep `theme.css` the single source of light/dark tokens; keep the `inspector term crt` lineage but retune it for light mode.
5. **`interface-design:audit`** then **`interface-design:critique`** passes for spacing/depth/color/pattern consistency and craft. Optionally `impeccable:i-polish` as a final pass. Preserve **mobile usability** throughout (the SPA stacks panels under 760px).

> If `interface-design` is not the exact installed skill name, the available set includes `interface-design:init / :extract / :audit / :critique / :status` and `impeccable:frontend-design`. Use `:extract` first (existing app), then the umbrella build skill, then `:audit`/`:critique`.

---

## Content / UX requirements (from the ChatGPT brief, mapped to this redesign)

The brief's 8 items, sorted into **this UI plan** vs **companion data fix**:

**UI/copy — in scope for the design session (items 2–8):**
- **Engineering panel readability (#3):** add a concise **summary strip** near the top — MCP tools exposed · tools used this run · persisted writes · tokens avoided / context kept out · actual cost · model routing active · validation checks. Raw event detail stays below (don't remove telemetry). This is the mockups' best idea — build it well.
- **Cost language clarity (#4):** separate exact from estimated. Labels: **"Observed routed cost"**, **"Counterfactual estimate"**, **"Deterministic render estimate"**, **"Context kept out of model."** Keep numbers; make methodology legible. (We already split measured vs counterfactual + the `other` bucket — surface that distinction in the UI.)
- **Validation / Trip Integrity section (#2):** a compact panel showing checks — arrival date resolved · no activity before arrival · hotel nights match stay window · selected options persisted · folio projection rebuilt. Include ≥1 validation event in the replay; an honest "repaired" state for the arrival/activity issue is OK if **not theatrical**.
- **First-screen positioning (#5):** a small, tasteful signal it's not just a chatbot — e.g. "Live MCP tool orchestration, persisted trip state, model routing, and cost/context telemetry." Subtle; **not a landing page**.
- **Voygent-owned Claude skin (#6):** brand prominent, disclaimer preserved, host-chat-inspired not cloned. (Directly serves Neil's correction #2/#4.)
- **Copy tightening (#7):** fix `estiamated`→`estimated`, `hallucenations`→`hallucinations`, awkward/cute copy. Replace "This interface was itself built by a coding agent" with **"Built with coding-agent workflows; architecture, constraints, and review by Neil Roberts."**
- **Restraint (#8):** compact tables, chips, accordions, clear labels, restrained color. No gradients/blobs/flourishes. Mobile preserved.

**Companion DATA/logic fix — separable, but needed so screenshots are honest (item #1):**
- **Itinerary consistency in the Dublin replay/folio:** flight departs MOB 2026-10-12, arrives Dublin morning 2026-10-13, but the folio shows "Arrive Dublin" 10-12 with same-day activities. Fix the simulation fixture and/or folio projection so Oct 12 = outbound travel (no Dublin activity), Oct 13 = arrival, no full-day activity before local arrival, final folio internally consistent. **This is in the fixtures/folio projection, not the design system** — land it alongside (it's also what the new Validation section will visibly check). Treat as a small separate commit so the design work stays clean.

---

## Existing code touchpoints (grounding)

- **Chat surface:** `web/src/ClaudeChatView.tsx` (the claude-skin transcript), `web/src/ChatView.tsx` (board-skin), `web/src/ClaudeToolChip.tsx`, `web/src/prose.tsx`. Skin selection: `web/src/lib/skin.ts` + `SkinSwitch.tsx`. **The "obvious human↔AI turn structure" lives here.**
- **Engineering panel:** `web/src/Inspector.tsx` (the `inspector term crt` terminal aesthetic; already renders tools/turns/savings/overhead/stores/stats + the new `byModel.other`). **The summary strip + validation section + cost-language live here.**
- **Folio/artifacts:** `web/src/FolioPanel.tsx`. **Artifact-vs-message distinction.**
- **Theme/tokens:** `web/src/theme.css` (light/dark CSS variables) + `ThemeSwitch.tsx` + `lib/theme.ts`. **Light-mode terminal harmonization is primarily a `theme.css` job.**
- **Base + skin CSS:** `web/src/styles.css`, `web/src/skin-claude.css`. **`extract` should read all three.**
- **Layout:** `web/src/App.tsx` composes the panes; responsive stacking < 760px is already in `styles.css`.

---

## Acceptance criteria

- A reviewer landing on the live site can tell in ~10 seconds: this is an MCP app with real telemetry (summary strip), and there is a real human↔AI **conversation** building the trip (clear turn/sender/artifact distinction in both light and dark).
- **Light mode:** engineering panel reads as terminal/telemetry but does **not** stark-contrast the chat (no pure-black-on-white pairing). Dark mode: cohesive, the terminal aesthetic intact.
- Cost methodology is legible (observed vs counterfactual vs deterministic-estimate vs context-kept-out), no overclaimed precision.
- Validation/Trip Integrity section present with honest checks; Dublin folio dates internally consistent.
- Copy fixes applied; brand owned; disclaimer preserved; no decorative flourishes; **mobile still usable**.
- `npm test` + `npx tsc --noEmit` + `npm run build:web` all green. Local `npx wrangler dev` smoke of the replay + both themes + mobile width.

## Verification (run these)
- `npm test` · `npx tsc --noEmit` · `npm run build:web`.
- `npx wrangler dev` (reads `.dev.vars`); drive the autoplay/replay and the `?skin=claude` mode; toggle light/dark; check < 760px. Confirm the replay completes and **folio dates are correct**.
- If a browser MCP (chrome-devtools) is available, screenshot light + dark, desktop + mobile, for before/after.

## Scope boundaries & ownership
- **Do not** rewrite unrelated architecture or remove useful raw telemetry. **Do not** fake metrics — label estimates as estimates.
- **Do not deploy.** Land on the branch, get Neil's review; **Neil drives `npm run build:web && npx wrangler deploy`** and any prod redeploy. (Published `/info` pages are pre-rendered server-side; a deploy refreshes them.)
- Keep the LLM-agnostic + store-ops + `/info` work intact; this is a presentation layer pass over it.

## First steps for the new session
1. `cd /home/neil/dev/voygent-demo`; create a worktree/branch off **`demo-enrichment`** (e.g. `/branch demo-ui-redesign`). `npm install`; confirm `npm test` + `npx tsc --noEmit` green baseline.
2. Read `voygent-lite/docs/plans/2026-06-07-ChatGPT-demo-site-feedback.md` + both mockup PNGs. Optionally copy them into `voygent-demo/docs/`.
3. Run **`interface-design:extract`** over `web/src/*.css` + components → `system.md`. Encode Neil's two corrections as system rules.
4. Design → implement → `:audit`/`:critique`/polish per the Method section, item by item, verifying after each.
5. Land the itinerary-consistency data fix as its own commit. Keep the branch clean for Neil's review.
