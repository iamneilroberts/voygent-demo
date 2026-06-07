# Design: Per-phase model selector + mobile engineering panel

**Date:** 2026-06-07 · **Repo:** `~/dev/voygent-demo` (worktree `demo-enrichment`) · **Status:** approved (brainstorm)

## Goal
Let a demo visitor choose which Claude model drives the agent — either a single model for the whole session, or **Voygent smart routing** that assigns a model per trip *phase*. Surfaces Voygent's cost-engineering story interactively. Also fix: the Engineering Inspector is unreachable on mobile.

## Key constraint that shapes the feature
Tools execute **deterministically server-side** — they do not invoke a model. The model only *decides* tool calls during a turn, and the driving model is chosen *before* the turn streams. So model selection is **per turn**, and a turn's "phase" must be derived from **promote milestones the session has already reached**, never from tools the turn will call.

## Phases (data-driven, milestone-derived)
Checked before each turn from DO milestone state:
- **`discovery`** — hotels not yet locked (search + judge + recommend flights, then hotels). Reasoning-heavy → default **Sonnet**.
- **`enrichment`** — hotels locked (`promote_hotels_to_lodging`, or in live mode a `lodging` patch, has landed). Recipe-driven L1–L4 sequence → default **Haiku**.

The phase→model map is a plain object, so more phases are config-only later. The milestone flips *mid-exchange* (the hotel-pick exchange stages/promotes under `discovery`, then its enrichment turns run under `enrichment`) — exactly the routing working; the loop re-resolves the model before every turn.

## Selector modes (UI)
A new `ModelSwitch` in the existing switch cluster (claude skin: Inspector `headExtra`, beside Advisor/Theme; board skin: page header):
- `Haiku` / `Sonnet` / `Opus` — single model, whole session.
- `Smart` (**default**) — uses the phase map. The Inspector renders the map with the **active phase highlighted** and a **per-phase dropdown** so the visitor can reassign any phase's model live (applies to the next turn).

Resolution mirrors `lib/mode.ts` / `lib/advisor.ts`: `?model=` + `?routing=` URL params → localStorage → default (`smart`).

## Data flow
- **Frontend → worker:** each `/chat` body gains `model?: ModelId` and `routing?: { discovery: ModelId; enrichment: ModelId }`. Per-request (a change applies to the next turn). `mode` (boards) stays as is.
- **`LLMProvider.stream(messages, tools, opts?: { model?: string })`** — optional per-call model override (interface + `ClaudeProvider`; `ClaudeProvider` falls back to its constructor model). Loop stays provider-agnostic.
- **Loop:** new optional `nextModel?: () => string` arg; called before each `provider.stream` and the resolved model passed via `opts.model`. The resolved model is **stamped on each turn's inspector turn event** (`kind:"turn"` gains `model`), so cost-by-model is accurate per turn (today it assumes one model/session).
- **session-do:** builds a routing resolver from the request body + `this.routing`; tracks `this.hotelsPromoted` (set in the `callTool` wrapper when `promote_hotels_to_lodging` lands, or a live-mode `lodging` patch — reuse the nudge's `hotelLanded` logic); `nextModel()` = `routing.mode === "single" ? routing.model : map[ this.hotelsPromoted ? "enrichment" : "discovery" ]`. Persist `routing` + `hotelsPromoted` in `SessRecord`.

## Cost panel
`estimateCostUsd(model, usage)` already keys on model. Per-turn cost now uses that turn's stamped model, so `sessionCostByModel` splits across Haiku/Sonnet/Opus — visibly demonstrating the routing win. `withInspectorCost` takes the turn's model instead of the session model.

## Mobile (bug fix, bundled)
**Root cause:** `skin-claude.css:211` (`:root[data-skin="claude"] .stage[data-eng="live"]`, specificity 0,4,0) out-specifies the `@media (max-width:760px)` stack rule (`.stage[data-eng="live"]`, 0,2,0), so the claude skin stays two-column on phones and the Inspector is pushed off-screen.
**Fix:** mobile-only segmented control (`chat | engineering`) under 760px. New `mobileView` state (`"chat" | "engineering"`, default `"chat"`) drives a `data-mview` attribute on `.stage`; CSS under the media query shows one section at a time full-height and hides the other. Tabs render only at mobile width (CSS `display` toggle). Desktop layout untouched. The new media-query rules carry enough specificity (`:root[data-skin="claude"] .stage[data-mview="chat"] ...`) to beat line 211.

## Components / files
- `web/src/lib/model.ts` (new) — `ModelId`, `RoutingMode`, `PhaseModelMap`, defaults, `resolve*`/`persist*`, `resolveModelForPhase`.
- `web/src/lib/model.test.ts` (new) — resolution + phase routing.
- `web/src/ModelSwitch.tsx` (new) — global mode control (switch-cluster chrome).
- `web/src/Inspector.tsx` — smart-routing map (active-phase highlight + per-phase dropdowns); accept routing props.
- `web/src/App.tsx` — model/routing/mobileView state; thread into `streamChat`, ModelSwitch mounts, Inspector, mobile tabs.
- `web/src/lib/mobile-view.ts` (new) — `mobileView` resolution (small, testable).
- `web/src/styles.css` / `skin-claude.css` — mobile tabs + view-toggle rules; ModelSwitch chrome.
- `worker/llm/provider.ts` — `stream` opts; `InsTurn`-side `model`.
- `worker/llm/claude.ts` — honor `opts.model`.
- `worker/agent/loop.ts` — `nextModel?` arg; pass per-turn model; stamp model on turn event.
- `worker/session-do.ts` — parse `model`/`routing` from body; `hotelsPromoted` tracking; `nextModel()`; per-turn cost by stamped model; persist in `SessRecord`.
- `worker/session-store.ts` — `SessRecord.routing` + `hotelsPromoted`.
- `shared/events.ts` — `InsTurn`/turn inspector event gains `model?: string` (if the turn event type lives in shared) — else `web/src/Inspector.tsx` `InsTurn`.

## Testing
- `lib/model.test.ts`: param>storage>default; single vs smart; `resolveModelForPhase(map, phase)`.
- `lib/mobile-view.test.ts`: resolution + default chat.
- worker: loop calls `nextModel()` per turn and forwards `opts.model` (extend `loop.test.ts`); `ClaudeProvider` request body uses the override (existing claude test pattern); session-do phase flip (discovery→enrichment after hotel promote) if cheaply unit-testable, else covered by the prod boards smoke.
- Regression: full `vitest run` + `tsc --noEmit`; prod boards smoke after deploy.

## Zero-fabrication / invariants (unchanged)
No change to replay, the patch sanitizer, the board allowlist, or the commission firewall. Model routing is orthogonal — it changes *which* model reasons, not *what data* may enter the folio.

## Out of scope (YAGNI)
- Per-*tool* model (impossible — tools are server-side).
- More than two phases (config-extensible; ship two).
- Opus in the default smart map (available to pick; not a default).
- Cross-provider (the `LLMProvider` seam already allows it later).
