# Session Handoff: Demo LLM-Tweaks + KV/D1 Widget + Deep-Dives — Implementation

**Date:** 2026-06-07
**Session Focus:** Brainstormed → spec'd (Codex-reviewed) → planned → set up this worktree. **Next session executes the plan.**
**You are here:** worktree `/home/neil/dev/voygent-demo-llm-tweaks`, branch `demo-llm-tweaks`, based on `demo-enrichment` @ `2a5add5`.

---

## ⚠️ READ FIRST — repo/worktree facts (easy to get wrong)

- **The demo is its OWN repo: `voygent-demo`** (`/home/neil/dev/voygent-demo`, gitdir `/home/neil/dev/voygent-demo/.git`). It is **NOT** part of `voygent-lite`. The demo file tree is `worker/ web/ shared/ docs/` (no `src/`).
- **This feature worktree:** `/home/neil/dev/voygent-demo-llm-tweaks`, branch **`demo-llm-tweaks`** (created off `demo-enrichment`). Do all implementation here.
- **`demo-enrichment` is the LIVE prod demo branch** (deployed Worker `voygent-demo` at `https://voygent-demo.somotravel.workers.dev`, also served `?skin=claude`). **Do NOT implement directly on `demo-enrichment`, do NOT deploy from this feature branch, do NOT clobber the live branch.** Merge back to `demo-enrichment` only when slices are done + reviewed, and let Neil drive the deploy.
- **`git -C <subdir>` is UNRELIABLE in this sandbox** — from the demo worktree it intermittently reported `voygent-lite`'s branch/WIP (a cwd/env quirk). **Always `cd` into the directory and verify with `git rev-parse --show-toplevel` + `git branch --show-current` before any mutating git op.** `cd`-based commands resolve correctly.
- The spec + plan were originally committed in the **voygent-lite** repo (branch `voygent-demo-plan`, commits `908c76d` / `3787ada` / `0bb8ad8`). **Canonical copies for implementation are now in THIS worktree** (see below) — work from these.

---

## What was accomplished this session

1. **Brainstormed** the feature (superpowers:brainstorming) → 4 decisions locked with Neil (below).
2. **Wrote the design spec**, then ran **`/codex-review`** on it → folded 9 findings (R1–R9) back in.
   - This worktree: `docs/superpowers/specs/2026-06-07-demo-llm-tweaks-and-datastore-design.md`
3. **Wrote the TDD implementation plan** (superpowers:writing-plans) — 18 tasks, 6 dependency-ordered slices, full code per step, self-review included.
   - This worktree: `docs/superpowers/plans/2026-06-07-demo-llm-tweaks-and-datastore.md`
4. **Created this worktree** off `demo-enrichment` and copied the spec + plan in.

Nothing in `worker/`/`web/`/`shared/` has been touched yet — the plan is unstarted.

---

## The 4 locked decisions (from brainstorming)

1. **Live multi-provider** — switching provider actually runs the agent loop on the chosen provider (not a mock/projection).
2. **Cheap provider = DeepSeek** (the OpenAI-compatible model `~/dev/llm-tools` already uses). Live, behind a dual gate.
3. **Data-store widget MAPS session → prod ops** — the demo runs on Durable Object SQLite and binds no KV/D1, so the widget projects the KV/D1 ops each tool call *would* trigger in production. Labeled "projected," never "measured." No new bindings.
4. **Two deep-dive `/info/*` pages** — full narrative style, matching the existing five.

## Codex review amendments (R1–R9) — authoritative; baked into the plan

- **R1** DeepSeek streamed usage needs `stream_options:{include_usage:true}`; a paid provider returning no usage = error, never silent $0 (guards the budget ledger).
- **R2** Caching is provider-specific: DeepSeek `cacheCreationTokens=0` (automatic prefix cache, no write concept); Claude's `cache_control` breakpoint logic stays Claude-only.
- **R3** `/stats.byModel` must not silently drop non-Claude spend → derive a `byModel.other` bucket in `shapeStats` (NO D1 migration).
- **R4** Keep Claude model ids **verbatim** (`claude-haiku-4-5` etc.); only ADD new ids — protects persisted `SessRecord.routing` + localStorage.
- **R5** Per-turn provider routing via a **`DispatchProvider`** that routes on `opts.model` → **zero agent-loop change** (the loop already resolves `nextModel()`).
- **R6** Store-ops widget: ops are projected, NOT measured; no fake "bytes."
- **R7** DeepSeek/Ollama stream correctness: assemble tool_calls by `index`, parse `[DONE]`, invalid final JSON args = throw, ignore `reasoning_content`, host-nudge text → trailing `role:"user"`, synth Ollama ids, `n:1`.
- **R8** Security: gate DeepSeek on **key AND `DEMO_DEEPSEEK_ENABLED`**; fetch timeout/abort on every provider; host/scheme allowlist on configurable base URLs (SSRF); prompt/body cap.
- **R9** Ollama stays **minimal/local-dev-only** + grayed registry entry (Neil explicitly wants the grayed endpoint).

---

## Slice order (execute in this order — see plan for full TDD steps)

| Slice | What | Needs API key? |
|-------|------|----------------|
| **C** | Two deep-dive info pages (`/info/data-stores`, `/info/llm-options`) + Inspector links | No |
| **B** | KV/D1 store-ops widget (`worker/storeops.ts` + `kind:"store"` event + `StoreOpsWidget`) | No |
| **A1** | Provider registry + DeepSeek pricing + `/stats` `other` bucket (Claude behavior byte-identical) | No |
| **A2** | `DeepSeekProvider` (dark+gated+tested) + minimal `OllamaProvider` + `providerFor` factory + `/presets` gate | DeepSeek key for live smoke only |
| **A3** | `DispatchProvider` per-turn routing cutover (swap `session-do.ts:275`) | No |
| **A4** | Tweaks panel UI + optimize presets + grayed Ollama + live DeepSeek flip | DeepSeek key |

C and B are pure wins with no key and no agent-loop risk — land them first to build momentum and de-risk the wire (`kind:"store"`, `byModel.other` shape).

---

## What the NEXT session should do

1. **First — verify you're in the right place:**
   ```
   cd /home/neil/dev/voygent-demo-llm-tweaks && git rev-parse --show-toplevel && git branch --show-current
   ```
   Expect `/home/neil/dev/voygent-demo-llm-tweaks` and `demo-llm-tweaks`.
2. **Install deps (fresh worktree has no `node_modules`):**
   ```
   cd /home/neil/dev/voygent-demo-llm-tweaks && npm install
   ```
   If peer-dep resolution errors, retry `npm install --legacy-peer-deps`.
3. **Confirm a GREEN baseline before changing anything:**
   ```
   npm test && npm run typecheck
   ```
   Both should pass on `2a5add5`. If not, stop and report — don't build on red.
4. **Execute the plan** at `docs/superpowers/plans/2026-06-07-demo-llm-tweaks-and-datastore.md`, **starting at Slice C / Task C1**. Recommended: **superpowers:subagent-driven-development** (fresh subagent per task, review between). Alternative: superpowers:executing-plans (inline, batched checkpoints). Each task is TDD: write failing test → run-fail → implement → run-pass → commit.
5. **Local verification** (UI/worker): `npm run dev:worker` (wrangler) + `npm run build:web`. There's a `?skin=claude` mode and an autoplay demo; plan a featured trip to see the Engineering tab.

## Gotchas / don'ts

- **Don't deploy.** `demo-enrichment` is live in prod; this branch must not be deployed or merged until Neil signs off. UI changes only show after `npm run build:web` (the Worker serves `dist-web/`).
- **DeepSeek stays dark** until A4.4: it executes only when BOTH `DEEPSEEK_API_KEY` and `DEMO_DEEPSEEK_ENABLED` are set. Flip on **staging/local first**, smoke that `wrangler tail` shows a non-zero `usd=` (R1!), then prod.
- **A1.2 price:** the DeepSeek per-token rate in the plan is a starting value — verify against api-docs.deepseek.com when you implement and update the comment.
- **`ModelId` widens from a Claude union to `string`** (A1.1) — intentional; execution is still gated by `coerceModel`. Watch for any code relying on the narrow union.
- **Replay honesty is provider-independent** — the replay layer intercepts tool *results*, not the model, so swapping to DeepSeek can't enable fabrication. This is a selling point for `/info/llm-options`, not a risk.
- **Secrets for A2/A4:** `DEEPSEEK_API_KEY`, `DEMO_DEEPSEEK_ENABLED`; optional `DEEPSEEK_BASE_URL`. `OLLAMA_BASE_URL`/`DEMO_OLLAMA_URL` are local-dev only.

## What NOT to re-read

- The whole codebase — the plan already cites exact files + line numbers for every task (verified this session against `2a5add5`).
- The voygent-lite repo — the demo is a different repo; the only things that crossed over are the spec + plan, now copied here.

## Open questions requiring Neil

- None blocking. Execution method (subagent-driven vs inline) is the next session's call. R3's "derive `other`, no migration" is decided.
