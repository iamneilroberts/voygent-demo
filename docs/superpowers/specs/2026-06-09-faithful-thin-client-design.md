# Design + Handoff: voygent-demo as a faithful thin client of the voygent MCP

**Date:** 2026-06-09 · **Status:** approved design (brainstormed with Neil), ready for a planning pass.
**Audience:** the next voygent-demo session. Read your own `CLAUDE.md` first; then this.
**Source of the voygent-side changes:** the 2026-06-09 voygent-lite session. Prod is
`https://voygent.somotravel.workers.dev/mcp` (Worker `e83e3c35`).

---

## TL;DR

The demo should be a **mechanism-faithful** reproduction of "Claude + the voygent MCP," with a web
skin — **not** a re-implementation. Everything voygent-specific (the operating prompt, the tool
catalog, the build-loop behavior) is **pulled from the live MCP** so voygent changes propagate to
the demo's *live* mode with **zero demo edits**. The only legitimately-custom code is: the web UI,
the demo's own LLM access (no user subscription), the **sizzle-reel** (a recorded real run replayed
through the same renderer), a **featured engineering/inspector panel**, and cost/safety guards.

Architecture: **one engine, two event sources.** A single `emit()` event stream drives the UI. In
**live** mode the events come from the real faithful loop; in **reel** mode the *same renderer*
consumes a *recorded* event stream + a thin director track. The recording is the only thing that
goes stale → maintenance is "re-capture the reel."

---

## Part 1 — What voygent shipped (consume these)

All live in prod Worker `e83e3c35` (chain: `afc7328a → 75ad2930 → 7c066cfd → 93b32894 → d15926a9 →
3733a42c → e83e3c35`). The demo must align with these:

1. **Thin operating core (91% cut, ~2.3K tokens).** `_prompts/addendum` in the shared KV (9,741 B),
   generated from `src/mcp/prompts/addendum.ts` (`ADDENDUM_MARKDOWN`). The old 46 KB
   `_prompts/lite-system-prompt` is **no longer always-on** — pullable via `get_prompt` only. **Do
   not embed or copy this prompt into the demo.**

2. **The operating core is delivered via the MCP `instructions` field.** `createVoygentServer` now
   passes `{ instructions: ADDENDUM_MARKDOWN }` to the `McpServer` constructor, so the **`initialize`
   response carries `instructions`** (verified: SDK emits it; PR #175). A compliant MCP client gets
   the operating core automatically. **This is the keystone for the demo** — read it; don't hand-maintain it.

3. **Server-driven build loop.** `manage_trip_goal` drives the build: `action:"derive"` (validate a
   TripBrief → propose a slot checklist) → `"confirm"` → loop `"advance"` (returns one imperative
   next action per turn) until `done`. Every trip-write returns `_meta.checklist {done,total,next}`.
   There's a terminal Folio gate (no "done" until `decisions[]` exist AND the board was rendered) for
   non-`benchmark_only` trips. **The model drives this itself because the instructions tell it to —
   the demo must NOT add its own orchestration.**

4. **`brief` must be a JSON object.** `manage_trip_goal`'s `brief` param is typed `z.record(...)`
   (emits `type: object`), so clients send a real object. The server also **coerces a stringified
   brief** as a safety net, and `schemaVersion` **defaults to 1**. Minimal brief:
   `{ party:{adults:N}, dates:{mode:"fixed"|"flexible"|"open"}, destinations:["City"] }`. If the demo
   ever constructs tool args directly, pass `brief` as an object. (Context: claude.ai stringifies
   params that have no declared JSON-schema type — see voygent-lite memory
   `reference_claudeai_stringifies_untyped_mcp_params`.)

5. **Narration directive in the core.** The model posts one line before each tool action:
   `▸ Step <done+1>/<total> — <action>`, and on slow tools appends a rough time hint, e.g.
   `▸ Step 2/8 — searching flights JFK→Cork (~20–30s)`. **The demo should render these as a
   first-class progress element**, not buried inline text.

6. **MCP progress notifications (a demo-only superpower).** The search tools
   (`serp_flight_search`, `serp_hotel_search`, `expedia_taap_hotel_search`) emit
   `notifications/progress` ("Searching Google Hotels — Cork…" → "complete") **iff the client sends a
   `progressToken` in the request `_meta`.** claude.ai does **not** send one (verified:
   `progressToken=NONE`), so it can't render in-call progress. **The demo IS a custom client and CAN
   send a `progressToken`** → it can fill the in-call spinner with live search progress. This is real
   voygent behavior exercised through a cooperating client (fidelity to capability, not a fake). The
   dormant `sendProgress` wiring lives in `src/mcp/progress.ts`.

7. **The Folio Board is the deliverable.** `preview_folio_board` returns **`clientUrl`** (public,
   safe to show the visitor) and **`advisorUrl`** (carries an 8h token — **firewall: never show to a
   client/visitor**). Pass `buildDecisions:true` to derive pickable options from staged
   lodging/flights. Recent fixes: `clientUrl` no longer degrades to `/proposal/unknown`, and
   `meta.tripId` is stamped on every write — so published proposal URLs resolve. The folio board is a
   hosted artifact at `https://<advisor-subdomain>.voygent.ai/proposal/<tripId>` — **the reel's
   finale can hand off to the real live board for free.**

---

## Part 2 — Target architecture

**Principle:** mechanism-faithful thin client. What a viewer sees in *live* mode is genuinely what
happens inside claude.ai, differing only in the web skin + the demo's own LLM key.

### One engine, two sources
- The loop's `emit()` stream (`worker/agent/loop.ts` → `worker/agent/sse.ts`) is the **single UI
  source of truth**: assistant tokens, tool calls, tool results, progress lines, folio updates.
- **Live** = events from the real faithful loop.
- **Reel** = a **recorded** event stream (captured from a real run) replayed through the **same
  renderer**, plus a separate **director track** (pace at 2×, zoom-to-inspector cues, captions,
  disclaimer). **Finale hands off to the real hosted folio board** (live + clickable).
- **Only the recording drifts.** Live is always current.

### Faithfulness deltas (current → target, with file pointers)

| File | Today | Change |
|------|-------|--------|
| `worker/mcp/client.ts` | does `tools/list` + `tools/call`; **never calls `initialize`** | add `initialize()`; capture `serverInfo` + **`instructions`**. Optionally send a `progressToken` on `tools/call` and surface `notifications/progress`. |
| `worker/session-do.ts` | **system prompt embedded here** (hand-maintained copy — the #1 drift source) | set system prompt = **`initialize.instructions`**; tools = `tools/list` verbatim (tier-filtered by the demo's auth). Drop the embedded copy. |
| `worker/agent/loop.ts` | **already a vanilla Anthropic tool-use loop** (`provider.stream(messages, tools)` → `tool_use` → `callTool` → `tool_result`) | keep. Ensure tool args (esp. `manage_trip_goal.brief`) pass through as **objects**. Wrap `callTool` failures into model-visible-but-user-safe results (graceful degradation). |
| agent | — | **No voygent-specific orchestration.** The model drives `manage_trip_goal` because the instructions say so. |

### Featured engineering/inspector panel (always-on, live AND reel)
First-class, not a toggle: tokens, `$` cost, tool calls + latency, the `_meta.checklist` progress,
raw tool I/O. `web/src/Inspector.tsx` + the existing `docs/superpowers/specs/2026-06-06-engineering-inspector-design.md`
are the starting point — **promote it to a featured surface present in every trip.**

### Live happy-path
- Reel ends at the chat. **Location-seeded chips** (Cloudflare `request.cf.city/country` → "Plan a
  honeymoon from <nearest hub airport>") that **fill the input, do NOT auto-submit.** User submits →
  real faithful flow.
- **Graceful degradation:** a failed/slow/again-failed search surfaces as a friendly "let me try
  another source…" — **never raw errors or stack traces.** The loop already isolates `callTool`, so
  wrap its failures; keep the model informed (real tool-error content) but the *visitor* sees the
  friendly version.

### Live-mode search progress
The demo client sends a `progressToken` on `tools/call` and renders voygent's `notifications/progress`
to kill the in-call spinner.

---

## Part 3 — Reel capture & maintenance

- Extend `scripts/capture-fixtures.mjs` to record the **full `emit()` event stream** of one good real
  run (assistant tokens, tool calls/results, progress, folio events).
- **Director track** = a separate JSON keyed by event index/time: pacing (2×), zoom-to-inspector
  cues, captions, the disclaimer, and the final hand-off to the live folio board URL. Separate from
  the capture so you can re-record the session without redoing the cinematics.
- **Re-capture** whenever a voygent change is visibly relevant to the reel (new tool, changed folio
  shape, changed narration). Live mode needs no action.

---

## Part 4 — What NOT to do (anti-drift checklist)

- ❌ Embed/copy the voygent system prompt → ✅ read `initialize.instructions`.
- ❌ Hardcode the tool list → ✅ use `tools/list`.
- ❌ Add demo-side build orchestration, nudges, or "helper" prompt text → ✅ let the model + the
  server loop (`manage_trip_goal`) drive.
- ❌ Show `advisorUrl`, tokens, or raw errors to the visitor → ✅ `clientUrl` only; friendly fallbacks.
- ❌ Pass `brief` as a string when constructing tool args directly → ✅ object.

---

## Part 5 — Known voygent-side threads (the demo surfaces whatever voygent does)

- **`wise-valley`** (voygent issue): non-revenue cost estimates (meals/transit/admission/activities)
  should be opt-in / default-off in client + advisor views. Until fixed, the model may emit `$`
  estimates in proposal summaries — the demo will show them. Don't "fix" this in the demo; it's a
  voygent change.
- **Advance-gate doesn't pause for advisor choice** — the model sometimes builds straight through
  without surfacing picks. Voygent-side.
- **Anti-fab**: occasional estimation + flights written directly to `trip.flights[]` instead of
  `search → promote_flights`. Voygent-side.

---

## Part 6 — Pointers

- **voygent prod MCP:** `https://voygent.somotravel.workers.dev/mcp` (Worker `e83e3c35`).
- **voygent-lite memory** (this session's findings, in
  `~/.claude/projects/-home-neil-dev-voygent-lite/memory/`):
  `project_operating_core_via_mcp_instructions_field`,
  `reference_claudeai_stringifies_untyped_mcp_params`,
  `project_progress_feedback_narration_vs_mcp_progress`,
  `project_prompt_system_rewrite_in_progress`.
- **Demo session next step:** run your own brainstorming → writing-plans pass *from this design* —
  this doc is the approved design input, not a substitute for your implementation plan. Start with the
  Part 2 faithfulness deltas (they unlock the auto-update property); the reel + featured inspector
  build on top.
