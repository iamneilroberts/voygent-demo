# Session Handoff: Faithful Demo — Live-Testing Improvement Cycle

**Date:** 2026-06-09 · **From:** session `faithful-plan-a` · **For:** a fresh session that will act on Neil's manual live-testing feedback
**One sentence:** Plan A (the "faithful thin-client" mode) is shipped, deployed, and **ENABLED in prod** — public visitors now get real live Claude+voygent-MCP trip builds; this hands a fresh session the context to turn Neil's hands-on observations into fixes.

---

## Start here (read in this order)
1. Your `CLAUDE.md` (worktree + context rules) and `docs/worktree-journal.md` (esp. the `## Coordination` section — it's the live state log).
2. This file.
3. `docs/superpowers/plans/2026-06-09-faithful-plan-a-keystone.md` — the shipped plan; its "What changed" + "Flag-enablement gate" sections are the architecture reference. **Don't re-execute it — it's done and live.**
4. The re-scoped design `docs/superpowers/specs/2026-06-09-faithful-thin-client-rescoped.md` (KEEP/REMOVE/ADD inventory; Plan B/C shape).

## What is TRUE now (don't re-derive)
- **`main` = `09fa8cc`** (this handoff adds one commit on top), `origin/main` in sync, **276 tests green**, tsc clean, working tree clean.
- **Faithful mode is LIVE in prod.** Secrets `FAITHFUL=1` and `FAITHFUL_PUBLIC_OK=1` are set on Worker `voygent-demo`. Served at **`demo.voygent.ai`** (workers.dev is retired; `APP_ORIGIN=https://demo.voygent.ai`).
- **Smoke-verified live** (off-menu Reykjavik build): the model drives `manage_trip_goal`, real `flight_search` returned genuine Icelandair fares, real folio rendered, the friendly degradation chip fired on a transient and recovered, present-and-wait checklist worked.
- **Rollback** (instant, no deploy): `npx wrangler secret delete FAITHFUL_PUBLIC_OK` → public drops to the legacy flag-off path; also delete `FAITHFUL` to revert admin/test too.
- **A parallel session is active:** `demo-subagent-deepdives` (worktree `../voygent-demo-demo-subagent-deepdives`) is editing `worker/info/pages.ts`, `worker/info/layout.ts`, `web/src/Inspector.tsx` (the `## Active` journal entry has its Don't-touch). **Coordinate before touching those files.**

---

## THE mental-model shift (most important thing to internalize)

In **faithful mode the operating prompt is NOT in this repo** — it is the live voygent MCP's `initialize.instructions`, fetched at runtime (`McpClient.initialize()` → `buildFaithfulSeed(mcp.instructions, …)`). The demo adds only a tiny `FAITHFUL_ADDENDUM` (anti-leak + "budget-capped session" + a one-line boards-presentation note). Tools come from the real `tools/list` minus `DENYLISTED_TOOLS` (14 destructive ones). The model drives the build via `manage_trip_goal` itself.

**Consequence for triage:** if Neil's feedback is about *how the assistant plans, what it says, what order it does things, which tools it picks* — that is almost always a **voygent-lite MCP `instructions` change (a different repo), NOT a demo change.** Only a handful of things are tunable from this repo. Get this right before proposing edits here.

## Triage map — symptom → where the fix lives

| Neil observes… | Fix location |
|---|---|
| Assistant's planning logic / wording / step order / tool choice / "it should ask X first" | **voygent-lite** MCP `instructions` (the live operating prompt) — NOT this repo |
| A specific tool returns bad/empty/wrong data (e.g. flights, hotels, excursions) | **voygent-lite** tool impl (`src/mcp/tools/*`) |
| Anti-leak slip, "budget-capped session" framing, boards-presentation phrasing | `worker/session-do.ts` → `FAITHFUL_ADDENDUM` / `FAITHFUL_BOARDS_NOTE` (demo-side) |
| A failed tool leaks a raw error / friendly wording is wrong | `worker/agent/loop.ts` → `visitorToolSummary` / `hasJsonError` |
| Which tools are exposed (add/remove from catalog) | `worker/session-do.ts` → `DENYLISTED_TOOLS` (keep the 14 destructive denied — Neil, 2026-06-09) |
| UI/skin, folio cards, option boards, inspector rail, styling | `web/src/*` (`App.tsx`, `FolioPanel`, `Inspector.tsx`, CSS) + `worker/agent/boards.ts` (board mapping) |
| Cost/telemetry numbers in the inspector | `worker/inspector.ts` + the `emit` wrapper in `session-do.ts` |
| Replay/featured "gif" path or the autoplay reel | `worker/mcp/replay.ts`, `worker/fixtures/*`, `web/src/recordings/*` — **legacy/flag-off path; the reel is now STALE vs faithful (see below)** |

## Key files (orientation)
- `worker/mcp/client.ts` — MCP client; `initialize()` handshake (instructions/serverInfo/session-id).
- `worker/session-do.ts` (~700 lines) — the SessionDO: seed assembly (`buildFaithfulSeed` vs legacy constants), `faithfulGates(faithful, liveMode)` (the tool-path decision table), `baseCallTool`/`callTool`, `onFolio`, the `runAgentLoop` wiring, cost/admission/reconcile, the latched `this.faithful`.
- `worker/agent/loop.ts` — vanilla tool-use loop; `visitorToolSummary` (graceful degradation, faithful-gated via `friendlyToolErrors`).
- `worker/agent/boards.ts` — maps list-tool results to inline option-card `board` events (presentation, both modes).
- `worker/access/*` — passcode gate, per-code D1 budgets, admin, sid cookie.
- `web/src/App.tsx`, `FolioPanel`, `Inspector.tsx` — the SPA (board + claude skins, folio, engineering inspector).

## Deploy / test recipe
- Tests: `npx vitest run` (276) · Typecheck: `npx tsc --noEmit`
- Build SPA: `VITE_API_BASE="" npm run build:web` (the empty base is required — else the bundle bakes localhost)
- Deploy: `npx wrangler deploy`
- Flags are **secrets** (`wrangler secret put/delete`), read as `this.env.FAITHFUL` / `FAITHFUL_PUBLIC_OK`. Gate logic: `faithfulEnv = !!FAITHFUL && (isTest || !!FAITHFUL_PUBLIC_OK)`, latched per session on turn 1.
- Live smoke: `POST /auth {code}` (needs `Origin: https://demo.voygent.ai`) → sid cookie → `POST /chat {message}` (same Origin) → SSE stream. **Ask Neil for a current test passcode — do NOT commit one to the repo.** The faithful signal in the stream is the presence of `manage_trip_goal` tool calls.

## Known rough edges from the smoke (candidate improvement areas)
- **Flaky supplier transient:** one `flight_search` hiccup triggered "trying another…" before succeeding. Degradation/retry worked, but real supplier calls can be flaky — Neil may want retry/timeout tuning (loop or MCP side).
- **Present-and-wait vs auto-build:** faithful builds pause for the human to pick flights/hotels (the real voygent checklist). If Neil wants a more autonomous demo flow, that's an MCP-`instructions` or addendum nudge, not a code path here.
- **The reel is STALE:** the recorded autoplay reel was captured against the *legacy* path; it no longer matches the live faithful loop. Re-capturing it is **Plan C**.
- **Dormant code:** multi-provider (DeepSeek/Ollama/model-selector) and the phase-machine are still present but unused in faithful mode (phase-machine is force-off; provider defaults to Claude). Removing them is **Plan B**.

## Deferred plans & open items (context, not to-do)
- **Plan B** — strip the now-dead orchestration (phase-machine, `SYSTEM_HINT`/`ENRICHMENT_WORKFLOW`/`LIVE_TRIP_WORKFLOW` prompt blocks, `nudge`, and — decision pending — multi-provider). Pure deletion once faithful is trusted.
- **Plan C** — `progressToken` → render `notifications/progress`; re-capture the reel against faithful; location-seeded chips; MCP-client hardening (`parseBody` id-matching, session 404/`DELETE`).
- **Issue `iamneilroberts/voygent-lite#179`** — isolate the demo's supplier API spend (it currently shares the advisor's PROD SerpAPI/TripAdvisor/Viator keys). Deferred; revisit only if driving more public traffic.
- **Budget metering WAIVED** by Neil for current scale (real supplier tool-call spend is unmetered by the per-code ledger + daily cap, which count LLM tokens only). Don't propose cost gates as blockers — see memory `feedback-demo-cost-guardrails-stance`.

## What the NEXT session should do
1. **First:** ask Neil to dump his live-testing observations as a concrete list.
2. **Triage each** with the map above — for every item decide: demo-repo fix, voygent-lite (MCP impl) fix, or live-MCP-`instructions` fix. State the call before editing.
3. For demo-repo work: `/branch <slug>` first (a parallel session is active), then TDD per the repo's conventions; verify `npx tsc --noEmit && npx vitest run`; build + `wrangler deploy`; update the journal.
4. Don't re-verify Plan A — it's shipped and live.

## What NOT to re-read / re-do
- Plan A keystone plan internals (done + live) — only skim for architecture.
- The branch reconciliation runbook and the Codex review thread — historical.
- The legacy prompt constants (`SYSTEM_HINT`/`ENRICHMENT_WORKFLOW`/`LIVE_TRIP_WORKFLOW`) — they only run in flag-off mode; faithful ignores them.
