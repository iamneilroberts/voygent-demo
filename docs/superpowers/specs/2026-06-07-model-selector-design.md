# Design: Per-phase model selector + mobile UX (engineering panel, folio link, scroll)

**Date:** 2026-06-07 · **Repo:** `~/dev/voygent-demo` (worktree `demo-enrichment`) · **Status:** brainstorm + Codex design review incorporated; awaiting final user sign-off

## Goal
Let a demo visitor choose which Claude model drives the agent — either a single model for the whole session, or **Voygent smart routing** that assigns a model per trip *phase*. Surfaces Voygent's cost-engineering story interactively. Bundle a mobile-UX fix: the Engineering Inspector is unreachable, the inline Trip Folio crowds the chat and causes glitchy scrolling, and demo chrome overlaps the composer.

## Codex design review (incorporated)
A `/codex-review focus=design` pass produced 8 findings; all are folded in: stricter outcome-based phase flip (#1), terminology = chat-exchange/next-provider-turn (#2), keep counterfactual `costByModel` AND add measured `actualCostUsd` (#3), thread model into `onUsage` (#4), prompt-cache caveat surfaced in UI (#5), server-side model allowlist + hydrate-recovery of the milestone (#6), CSS-only mobile visibility with sufficient specificity (#7), Opus gated behind `DEMO_OPUS_ENABLED` (#8). Two Codex suggestions were **declined per explicit user direction**: dropping the visitor selector (the selector *is* the request) and replacing the mobile overlays with a pure CSS specificity tweak (the user chose interactive tabs/links).

## Key constraint that shapes the feature
Tools execute **deterministically server-side** — they do not invoke a model. The model only *decides* tool calls during a turn, and the driving model is chosen *before* the turn streams. So model selection is **per turn**, and a turn's "phase" must be derived from **promote milestones the session has already reached**, never from tools the turn will call.

## Phases (data-driven, milestone-derived)
Resolved before each **provider turn** from DO milestone state:
- **`discovery`** — hotels not yet locked (search + judge + recommend flights, then hotels). Reasoning-heavy → default **Sonnet**.
- **`enrichment`** — hotels locked. Recipe-driven L1–L4 sequence → default **Haiku**.

The phase→model map is a plain object, so more phases are config-only later.

**Flip on outcome, not intent (Codex finding #1).** `hotelsPromoted` flips only when a hotel lock **succeeded with non-empty lodging** — never on "tool name was called" or "patch input contained `lodging`". Featured: the replay's `lastPromoted().lodging` is non-empty. Live: the `promote_hotels_to_lodging` / lodging-`patch_trip` call returned success **and** lodging is actually present (verify via the tool result or a `read_trip` lodging check). This avoids flipping to the cheaper model when a promote silently failed.

**Terminology (Codex finding #2).** A provider "turn" can return a *batch* of tool calls. If that batch includes the hotel promotion, every decision in it was made under `discovery`; `enrichment` begins on the **next provider turn within the same chat exchange** (after tool results are appended). So the model flips *mid-exchange, between provider turns* — the loop re-resolves the model before every `provider.stream()`. (The prompt's existing "same turn enrichment" wording means same chat exchange, not same provider turn.)

## Selector modes (UI)
A new `ModelSwitch` in the existing switch cluster (claude skin: Inspector `headExtra`, beside Advisor/Theme; board skin: page header):
- `Haiku` / `Sonnet` / (`Opus`, gated — see below) — single model, whole session.
- `Smart` (**default**) — uses the phase map. The Inspector renders the map with the **active phase highlighted** and a **per-phase dropdown** so the visitor can reassign any phase's model live (applies to the next turn).

Resolution mirrors `lib/mode.ts` / `lib/advisor.ts`: `?model=` + `?routing=` URL params → localStorage → default (`smart`).

**Opus is gated (Codex finding #8).** A public, visitor-selectable Opus-on-every-turn is an abuse lever, and the daily ledger is reactive/best-effort (status checked before the stream, spend added after → concurrent overshoot). So Opus is offered only when `DEMO_OPUS_ENABLED` is set; the worker advertises the enabled model set via `/presets`, and the selector + per-phase dropdowns render only enabled models. The default Smart map uses Sonnet/Haiku only, so this changes nothing by default. The server-side allowlist (below) is the real enforcement — the UI gating is cosmetic.

## Data flow
- **Frontend → worker:** each `/chat` body gains `model?: ModelId` and `routing?: { discovery: ModelId; enrichment: ModelId }`. Per-request (a change applies to the next turn). `mode` (boards) stays as is.
- **`LLMProvider.stream(messages, tools, opts?: { model?: string })`** — optional per-call model override (interface + `ClaudeProvider`; `ClaudeProvider` falls back to its constructor model). Loop stays provider-agnostic.
- **Loop:** new optional `nextModel?: () => string` arg; called before each `provider.stream` and the resolved model passed via `opts.model`. The resolved model is **stamped on each turn's inspector turn event** (`kind:"turn"` gains `model`) AND passed to `onUsage(usage, model)` (Codex finding #4) — usage accounting happens before the turn event is emitted, so both need it.
- **session-do:** builds a routing resolver from the request body + `this.routing`; tracks `this.hotelsPromoted` (outcome-based, per Phases above); `nextModel()` = `routing.mode === "single" ? routing.model : map[ this.hotelsPromoted ? "enrichment" : "discovery" ]`. Persist `routing` + `hotelsPromoted` in `SessRecord`.
- **Server-side model allowlist (Codex finding #6).** Client-supplied `model`/`routing` values are coerced through a server allowlist = the enabled model set (Haiku, Sonnet, +Opus iff `DEMO_OPUS_ENABLED`); anything else → Sonnet. Never trust/persist arbitrary client model IDs. This is the real Opus gate.

## Cost panel — measured actual vs counterfactual (Codex finding #3, #5)
`estimateCostUsd(model, usage)` already keys on model. The fix must keep two **distinct** figures, not overload one:
- **`actualCostUsd`** (new, source of truth) — real routed spend, summed per provider turn using *that turn's* resolved model. Drives the budget ledger + `[cost]` log + the headline "this session cost".
- **`costByModel`** (unchanged semantics) — the existing **counterfactual**: what the aggregate observed usage *would* cost priced entirely as all-Haiku / all-Sonnet / all-Opus. This stays as-is for the business-case table; do NOT redefine it as routed split.
- Optional: **`actualCostByModel`** — the routed split (e.g. "$X Sonnet + $Y Haiku") if we want to show the routing breakdown.

**Cache caveat (must be stated in the UI, honesty):** Anthropic prompt caching is prefix/exact-match and model-scoped — a Haiku enrichment turn cannot read the Sonnet discovery turn's cache, so switching models **pays cache writes again** (and editing the map live duplicates writes). Usage fields are authoritative, so `actualCostUsd` stays correct, but smart routing is **not guaranteed cheaper** than cached single-model. The Inspector shows the *measured* actual spend and lets the real numbers tell the story (same zero-fabrication ethos as the rest of the demo) — no "routing always wins" claim.

## Mobile redesign (expanded per 2026-06-07 screenshots + Neil's folio note)
Two phone problems: (a) the Engineering Inspector is off-screen; (b) the inline **Trip Folio** artifact at the bottom of the chat column eats vertical space, and the auto-scroll-to-bottom yanks the view on every folio update ("glitchy scrolling"); plus the fixed `skin` / `watch demo` chrome overlaps the composer.

Mobile IA (≤760px) — **chat is the only full-screen view; folio + engineering are overlays reached by compact pills**, so neither crowds the chat:
- **`mobileView` state** (`"chat" | "folio" | "engineering"`, default `"chat"`) → `data-mview` on `.stage`. A slim **pill bar** (rendered mobile-only, above the composer) offers `📄 Folio` (shown only when the folio has content; subtle dot when it updates) and `⚙ Engineering`. Tapping opens that view as a full-height slide-up sheet; a back/close returns to chat. CSS-only show/hide under the media query, with selectors specific enough to beat `skin-claude.css:211` (0,4,0). Desktop layout fully untouched (side-by-side, inline folio artifact stays).
- **Inline `FolioArtifact` is hidden on mobile** — the Folio sheet renders it instead. This is "a link in the chat to the folio that doesn't interfere with chat" (Neil's ask). On desktop it stays inline.
- **Control placement:** the demo chrome (skin / theme / advisor / **model** switches, `watch demo`) moves OFF the chat surface on mobile — consolidated into the Engineering sheet (they're harness controls; in the claude skin Advisor/Theme already live in the Inspector head). The fixed `skin` + `watch demo` buttons get a mobile home that doesn't overlap the composer (inside the Engineering sheet / a small corner affordance).
- **Glitchy-scroll fix (root cause):** `ClaudeChatView`'s `endRef.scrollIntoView` fires on every `[items, folio, busy]` change, so each folio update yanks to the bottom. Change to **auto-scroll only when new chat content arrives AND the user is already near the bottom** (track a "pinned to bottom" flag from the scroll position); never auto-scroll on a folio-only update. This also removes the "sticky folio" feel.

**Root cause of the off-screen panel** (for the record): `skin-claude.css:211` out-specifies the old `@media(max-width:760px)` stack rule; the new `data-mview` rules are written with matching/greater specificity.

## Components / files
**Model selector**
- `web/src/lib/model.ts` (new) — `ModelId`, `RoutingMode`, `PhaseModelMap`, defaults, `resolve*`/`persist*`, `resolveModelForPhase`, `coerceModel(id, enabled)`.
- `web/src/lib/model.test.ts` (new) — resolution + phase routing + coercion.
- `web/src/ModelSwitch.tsx` (new) — global mode control (renders only enabled models).
- `web/src/Inspector.tsx` — smart-routing map (active-phase highlight + per-phase dropdowns, enabled models only); show `actualCostUsd` distinct from counterfactual `costByModel`; cache caveat line.
- `worker/llm/provider.ts` — `stream(messages, tools, opts?: {model?})`; turn inspector event + `onUsage` carry `model`.
- `worker/llm/claude.ts` — honor `opts.model`.
- `worker/agent/loop.ts` — `nextModel?` arg; per-turn model → `opts.model`; stamp on turn event + pass to `onUsage`.
- `worker/llm/cost.ts` / `worker/inspector.ts` — `withInspectorCost(ev, model)` uses the turn's model; add `actualCostUsd` accumulation; keep `sessionCostByModel` counterfactual.
- `worker/session-do.ts` — parse + **allowlist-coerce** `model`/`routing` from body; outcome-based `hotelsPromoted`; `nextModel()`; `actualCostUsd` for ledger + log; advertise enabled models via `/presets`; persist in `SessRecord`.
- `worker/session-store.ts` — `SessRecord.routing` + `hotelsPromoted` (optional, explicit hydrate defaults; re-derive `hotelsPromoted` from replay/trip lodging on hydrate to cover mid-stream DO death — Codex #6).
- `worker/index.ts` — `/presets` returns `enabledModels` (from `DEMO_OPUS_ENABLED`).
- `shared/events.ts` — turn inspector event gains `model?: string`; summary gains `actualCostUsd` (+ optional `actualCostByModel`).

**Mobile**
- `web/src/lib/mobile-view.ts` (+ `.test.ts`, new) — `MobileView` type + resolution (default `"chat"`).
- `web/src/App.tsx` — `model`/`routing`/`mobileView` state; thread into `streamChat`, ModelSwitch mounts, Inspector, pill bar; consolidate chrome into the engineering sheet on mobile.
- `web/src/ClaudeChatView.tsx` — mobile pill bar (Folio/Engineering); hide inline `FolioArtifact` on mobile; **fix auto-scroll** (pinned-to-bottom flag; no scroll on folio-only updates).
- `web/src/FolioPanel.tsx` / folio sheet — reused as the mobile Folio overlay body.
- `web/src/styles.css` / `skin-claude.css` — `data-mview` overlay rules (specificity > line 211), pill bar, ModelSwitch chrome, mobile chrome relocation.

## Testing
- `lib/model.test.ts`: param>storage>default; single vs smart; `resolveModelForPhase`; `coerceModel` (disallowed/Opus-off → Sonnet).
- `lib/mobile-view.test.ts`: resolution + default chat.
- worker: loop calls `nextModel()` per turn, forwards `opts.model`, stamps model on turn + `onUsage` (extend `loop.test.ts`); `ClaudeProvider` request body uses the override; cost: `actualCostUsd` sums per-turn models while `sessionCostByModel` stays counterfactual; session-do allowlist coercion (Opus-off → Sonnet) + outcome-based phase flip if cheaply unit-testable, else prod boards smoke.
- Auto-scroll: a focused test if the pinned-to-bottom logic is extracted to a tiny pure helper; otherwise manual mobile check.
- Regression: full `vitest run` + `tsc --noEmit`; prod boards smoke after deploy; manual mobile pass (real device or devtools ≤390px).

## Zero-fabrication / invariants (unchanged)
No change to replay, the patch sanitizer, the board allowlist, or the commission firewall. Model routing is orthogonal — it changes *which* model reasons, not *what data* may enter the folio.

## Out of scope (YAGNI)
- Per-*tool* model (impossible — tools are server-side).
- More than two phases (config-extensible; ship two).
- Opus in the default smart map (selectable when `DEMO_OPUS_ENABLED`; never a default).
- Cross-provider (the `LLMProvider` seam already allows it later).
- A hard per-session USD reservation/cap (Codex #8 alt): the `DEMO_OPUS_ENABLED` gate + existing daily ledger + per-conversation caps are sufficient for the demo; revisit if abuse appears.
- Redesigning the desktop layout — desktop is untouched; all mobile changes are gated behind `≤760px`.
