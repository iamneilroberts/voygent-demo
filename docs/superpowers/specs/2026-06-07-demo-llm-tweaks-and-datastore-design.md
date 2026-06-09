# Design: Demo "Tweaks" panel + data-store widget + two deep-dive pages

**Date:** 2026-06-07
**Author:** Neil Roberts (with Claude)
**Status:** Approved design — ready for implementation plan
**Spec authored on branch:** `voygent-demo-plan` (voygent-lite checkout)
**Implementation target:** the demo worktree `/home/neil/dev/voygent-demo-demo-enrichment`, branch `demo-enrichment` — file tree is `worker/`, `web/`, `shared/` (NOT the `src/` tree of `main`). The demo Worker is `voygent-demo` at `https://voygent-demo.somotravel.workers.dev`.

## Summary

Extend the public Voygent engineering demo with three independently-shippable capabilities:

1. **Cross-LLM "Tweaks" panel** — make the demo genuinely LLM-agnostic. A visitor can switch provider + model and "optimize for" speed / cost / capability. Anthropic (Claude) and DeepSeek run **live**; a local **Ollama** option is structurally present but **grayed out** (the edge Worker cannot reach a localhost model).
2. **Data-store widget** — a live, session-derived counter of the KV and D1 operations the session **would** trigger in production Voygent, mapped from the tool calls the agent actually makes.
3. **Two deep-dive info pages** — one on the LLM options (including local), one on KV/D1 vs the alternatives and the mindshift required of a career SQL DBA.

These reinforce the demo's existing thesis: *the moat is tools + orchestration, not a model vendor; the engineering is honest and measured live.*

## Decisions (locked with the user, 2026-06-07)

- **Provider execution = live multi-provider.** Switching provider actually runs the agent loop on the chosen provider. Not a projection/mock.
- **Cheap provider = DeepSeek** (the model family this repo's `~/dev/llm-tools` cheap-router already uses). OpenAI-compatible API.
- **Data-store widget = map session → prod ops.** The demo runs on Durable Object SQLite, not KV/D1, so the widget derives the KV/D1 ops each tool call *would* perform in production. No new bindings added to the demo Worker. This matches the demo's existing honesty framing: the live panel shows what *your* session did; "behind the scenes" cards describe the production system.
- **`shared/models.ts` registry refactor** (vs bolting providers alongside the Claude union): approved — generalize to a provider-aware registry.
- **Deep-dive pages = full narrative pages** in the style of the existing five `/info/*` pages.

## Current-state facts (verified by reading the worktree)

- `shared/models.ts` — Claude-only `ModelId` union (`haiku|sonnet|opus`), single-vs-smart routing, per-phase smart map (`discovery→sonnet`, `enrichment→haiku`), an Opus gate via `enabledModels(opusEnabled)` + `coerceModel` + `buildRouting` (all operate on an `enabled` subset — the key extension seam).
- `worker/llm/provider.ts` — `LLMProvider` interface; its own comment: *"the interface is the seam the cross-LLM flex plugs into later."* `stream(messages, tools, opts?: { model? })` yields a `ProviderEvent` union (`text-delta | tool-call | usage | turn-complete`).
- `worker/llm/claude.ts` — `ClaudeProvider`, the only impl. Anthropic Messages streaming parser + prompt-cache breakpoint logic.
- `worker/llm/cost.ts` — `PRICING` keyed by Claude model id; `estimateCostUsd(model, usage)`; unknown model → Sonnet fallback.
- `worker/agent/loop.ts` — holds one provider, passes per-turn `opts.model`.
- `worker/index.ts` — `/chat` (→ SessionDO), `/presets` (advertises `enabledModels` + `smartMap`), `/info/*`. Daily-budget ledger (reserved DO) + `DEMO_DISABLED` kill switch + `DEMO_OPUS_ENABLED` gate + `DEMO_TEST_TOKEN` bypass.
- `worker/session-store.ts` — session persistence in DO SQLite; the real 128 KiB value-cap lesson lives here (`shrinkForStorage`).
- `worker/info/pages.ts` + `worker/info/layout.ts` — five grounded, source-cited `/info/*` pages + `INFO_NAV`. Easy to extend.
- `worker/inspector.ts` — `stageForTool(name)` maps tool → orchestration stage (the pattern the store-ops mapper mirrors); `withInspectorCost`; `sessionCostByModel` (Claude trio).
- `shared/events.ts` — `InspectorEvent` union. **`kind:"turn"` already carries optional `model`; `kind:"summary"` already carries `actualCostByModel?: Record<string,number>`** — so per-turn provider/model attribution and cross-provider actual spend need *no wire shape change*. The `costByModel: {haiku,sonnet,opus}` trio stays (it is the subscription business-case counterfactual, inherently Claude).
- `web/src/ModelSwitch.tsx` (32 lines) — compact segmented model selector (enabled models + "Smart").
- `web/src/lib/model.ts` — browser selector state (URL/localStorage), `selectorToRouting`, `routingBody`.
- `web/src/Inspector.tsx` (269 lines) — the Engineering tab body; where the smart-map editor and the new store-ops widget live.
- `worker/stats.ts` — public `/stats` aggregator. **`byModel` buckets only ids containing `haiku`/`sonnet`/`opus` and drops unknown model ids** (surfaced by Codex review). Non-Claude spend would land in totals but vanish from the per-model split unless made provider-aware.
- `worker/session-do.ts` — constructs `ClaudeProvider` **once** per exchange and passes it to `runAgentLoop`; folds per-event `instrumentationBytes`; the daily-ledger add is post-hoc. The provider is not currently selectable per turn.
- `web/src/App.tsx` — the SPA inspector reducer **ignores unknown `inspector` kinds**, so adding `kind:"store"` is wire-safe until it's explicitly rendered.

## Codex review — accepted revisions (2026-06-07)

External design review (Codex, context7-grounded against live DeepSeek/Ollama/Anthropic docs) surfaced gaps. These amendments are authoritative over any looser wording below.

- **R1 — DeepSeek streamed usage is opt-in.** The request MUST send `stream_options: { include_usage: true }`; DeepSeek then emits a final `choices: []` chunk carrying `usage` before `data: [DONE]`. Without it there is no usage event and the **budget ledger records $0 for real paid spend.** Rule: **a paid provider that returns no usage is a provider error or a conservative cost estimate — never a silent zero.** Tested explicitly.
- **R2 — Caching is provider-specific; keep it honest.** Anthropic uses injected `cache_control` breakpoints (writes ~1.25×, reads ~0.1×). DeepSeek uses *automatic prefix caching* with `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens` and **no write concept** → for DeepSeek `cacheCreationTokens = 0`, and `cacheReadTokens` = hit tokens. The Inspector's "cache writes bill 1.25×" copy and the `costWeightedTokens` weighting are Anthropic-specific: gate that copy/weighting on provider, label DeepSeek as "provider-reported prefix-cache hits," not Anthropic prompt-cache writes. `worker/llm/claude.ts`'s breakpoint logic stays Claude-only and is never applied to DeepSeek/Ollama requests.
- **R3 — `/stats.byModel` must not drop non-Claude spend.** Either make `worker/stats.ts` provider-aware (bucket by registry provider/model) or **explicitly relabel** the "Across all sessions" panel as Claude-only with non-Claude folded into a total. Decision deferred to the plan; the dishonest silent-drop is not acceptable.
- **R4 — Don't namespace existing Claude ids.** Keep `"claude-haiku-4-5"/"claude-sonnet-4-6"/"claude-opus-4-8"` **verbatim**; only *add* new ids (`deepseek-chat`, `llama3.1:8b`, …). This keeps persisted `SessRecord.routing` (DO storage), localStorage (`voygent-demo-model`), and `/presets` JSON valid. `coerceModel`'s existing fallback absorbs any stale/disabled stored id; add a one-line migration note + test for old stored routing.
- **R5 — Per-turn provider selection is a real backend cutover.** `SessionDO` builds one `ClaudeProvider` today. Introduce `providerForTurn(modelId, env)` (or a dispatching provider) resolved inside the loop per turn from `(routing, phase)`. This is its own slice (A3), not a footnote to the loop.
- **R6 — Store-ops widget: ops are projected; bytes are observed (keep them separate).** Tool-result payload bytes are **not** KV blob bytes / D1 row bytes. Either drop bytes or label them "observed tool-payload bytes," visually distinct from the *projected* KV/D1 op counts. Grain: `storeOpsForTool(name, args?)` (args let `patch_trip` etc. be less coarse); note live-mode vs replay-mode differ. The widget header reads "projected production data-store ops," never "measured."
- **R7 — DeepSeek/Ollama provider correctness checklist** (fold into the provider impls + tests):
  - Assemble streaming tool calls by `delta.tool_calls[index]`, accumulating partial `function.arguments`; emit the `tool-call` event only at `finish_reason:"tool_calls"` (never partial).
  - Parse `data: [DONE]` explicitly; treat invalid final tool-arg JSON as a provider error, not `{}`.
  - Do not stream DeepSeek `reasoning_content` into chat text.
  - The host-nudge `{type:"text"}` block that rides in the Anthropic user/tool_result bundle must be translated to a **later `role:"user"` message**, after the `role:"tool"` results — not into a tool message.
  - Ollama `/api/chat` may omit OpenAI-style ids → synthesize stable tool-call ids and preserve them in the internal Anthropic-shaped assistant message.
  - Force single-choice (`n:1`) semantics.
- **R8 — Security/abuse hardening** (a public, money-spending endpoint): gate DeepSeek on **both** `DEEPSEEK_API_KEY` **and** `DEMO_DEEPSEEK_ENABLED`, and never advertise it from `/presets` unless both hold; add a **fetch timeout/abort** to every provider (none exists today); **allowlist host + scheme** for `DEEPSEEK_BASE_URL` and `DEMO_OLLAMA_URL` so neither becomes a Worker-side fetch proxy (SSRF); add a request prompt/body length cap (turn/tool caps don't bound the initial prompt); note (accepted) that the preflight+post-hoc ledger can overshoot slightly under concurrency.
- **R9 — Ollama stays minimal.** The grayed registry entry is the actual requirement (you asked for the endpoint, shown grayed). Ship a *minimal, local-dev-only* `OllamaProvider` so the seam is provably N-way and `/info/llm-options` isn't hand-waving — but it is never live from the deployed edge Worker and its full build-out is explicitly optional.

## Workstream 1 — Cross-LLM provider layer

### 1a. `shared/models.ts` → provider-aware registry

Replace the hardcoded Claude trio with a registry. Keep `ModelId` as a string id, but back it with entries:

```ts
type ProviderId = "anthropic" | "deepseek" | "ollama";
interface ModelEntry {
  id: string;            // e.g. "claude-sonnet-4-6", "deepseek-chat", "llama3.1:8b"
  provider: ProviderId;
  label: string;         // "Sonnet", "DeepSeek V4", "Llama 3.1 8B (local)"
  available: boolean;    // false ⇒ rendered grayed, never executed
  reason?: string;       // why unavailable (shown in tooltip)
  hints: { speed: 1|2|3; cost: 1|2|3; capability: 1|2|3 }; // 3 = best on that axis
}
export const MODEL_REGISTRY: ModelEntry[];
export function modelEntry(id: string): ModelEntry | undefined;
export function providerOf(id: string): ProviderId;
```

- `enabledModels(env-derived flags)` returns the executable subset (Anthropic always; Opus only if `DEMO_OPUS_ENABLED`; DeepSeek only if `DEMO_DEEPSEEK_ENABLED`; Ollama only if `DEMO_OLLAMA_URL` set — i.e. never from the deployed edge Worker).
- `coerceModel` / `buildRouting` / `resolveRoutingModel` keep their signatures and continue to operate on the enabled subset. The Opus gate generalizes to per-provider gates with no new control flow.
- The smart-map type widens to allow any enabled model id per phase (cross-provider routing is legal, e.g. Sonnet discovery → DeepSeek enrichment).
- **`OPTIMIZE_PRESETS`** added here (pure, testable): `speed | cost | capability` → a concrete `{ provider, model, routing }`. Defaults:
  - **Speed** → fastest enabled single model (Haiku; DeepSeek if it scores higher on the speed hint).
  - **Cost** → cheapest enabled (DeepSeek single, or an all-cheap smart map).
  - **Capability** → best enabled (Opus single if enabled, else Sonnet; smart map with the strongest model on discovery).
  Each preset references only *enabled* models, coerced like everything else.

### 1b. `worker/llm/` — factory + two new impls

- `worker/llm/deepseek.ts` — `DeepSeekProvider implements LLMProvider`. The real engineering:
  - Translate `ConversationMessage[]` (Anthropic block shape: `tool_use` / `tool_result` blocks) ↔ OpenAI chat messages (`assistant.tool_calls[]`, `role:"tool"` results).
  - Translate `ToolSchema[]` → OpenAI `tools:[{type:"function",function:{name,description,parameters}}]`.
  - Parse the OpenAI SSE stream (`/chat/completions`, `stream:true`): `delta.content` → `text-delta`; assembled `delta.tool_calls[]` → `tool-call`; final `usage` → `usage`; end → `turn-complete`. Map DeepSeek usage `prompt_cache_hit_tokens`→`cacheReadTokens`, `prompt_cache_miss_tokens`→`inputTokens`, `completion_tokens`→`outputTokens`. (DeepSeek does automatic prefix caching, billed ~0.1× — semantically parallel to the Anthropic cache-read.)
  - Endpoint + key from `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` secrets.
- `worker/llm/ollama.ts` — `OllamaProvider implements LLMProvider`, targeting `OLLAMA_BASE_URL` (`/api/chat`, tool-calling format). Structurally complete so the seam is provably N-way, but its registry entries are `available:false, reason:"runs on your machine — unreachable from this edge Worker"` unless `DEMO_OLLAMA_URL` is set (local dev only). From the deployed Worker it is always grayed.
- `worker/llm/index.ts` — `providerFor(modelId, env): LLMProvider`. Reuses a warm module-level Claude singleton as today; constructs DeepSeek/Ollama as needed.
- `worker/agent/loop.ts` — resolve `(provider, model)` **per turn** from the routing + current phase (today it holds one provider and only varies `opts.model`). The per-turn `model` already flows into the `inspector kind:"turn"` event for attribution.

### 1c. `worker/llm/cost.ts`

Extend `PRICING` with DeepSeek rates (input / output / cache-read). Cross-provider **actual** spend lands in the existing `summary.actualCostByModel: Record<string,number>` and per-turn cost via `withInspectorCost`. The Claude `{haiku,sonnet,opus}` counterfactual trio is unchanged.

### 1d. Guardrails / honesty

- `DEMO_DEEPSEEK_ENABLED` gates DeepSeek dark-until-keys-set (same shape as `DEMO_OPUS_ENABLED`). Live DeepSeek spend folds into the existing daily-budget ledger + `DEMO_DISABLED` kill switch — no separate budget path.
- **Replay honesty is provider-independent and must be stated as a strength:** the featured-trip replay layer intercepts *tool results*, not the model, so the "model authors only candidate ids; an unmatched id is rejected" invariant holds for any provider. A weaker model that fabricates a candidate id simply hits the existing rejected-id path (illustrative, not a regression). Live (non-featured) mode passes through to the prod MCP and is likewise provider-agnostic.

## Workstream 2 — Tweaks panel + optimize-for presets (UI)

- Keep `ModelSwitch.tsx` as the compact quick-switch in the switch cluster.
- Add a **"Tweaks ⚙"** affordance opening a fuller panel: a slide-over on mobile, inline-in-the-Inspector-head on desktop (mobile UX already shipped — this must respect it). Panel contents:
  - **Optimize-for** segmented control: `Speed | Cost | Capability | Custom`. Wired to `OPTIMIZE_PRESETS`. Selecting a granular model flips the control to "Custom."
  - **Provider groups**: Anthropic + DeepSeek (live, selectable); a **grayed "Local (Ollama)" group** with a tooltip ("runs on your machine — unreachable from this edge Worker; here's why →") linking to `/info/llm-options`.
  - The per-phase **smart-map editor** (already in `Inspector.tsx`) folded in here.
- `web/src/lib/model.ts` extends to carry provider + optimize-preset state in URL/localStorage and to build the `routingBody` from any enabled model id. `/presets` (worker) advertises the enabled registry subset + which providers are live, so the client only ever offers acceptable models (the server still coerces — defense in depth).

## Workstream 3 — KV/D1 data-store widget

- New pure module `worker/storeops.ts`, mirroring `inspector.ts`'s `stageForTool`:
  ```ts
  type StoreId = "KV" | "D1";
  interface StoreOp { store: StoreId; op: "get"|"put"|"list"|"query"|"delete"; note: string }
  export function storeOpsForTool(name: string): StoreOp[];
  ```
  Grounded in Voygent's real hybrid model (KV blob + D1 catalog/FTS5 index): `save_trip` → KV put (trip blob) + D1 upsert (index row); `find_trips` → D1 query (or KV list); `read_trip` → KV get; `patch_trip` → KV get + put; `promote_flights`/`promote_hotels_to_lodging` → KV put. Tools with no store side-effect return `[]`.
- New `InspectorEvent` `kind:"store"` (additive to the `shared/events.ts` union) carrying the ops for that tool call/exchange. Emitted alongside the existing `kind:"tool"` event.
- New `StoreOpsWidget` in `Inspector.tsx`: tallies KV vs D1 op counts + bytes (reusing the measured tool-result payload sizes), live-updating as the session runs, clearly labeled **"projected production data-store ops for this session"** and linking to `/info/data-stores`.

## Workstream 4 — Two deep-dive info pages

Added to `worker/info/pages.ts` `PAGES` map + `INFO_NAV` (same grounded, source-cited, dark-amber style as the existing five):

1. **`/info/llm-options`** — *"Choosing the model (and why the demo is LLM-agnostic)."* Provider landscape: frontier (Anthropic) vs cheap (DeepSeek — cite this repo's real `~/dev/llm-tools` cheap-router that already routes bulk I/O to DeepSeek) vs local (Ollama). The `LLMProvider` seam as the architecture that makes the host model swappable. Tool-use + caching differences across providers. The speed/cost/capability tradeoff. **Why local is grayed in this edge deployment, and when local actually wins** (privacy/data-residency, cost-at-scale, offline, latency). Sources: `worker/llm/provider.ts`, `worker/llm/deepseek.ts`, `~/dev/llm-tools/README.md`, ADR-0004 (model-swappable host).

2. **`/info/data-stores`** — *"KV, D1, and rewiring a SQL brain."* What KV / D1 / R2 / Durable Objects each are and what each is for; Voygent's hybrid model (KV blobs + D1 catalog/FTS5 + R2 binaries + DO single-writer session state); alternatives tried/rejected; and the **career-SQL-DBA mindshift**: key design *is* the schema; no cross-key JOINs (denormalize deliberately); eventual consistency; `list`-by-prefix vs `WHERE`; D1 = SQLite-at-the-edge with FTS5; DO = serialized single-writer transactions; the real 128 KiB value-cap lesson (from `session-store.ts`'s `shrinkForStorage`). Sources: CLAUDE.md (KV `voygent-themed`, D1 `voygent-prod`), the hybrid-D1+KV memory, `worker/session-store.ts`, `src/shared/kv-keys.ts`.

Both pages link from the relevant widget/panel and from the shared footer nav.

## Testing

Vitest per pure module, matching repo discipline (`models.test.ts`, `cost.test.ts`, `presets.test.ts`, `inspector.test.ts` all exist):
- `deepseek.test.ts` — fixture-driven stream-parse + message/tool translation round-trip (mirrors `claude.test.ts`).
- `storeops.test.ts` — tool → store-op mapping table.
- `models.test.ts` — extended: cross-provider `coerceModel`/`buildRouting`, `OPTIMIZE_PRESETS` resolve only to enabled models, Ollama never enabled without `DEMO_OLLAMA_URL`.
- `cost.test.ts` — DeepSeek pricing + cache-read weighting.
- Web: `model.test.ts` extended for provider/preset URL+storage resolution.

## Slicing (independently shippable; revised per Codex R5/slicing)

The original "Slice A" was too large; split into A1–A4. Order: C → B → A1 → A2 → A3 → A4.

- **Slice C — info pages** (`/info/llm-options`, `/info/data-stores`): no API keys, no agent-loop change. The LLM page cites the **`LLMProvider` seam** and describes DeepSeek as live-or-planned per landing order (so it never cites a `deepseek.ts` that doesn't exist yet). Land first.
- **Slice B — store-ops widget** (`storeops.ts` + `kind:"store"` event + `StoreOpsWidget`): no API keys. **Decide the Inspector layout now** so the widget doesn't collide with the later Tweaks panel (R6). Land second.
- **Slice A1 — registry + cost + stats compatibility, Claude unchanged.** `shared/models.ts` → registry (keeping Claude ids verbatim, R4), `cost.ts` provider-aware pricing/caching split (R2), `stats.ts` decision (R3). No new provider executes; Claude behavior byte-identical. Migration test for stale stored routing.
- **Slice A2 — DeepSeek provider, dark + gated + tested.** `worker/llm/deepseek.ts` (R1 usage, R7 correctness checklist), factory, cost rates. Gated off by `DEMO_DEEPSEEK_ENABLED` + key (R8); not advertised by `/presets` until both hold. Fixture-driven stream-parse + translation tests before any wiring.
- **Slice A3 — provider-routing loop cutover.** `providerForTurn` resolved per turn in `runAgentLoop`; `SessionDO` stops hard-constructing one provider (R5). Cross-provider smart routing works end-to-end with DeepSeek still dark.
- **Slice A4 — Tweaks panel UI + optimize presets + grayed Ollama.** The `OPTIMIZE_PRESETS` UI, provider groups, grayed local group, minimal local-dev `OllamaProvider` (R9). Flip `DEMO_DEEPSEEK_ENABLED` on once A2/A3 are verified.

## Out of scope (YAGNI)

- No real KV/D1 bindings added to the demo Worker (the widget is derived, per decision).
- No live Ollama from the deployed Worker (structurally impossible; grayed by design).
- No provider beyond Anthropic + DeepSeek wired live (Ollama is the structural third; others can be added later through the same registry + factory if desired).
- No change to the Claude subscription business-case math (`costByModel` trio) — it is intentionally Claude-only.
