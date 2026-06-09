# Faithful Thin Client — Re-scoped Design (against reconciled `main`)

**Date:** 2026-06-09 · **Status:** approved direction (Neil), design input for a `writing-plans` pass.
**Supersedes the branch assumptions in:** `2026-06-09-faithful-thin-client-design.md` and
`2026-06-09-faithful-thin-client-keystone.md` (both written against the stale `main`; reconciliation
is now done — `main` = `5f0083e` contains enrichment + access-control).

## North star (Neil, 2026-06-09)

> Make the demo a **mechanism-faithful thin client of "Claude + the voygent MCP as a connector"**:
> call **real** voygent tools, and let the **demo's own API LLM calls simulate what claude.ai does**.
> **Remove the demo-only handlers** — *except* the ones that (a) let it run **outside claude.ai**,
> (b) provide **demo user auth**, and (c) support **recording new reels**.

The demo as it stands (post-reconciliation) accreted a lot of demo-specific orchestration that makes
it a *re-implementation*, not a thin client. This re-scope deletes that and sources behavior from the
live MCP instead. **Crucially, calling real tools is now affordable/safe because access-control's
passcode + per-code D1 budgets cap real spend per visitor** — that is the cost guard that replaces
fixture replay.

---

## KEEP (these are the legitimate "demo-only" carve-outs Neil named)

| Area | Why it stays |
|------|--------------|
| Web UI / skins (`web/src/*`, board + claude skins, FolioPanel, Inspector) | runs **outside claude.ai** — the whole point of a web demo |
| Demo's own LLM access (`ClaudeProvider` + demo `ANTHROPIC_API_KEY`) | a visitor has no Claude subscription; the demo's API key **simulates claude.ai** |
| **Access-control** (`worker/access/*`, passcode gate, `/auth`, admin, per-code D1 budgets, sid cookie) | **demo user auth** — AND the budget ledger is what makes calling real paid tools safe for a public demo |
| **Record/replay + autoplay** (`recorder`, `recording`, `?mode=auto`, `web/src/recordings/*`) | **recording new reels** — the sizzle-reel replays a real captured run through the same renderer |
| Public-safety guards (global daily budget cap, `DEMO_DISABLED` kill-switch) | enable running it publicly without runaway spend |
| Engineering inspector (`Inspector.tsx`, `inspector/*` events) | shows *real* telemetry of the faithful loop; a featured surface, not a fake |

## REMOVE (demo-only orchestration that makes it a re-implementation, not a thin client)

| Area | Files | Replace with |
|------|-------|--------------|
| **Phase-machine** (server-side trip-build state machine) | `worker/agent/phases.ts`, `DEMO_PHASE_MACHINE`, the `afterToolBatch`/`continueDirective` phase wiring in `loop.ts` + `session-do.ts`, `kind:"phase"` inspector trail | the model drives `manage_trip_goal` itself because the **live instructions** tell it to (claude.ai has no such machine) |
| **Hand-rolled prompt orchestration** | `SYSTEM_HINT` workflow steps + `ENRICHMENT_WORKFLOW` + `LIVE_TRIP_WORKFLOW` in `session-do.ts` | `initialize.instructions` from the live MCP (the keystone) + a *minimal* demo addendum (anti-leak + auth/cost only) |
| **Curated tool whitelist** | `DEMO_TOOLS` set | real `tools/list` from the MCP, tier-filtered by the visitor's access-control entitlement (`hit.view`) |
| **Fixture replay of supplier calls (LIVE mode)** | `worker/mcp/replay.ts` interception of `flight_search`/`hotel_search`/`promote_*`/excursion tools | **real tool calls** to the live voygent MCP; per-code budget caps the spend. *Replay stays ONLY for reel playback, never live.* |
| **Multi-provider** (DeepSeek/Ollama/model-selector) | `worker/llm/dispatch.ts`, `deepseek.ts`, `ollama.ts`, `DispatchProvider`, `buildRouting`, `ModelSwitch`/`TweaksPanel`, `shared/models.ts` routing | Claude only (the demo **simulates claude.ai** = Claude). **DECISION NEEDED** — see Open Questions; could keep dormant behind a flag for the cost-story inspector panel. |
| Enrichment fixtures + capture-for-enrichment | `worker/fixtures/*` enrichment payloads, enrichment capture script paths | real enrichment tools called live |

## ADD (the faithfulness keystone — from the original spec, still valid)

1. **`McpClient.initialize()`** → capture `serverInfo` + **`instructions`**; send `notifications/initialized`; reuse session id. (This is Task 1 of the earlier keystone plan — that code is still correct; only its surrounding context changed.)
2. **Operating core = `initialize.instructions`**, delivered as the cache-anchored first message; shrink the embedded prompt to a tiny demo addendum (anti-leak + "you're on a budgeted demo").
3. **Real `tools/list` + real `tools/call`** to the live MCP; the model drives `manage_trip_goal`. No demo orchestration.
4. **`progressToken`** on `tools/call` → render `notifications/progress` for live in-call search progress (a real capability claude.ai's client doesn't exercise).
5. **Graceful degradation**: wrap `callTool` failures so the visitor never sees raw errors (model still sees the real error).

---

## The architecture after the re-scope

```
Visitor → passcode gate (access-control) → demo Worker
   demo Worker = faithful loop:
     system prompt  = MCP initialize.instructions     (live-sourced)
     tools          = MCP tools/list (entitlement-filtered)   (live-sourced)
     LLM            = demo's Claude API key            (simulates claude.ai)
     tool calls     = REAL voygent MCP                 (per-code budget caps spend)
     progress       = real notifications/progress (demo sends progressToken)
   → emit() event stream → web UI (skin) + Inspector
Reel mode = the SAME renderer over a RECORDED emit() stream (replay.ts lives here only).
```

What a viewer sees in **live** mode is genuinely "Claude + voygent MCP," differing only by the web
skin and the demo's own API key. **Reel** mode replays a captured real run. Only the recording drifts.

---

## Open questions (resolve at planning time)

1. **Multi-provider (DeepSeek/Ollama):** delete entirely, or keep dormant behind a flag because the
   "cheaper models work too" story is a compelling inspector/business-case panel? Neil's "simulate
   claude.ai" leans **delete from the live path**; a flagged-off keep preserves the cost demo.
2. **Real-tool budget per code:** does the existing per-code D1 budget (micro-USD reserve→reconcile)
   already cover real *search* spend, or only LLM spend? May need the admission estimate to account
   for tool-call cost, not just tokens.
3. **`manage_trip_goal` round-count vs budget:** the real build loop makes many tool calls; confirm a
   single passcode's budget tolerates a full faithful build (or cap rounds).
4. **Removal sequencing:** phase-machine and enrichment prompt are load-bearing for the *current*
   prod behavior. Remove behind a `FAITHFUL` flag first (A/B), verify, then delete — don't big-bang.

---

## Suggested plan shape (for the `writing-plans` pass)

- **Plan A — Keystone (additive, flag-gated `FAITHFUL=1`):** `initialize()` + instructions-as-core +
  real `tools/list`/`tools/call` (bypass replay when `FAITHFUL`) + graceful degradation. Ship behind
  a flag so prod is unaffected until verified. (Reuses the earlier keystone plan's Tasks 1–4, minus
  Decision K1's replay caveat — now we *want* real calls.)
- **Plan B — Strip orchestration:** once Plan A is verified live, delete phase-machine, the workflow
  prompt blocks, `DEMO_TOOLS`, and (decision permitting) multi-provider. Pure deletion + test cleanup.
- **Plan C — Reel + progress polish:** `progressToken` wiring; re-capture the reel against the
  faithful loop; location-seeded chips.

Each is independently shippable. Start with Plan A (it unlocks the auto-update property and proves the
budget-gated real-tool model end to end).
