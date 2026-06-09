# Session Handoff: Faithful Thin-Client Re-scope (writing-plans pass)

**Date:** 2026-06-09 · **From:** session `improve-demo` · **For:** the next session
**One sentence:** `main` is reconciled, clean, and deployed — now do a `writing-plans` pass for
**Plan A** of the re-scoped faithful thin-client design, against the real `main` tree.

---

## Start here (read in this order)
1. Your `CLAUDE.md` (worktree + context rules).
2. **`docs/superpowers/specs/2026-06-09-faithful-thin-client-rescoped.md`** ← the approved design input. KEEP/REMOVE/ADD inventory + the 3-plan shape. This is your brainstorming output; go straight to `writing-plans`.
3. `docs/superpowers/plans/2026-06-09-faithful-thin-client-keystone.md` ← the earlier keystone plan. Tasks 1–4 (the `initialize()` code) are still correct and reusable; **its Decision K1 is REVERSED** — we now want real tool calls, not replay.
4. Memory: `~/.claude/projects/-home-neil-dev-voygent-demo/memory/project-prod-runs-demo-enrichment-not-main.md` (now updated: reconciliation done).
5. The original spec `docs/superpowers/specs/2026-06-09-faithful-thin-client-design.md` — still useful for the keystone mechanics (initialize/instructions/progressToken), but written against the stale tree.

## What is TRUE now (don't re-derive)
- **`main` = `8929804`** is the trunk and contains BOTH enrichment and access-control. `origin/main` == local. **263/263 tests green**, tsc clean, web bundle builds.
- **Prod IS deployed from committed `main`** (deployed 2026-06-09): `/stats`=200, `/info/phase-machine`=200, `/auth/me`=401, `APP_ORIGIN` guard verified. No uncommitted-build drift anymore.
- **Only `main` exists** — all feature branches deleted (local + remote). One worktree (the main clone).
- An **auth-tokens session** is doing CF Access config (Task 2) — coordinate via `docs/worktree-journal.md` `## Coordination` before touching `worker/access/*`, `wrangler.toml` `[vars]`, or deploying.

## The task: writing-plans pass for Plan A (keystone, flag-gated)
Per the re-scoped design, **Plan A** is additive and flag-gated (`FAITHFUL=1`) so prod is unaffected until verified:
1. `McpClient.initialize()` → capture `serverInfo` + `instructions`; send `notifications/initialized`; reuse session id. (Lift from keystone plan Task 1 — the code is correct.)
2. Operating core = `initialize.instructions` (first cache-anchored message); shrink the embedded prompt to a tiny demo addendum.
3. Real `tools/list` + real `tools/call` to the live MCP **when `FAITHFUL`** (bypass `worker/mcp/replay.ts` interception); the model drives `manage_trip_goal`.
4. `progressToken` on `tools/call` → render `notifications/progress`.
5. Graceful-degradation wrapper on `callTool` (visitor never sees raw errors).

Then **Plan B** (strip phase-machine / workflow prompts / `DEMO_TOOLS` / multi-provider — pure deletion) and **Plan C** (reel + chips) as separate plans. Start with A.

## Real tree facts the plan must account for (verified during the reconciliation merge)
- `worker/session-do.ts` is ~646 lines. The operating prompt is **three constants**: `SYSTEM_HINT` + `ENRICHMENT_WORKFLOW` + `LIVE_TRIP_WORKFLOW`, assembled into the seed. Phase-machine wiring: imports from `worker/agent/phases.ts` (`INITIAL_PHASE`, `advancePhase`, `phaseDirective`, `isBeforeSummary`, `PhaseCtx`), gated by `DEMO_PHASE_MACHINE`, with `afterToolBatch`/`continueDirective` hooks passed into `runAgentLoop`.
- Provider is **`DispatchProvider`** (`worker/llm/dispatch.ts`) over `providerFor(id, env)` → Claude / DeepSeek / Ollama; `buildRouting(...)` from the request body. Plan B decides whether to delete or flag-off the non-Claude path.
- `worker/mcp/replay.ts` (~480 lines now) intercepts supplier + enrichment tools against `worker/fixtures/*`. Plan A must make this a no-op when `FAITHFUL`.
- `DEMO_TOOLS` whitelist lives in `session-do.ts`; faithful mode uses real `tools/list` filtered by the visitor's access-control entitlement (`hit.view` from `/auth`).
- LLM provider (`worker/llm/claude.ts`) has **no `system` param** — the operating core is the first user message and is the prompt-cache anchor (`withMessageCache`). Keystone Decision K2 still applies.
- Test runner: `npx vitest run` (263 tests). Typecheck: `npx tsc --noEmit`. Build: `VITE_API_BASE="" npm run build:web`. Deploy: `npx wrangler deploy`.

## Open questions to resolve while planning (from the re-scoped design)
1. Multi-provider: delete from the live path, or keep flagged-off for the cost-story inspector panel?
2. Does the per-code D1 budget (micro-USD reserve→reconcile) account for real *tool-call* spend, or only LLM tokens? Faithful mode makes real paid searches.
3. Can one passcode's budget tolerate a full `manage_trip_goal` build (many tool calls), or cap rounds?

## What NOT to re-read
- The reconciliation runbook (`docs/superpowers/plans/2026-06-09-branch-reconciliation-runbook.md`) — done; historical.
- The merge conflict details — resolved and committed in `5f0083e`.

## First action for the next session
Invoke `superpowers:writing-plans`, take the re-scoped spec as input, and produce
`docs/superpowers/plans/2026-06-09-faithful-plan-a-keystone.md` (flag-gated, TDD, bite-sized).
Coordinate with the auth-tokens session before editing `worker/access/*` or deploying.
