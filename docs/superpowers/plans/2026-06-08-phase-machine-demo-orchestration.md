# Phase-Machine Demo Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo's open-ended agent loop with a server-side phase state machine in `SessionDO` so the worker deterministically drives each trip-build step and the model only ever sees one small instruction — killing the "stops early / presents instead of acting / narrates from memory" failure modes by construction.

**Architecture:** A pure, unit-tested reducer (`worker/agent/phases.ts`) owns the `TripPhase` enum, per-phase micro-directives, and an `advancePhase()` transition function driven by *observed tool results* (not model trust). `session-do.ts` holds/persists the current phase, injects the current phase's directive before each model turn, advances on each tool result, and auto-continues (capped) when the model stops mid-build. Two small, additive hooks are added to `loop.ts`. **The entire machine is gated behind a `DEMO_PHASE_MACHINE` env flag** — when unset, the existing seed-prompt + nudge behavior is byte-identical, so the live demo, the golden recording, and boards mode are untouched until we opt in. Ships dormant; instant rollback by deleting the secret.

**Tech Stack:** TypeScript, Cloudflare Workers (Durable Objects), Anthropic Messages API via `ClaudeProvider`, vitest.

---

## Background the engineer needs

- **Repo / worktree:** Work in `~/dev/voygent-demo` (the on-disk dir is `~/dev/voygent-demo-demo-enrichment`, a worktree of branch `demo-enrichment`). **Prod deploys from `demo-enrichment`, NOT `main`** — deploy-from-main clobbers. This plan creates a `phase-machine` branch off `demo-enrichment` and merges back when done.
- **The request path:** `worker/index.ts` routes `POST /chat` to a per-session `SessionDO` (named by `?session=`). `SessionDO.handleChat` (in `worker/session-do.ts`) builds the seed message, then runs `runAgentLoop()` (`worker/agent/loop.ts`) which streams the model, executes tool calls via `callTool`, and emits SSE events through a multiplexer. A folio panel re-renders from `read_trip` after each mutating tool.
- **Featured vs live trips:** Featured trips (Dublin, Cancún, Rome, Tokyo, NYC) replay captured fixtures deterministically via `worker/mcp/replay.ts` (zero cost, zero fabrication). Off-menu destinations latch `liveMode` and pass through to real MCP tools. **The acceptance test uses Dublin (featured).**
- **Existing deterministic seam:** `loop.ts` already supports a `nudge?(batch)` hook that appends a text block after a tool-result batch (currently used to force same-turn enrichment). The phase machine generalizes this seam.
- **CRITICAL naming collision:** `shared/models.ts` already exports `type Phase = "discovery" | "enrichment"` (that's the *model-routing* phase for the Smart selector). **Do NOT reuse `Phase`.** This plan's build-state type is named **`TripPhase`** and lives in `worker/agent/phases.ts`.
- **Boards mode:** the claude skin renders flight/hotel candidates as clickable cards and the model must "present and wait" (end its turn) for picks. The phase machine's `FLIGHT_PICK`/`HOTEL_PICK` directives must preserve this in boards mode (end turn) vs auto mode (model picks).
- **Test/verify commands (run from the worktree root):**
  - Typecheck: `npx tsc --noEmit`
  - Unit tests: `npx vitest run` (167 baseline at the start of this plan)
  - Single test file: `npx vitest run worker/agent/phases.test.ts`
- **Prompt-cache note:** `ClaudeProvider` (`worker/llm/claude.ts`) sets a moving cache breakpoint. Injecting a changing per-phase directive at the END of the message list only invalidates the small suffix — acceptable. Do NOT inject directives near the start (would bust the tools-block + system cache).

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `worker/agent/phases.ts` | `TripPhase` enum, ordering helpers, `phaseDirective()`, pure `advancePhase()` reducer + result-shape helpers. No env, no I/O. | **Create** |
| `worker/agent/phases.test.ts` | Table-driven transition tests; directive presence; helper tests. | **Create** |
| `worker/agent/loop.ts` | Add two additive, optional hooks: per-batch result-carrying advance + post-stop continuation. No behavior change when hooks absent. | **Modify** |
| `worker/agent/loop.test.ts` | Add tests for the continuation hook + result-carrying batch hook. | **Modify** |
| `worker/session-store.ts` | Add `tripPhase` to `SessRecord` (persisted DO state). | **Modify** |
| `worker/session-do.ts` | Hold/persist `tripPhase`; flag-gated directive injection, advance-on-result, auto-continuation cap. | **Modify** |
| `shared/events.ts` | Add `{ kind: "phase" }` inspector event (demo theater). | **Modify** |
| `web/src/App.tsx` + `web/src/Inspector.tsx` | Render the phase trail in the engineering panel. | **Modify** |
| `scripts/smoke-enriched-run.mjs` | Promote the acceptance SSE assertion (days≥3, ≥1 free + ≥1 paid, dining≥4, zero un-fixture prose names); add a `--repeat N` loop. | **Modify** |
| `docs/summaries/handoff-2026-06-08-phase-machine.md` | Handoff. | **Create at end** |

---

## Task 0: Branch + worktree setup

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch off `demo-enrichment`**

REQUIRED SUB-SKILL: Use superpowers:using-git-worktrees to create an isolated worktree. If using the household `/branch` skill instead, run it from the `demo-enrichment` worktree so the branch forks from there (NOT main).

Run:
```bash
cd /home/neil/dev/voygent-demo-demo-enrichment && git checkout -b phase-machine
```
Expected: `Switched to a new branch 'phase-machine'`

- [ ] **Step 2: Confirm baseline is green**

Run: `cd /home/neil/dev/voygent-demo-demo-enrichment && npx tsc --noEmit && npx vitest run 2>&1 | tail -3`
Expected: tsc silent; `Tests  167 passed (167)`.

---

## Task 1: `phases.ts` — `TripPhase` type, ordering, and directive map

**Files:**
- Create: `worker/agent/phases.ts`
- Test: `worker/agent/phases.test.ts`

- [ ] **Step 1: Write the failing test for the type/ordering surface**

Create `worker/agent/phases.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  TRIP_PHASES, INITIAL_PHASE, phaseIndex, isBeforeSummary, isActionPhase,
  phaseDirective, type TripPhase,
} from "./phases";

describe("trip phase ordering", () => {
  it("INITIAL_PHASE is INTAKE and is the lowest index", () => {
    expect(INITIAL_PHASE).toBe("INTAKE");
    expect(phaseIndex("INTAKE")).toBe(0);
  });
  it("phases are strictly ordered up to SUMMARY then EDITS", () => {
    expect(phaseIndex("FLIGHT_PICK")).toBeGreaterThan(phaseIndex("INTAKE"));
    expect(phaseIndex("ENRICH_DINING")).toBeLessThan(phaseIndex("SUMMARY"));
    expect(phaseIndex("EDITS")).toBeGreaterThan(phaseIndex("SUMMARY"));
  });
  it("isBeforeSummary is true for every build phase, false for SUMMARY/EDITS", () => {
    expect(isBeforeSummary("ENRICH_DINING")).toBe(true);
    expect(isBeforeSummary("SUMMARY")).toBe(false);
    expect(isBeforeSummary("EDITS")).toBe(false);
  });
  it("action phases exclude SUMMARY and EDITS", () => {
    expect(isActionPhase("INTAKE")).toBe(true);
    expect(isActionPhase("APPLY_PICKS")).toBe(true);
    expect(isActionPhase("SUMMARY")).toBe(false);
    expect(isActionPhase("EDITS")).toBe(false);
  });
});

describe("phaseDirective", () => {
  const ctx = { boardsMode: false, liveMode: false };
  it("returns a non-empty instruction for every phase", () => {
    for (const p of TRIP_PHASES) {
      expect(typeof phaseDirective(p as TripPhase, ctx)).toBe("string");
      expect(phaseDirective(p as TripPhase, ctx).length).toBeGreaterThan(10);
    }
  });
  it("names the right tool per phase", () => {
    expect(phaseDirective("HOTEL_SEARCH", ctx)).toContain("hotel_search");
    expect(phaseDirective("ENRICH_EXCURSIONS", ctx)).toContain("excursion_search");
    expect(phaseDirective("APPLY_PICKS", ctx)).toContain("apply_gap_tour_picks");
    expect(phaseDirective("ENRICH_DINING", ctx)).toContain("tripadvisor_search");
  });
  it("FLIGHT_PICK ends the turn in boards mode, acts in auto mode", () => {
    expect(phaseDirective("FLIGHT_PICK", { boardsMode: true, liveMode: false }).toLowerCase()).toContain("end your turn");
    expect(phaseDirective("FLIGHT_PICK", { boardsMode: false, liveMode: false }).toLowerCase()).toContain("promote_flights");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run worker/agent/phases.test.ts`
Expected: FAIL — `Cannot find module './phases'`.

- [ ] **Step 3: Create `worker/agent/phases.ts` with the type, ordering, and directive map**

```ts
// Server-side trip-build phase machine for the public demo. The worker decides
// what happens next; the model only ever sees ONE small instruction (the current
// phase's directive). Pure + unit-testable: no env, no DOM, no I/O.
//
// NAMING: distinct from shared/models.ts `Phase` ("discovery"|"enrichment", which
// is the model-routing phase for the Smart selector). This is the BUILD phase.

export type TripPhase =
  | "INTAKE"
  | "FLIGHT_PICK"
  | "HOTEL_SEARCH"
  | "HOTEL_PICK"
  | "ENRICH_EXCURSIONS"
  | "APPLY_PICKS"
  | "ENRICH_DINING"
  | "SUMMARY"
  | "EDITS";

// Linear order. EDITS sits after SUMMARY (it's the post-build follow-up phase).
export const TRIP_PHASES: TripPhase[] = [
  "INTAKE", "FLIGHT_PICK", "HOTEL_SEARCH", "HOTEL_PICK",
  "ENRICH_EXCURSIONS", "APPLY_PICKS", "ENRICH_DINING", "SUMMARY", "EDITS",
];
export const INITIAL_PHASE: TripPhase = "INTAKE";

export function phaseIndex(p: TripPhase): number { return TRIP_PHASES.indexOf(p); }
export function isBeforeSummary(p: TripPhase): boolean { return phaseIndex(p) < phaseIndex("SUMMARY"); }
export function isActionPhase(p: TripPhase): boolean { return p !== "SUMMARY" && p !== "EDITS"; }

// ctx is intentionally minimal: just the two flags that change the directive
// wording. Trip facts (city, dates, ids) are NOT interpolated — the directive uses
// angle-bracket placeholders the model fills from the conversation, exactly like the
// existing LIVE_TRIP_WORKFLOW seed. This avoids any route-resolution/staleness and
// keeps the reducer + directive fully pure. (Also used as the advancePhase ctx.)
export interface PhaseCtx { boardsMode: boolean; liveMode: boolean; }

// One small instruction per phase. Kept terse: the model also still has the global
// seed (vocabulary, fabrication, tone). v1 is code-only; a future v2 can override
// these from KV (_prompts/demo-phases/<phase>).
export function phaseDirective(phase: TripPhase, ctx: PhaseCtx): string {
  const { boardsMode } = ctx;
  switch (phase) {
    case "INTAKE":
      return "Phase INTAKE: create the trip, then search flights. Call save_trip with this trip's id and "
        + "{ meta:{ title, destination, dates }, flights:[], lodging:[] }, then flight_search "
        + "{ source:'serp', trip_id, origin, destination, departure_date, return_date, adults }. Do NOT write prose.";
    case "FLIGHT_PICK":
      return boardsMode
        ? "Phase FLIGHT_PICK: present the flight options in ONE short, friendly sentence (the option cards render "
          + "beside you — don't enumerate them in text) and END YOUR TURN. Do not stage or promote yet — wait for the traveler's pick."
        : "Phase FLIGHT_PICK: pick the single best flight candidate, stage it with patch_trip "
          + "updates { flights:[{ _candidateId:'<id>' }] }, then call promote_flights. Do NOT write prose.";
    case "HOTEL_SEARCH":
      return "Phase HOTEL_SEARCH: call hotel_search { source:'serp', trip_id, location:<destination city>, check_in, check_out, adults }"
        + (boardsMode
          ? ", then present the hotel options in ONE short sentence with a 2-3 line recommendation (which YOU'd pick and why), and END YOUR TURN."
          : ", then choose 2-3 and continue to staging. Do NOT write prose.");
    case "HOTEL_PICK":
      return boardsMode
        ? "Phase HOTEL_PICK: the traveler picked hotel(s). Stage the chosen id(s) with patch_trip "
          + "updates { hotels:[{ _candidateId:'<id>' }, ...] }, then call promote_hotels_to_lodging. Do NOT write prose."
        : "Phase HOTEL_PICK: stage the 2-3 chosen hotels with patch_trip updates { hotels:[{ _candidateId:'<id>' }, ...] }, "
          + "then call promote_hotels_to_lodging. Do NOT write prose.";
    case "ENRICH_EXCURSIONS":
      return "Phase ENRICH_EXCURSIONS: call excursion_search { source:'viator', destination_name:<destination city>, date:<departure_date> } now. Do NOT write prose, do NOT present options.";
    case "APPLY_PICKS":
      return "Phase APPLY_PICKS: call apply_gap_tour_picks { tripId, picks:[ { day, productCode }, ... ] } with 2-3 "
        + "candidates from the excursion results — include at least one free (free:true) and at least one paid. Do NOT write prose, do NOT ask.";
    case "ENRICH_DINING":
      return "Phase ENRICH_DINING: call tripadvisor_search { query:'best restaurants in <destination city>', category:'restaurants' } now. The dining picks save automatically. Do NOT write prose.";
    case "SUMMARY":
      return "Phase SUMMARY: now write ONE short message — summarize what you ADDED using ONLY exact names returned by the "
        + "tools in this conversation (never from memory), and note the folio now carries the day-by-day plan, dining, and what's-included notes.";
    case "EDITS":
      return "Phase EDITS: the trip is built. Handle the traveler's follow-up request directly (swap a hotel, re-pick an "
        + "activity, etc.) using the appropriate tools, then briefly confirm what changed. Use ONLY tool-returned names.";
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run worker/agent/phases.test.ts`
Expected: PASS (all assertions in this file).

- [ ] **Step 5: Commit**

```bash
git add worker/agent/phases.ts worker/agent/phases.test.ts
git commit -m "feat(phases): TripPhase enum, ordering helpers, per-phase directives"
```

---

## Task 2: `advancePhase()` reducer + result-shape helpers

**Files:**
- Modify: `worker/agent/phases.ts`
- Test: `worker/agent/phases.test.ts`

- [ ] **Step 1: Add failing reducer tests**

Append to `worker/agent/phases.test.ts`:
```ts
import { advancePhase } from "./phases";

const ctx = { boardsMode: true, liveMode: false };
const okPersisted = { status: "ok", persisted: true };
const okStatus = { status: "ok" };

describe("advancePhase", () => {
  it("INTAKE: save_trip is a no-op, flight_search advances to FLIGHT_PICK", () => {
    expect(advancePhase("INTAKE", "save_trip", {}, okStatus, ctx)).toBe("INTAKE");
    expect(advancePhase("INTAKE", "flight_search", {}, okStatus, ctx)).toBe("FLIGHT_PICK");
  });
  it("FLIGHT_PICK -> HOTEL_SEARCH only on promote_flights", () => {
    expect(advancePhase("FLIGHT_PICK", "patch_trip", {}, okStatus, ctx)).toBe("FLIGHT_PICK");
    expect(advancePhase("FLIGHT_PICK", "promote_flights", {}, okStatus, ctx)).toBe("HOTEL_SEARCH");
  });
  it("HOTEL_SEARCH advances on hotel_search OR hotel_search_and_rank", () => {
    expect(advancePhase("HOTEL_SEARCH", "hotel_search", {}, okStatus, ctx)).toBe("HOTEL_PICK");
    expect(advancePhase("HOTEL_SEARCH", "hotel_search_and_rank", {}, okStatus, ctx)).toBe("HOTEL_PICK");
  });
  it("HOTEL_PICK -> ENRICH_EXCURSIONS on promote, or on live lodging patch", () => {
    expect(advancePhase("HOTEL_PICK", "promote_hotels_to_lodging", {}, okStatus, ctx)).toBe("ENRICH_EXCURSIONS");
    expect(advancePhase("HOTEL_PICK", "patch_trip", { updates: { lodging: [{ name: "X" }] } }, okStatus, { ...ctx, liveMode: true })).toBe("ENRICH_EXCURSIONS");
    expect(advancePhase("HOTEL_PICK", "patch_trip", { updates: { hotels: [{}] } }, okStatus, { ...ctx, liveMode: true })).toBe("HOTEL_PICK");
  });
  it("ENRICH_EXCURSIONS -> APPLY_PICKS -> ENRICH_DINING -> SUMMARY", () => {
    expect(advancePhase("ENRICH_EXCURSIONS", "excursion_search", {}, okStatus, ctx)).toBe("APPLY_PICKS");
    expect(advancePhase("APPLY_PICKS", "apply_gap_tour_picks", {}, okPersisted, ctx)).toBe("ENRICH_DINING");
    expect(advancePhase("ENRICH_DINING", "tripadvisor_search", {}, okStatus, ctx)).toBe("SUMMARY");
  });
  it("APPLY_PICKS stays put when the result is not persisted", () => {
    expect(advancePhase("APPLY_PICKS", "apply_gap_tour_picks", {}, { status: "error", persisted: false }, ctx)).toBe("APPLY_PICKS");
  });
  it("a failed/error result never advances", () => {
    expect(advancePhase("INTAKE", "flight_search", {}, { status: "error" }, ctx)).toBe("INTAKE");
    expect(advancePhase("INTAKE", "flight_search", {}, null, ctx)).toBe("INTAKE"); // unparseable result
  });
  it("EDITS re-enters the right phase by observed tool", () => {
    expect(advancePhase("EDITS", "hotel_search", {}, okStatus, ctx)).toBe("HOTEL_PICK");
    expect(advancePhase("EDITS", "excursion_search", {}, okStatus, ctx)).toBe("APPLY_PICKS");
    expect(advancePhase("EDITS", "read_trip", {}, okStatus, ctx)).toBe("EDITS"); // non-build tool: stay
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run worker/agent/phases.test.ts`
Expected: FAIL — `advancePhase is not a function`.

- [ ] **Step 3: Implement the reducer + helpers in `worker/agent/phases.ts`**

Append to `worker/agent/phases.ts`:
```ts
// --- result-shape helpers (defensive; tool results are untrusted strings/objects) ---
function isOk(resultJson: any): boolean {
  if (resultJson == null) return false;                 // unparseable result → treat as not-ok
  if (typeof resultJson !== "object") return false;
  if (resultJson.status === "error" || resultJson.ok === false) return false;
  return true;
}
function isPersisted(resultJson: any): boolean {
  return isOk(resultJson) && resultJson.persisted !== false; // apply_gap_tour_picks sets persisted:true on success
}
function inputHasLodging(input: any): boolean {
  const updates = input?.updates ?? input;
  return !!updates && typeof updates === "object" && Array.isArray(updates.lodging) && updates.lodging.length > 0;
}

// Re-enter the relevant build phase from an observed tool during EDITS.
function reEnterFromEdit(toolName: string): TripPhase {
  switch (toolName) {
    case "flight_search": return "FLIGHT_PICK";
    case "hotel_search": case "hotel_search_and_rank": return "HOTEL_PICK";
    case "excursion_search": return "APPLY_PICKS";
    case "tripadvisor_search": return "SUMMARY";
    default: return "EDITS";
  }
}

/**
 * Pure transition: given the current phase and an OBSERVED tool call (name, input,
 * parsed result), return the next phase. Advance only on a successful result that
 * matches the phase's expected tool; otherwise return the SAME phase (the caller
 * owns retry caps + the structural auto-continuation). `resultJson` is the parsed
 * tool result, or null if it didn't parse as JSON. `ctx` is the same `PhaseCtx`
 * used by phaseDirective (only `liveMode` is read here).
 */
export function advancePhase(
  phase: TripPhase, toolName: string, input: any, resultJson: any, ctx: PhaseCtx,
): TripPhase {
  if (phase !== "APPLY_PICKS" && !isOk(resultJson)) return phase;
  switch (phase) {
    case "INTAKE":
      return toolName === "flight_search" ? "FLIGHT_PICK" : phase;
    case "FLIGHT_PICK":
      return toolName === "promote_flights" ? "HOTEL_SEARCH" : phase;
    case "HOTEL_SEARCH":
      return (toolName === "hotel_search" || toolName === "hotel_search_and_rank") ? "HOTEL_PICK" : phase;
    case "HOTEL_PICK":
      if (toolName === "promote_hotels_to_lodging") return "ENRICH_EXCURSIONS";
      if (ctx.liveMode && toolName === "patch_trip" && inputHasLodging(input)) return "ENRICH_EXCURSIONS";
      return phase;
    case "ENRICH_EXCURSIONS":
      return toolName === "excursion_search" ? "APPLY_PICKS" : phase;
    case "APPLY_PICKS":
      return (toolName === "apply_gap_tour_picks" && isPersisted(resultJson)) ? "ENRICH_DINING" : phase;
    case "ENRICH_DINING":
      return toolName === "tripadvisor_search" ? "SUMMARY" : phase;
    case "SUMMARY":
      return phase; // SUMMARY -> EDITS is driven by session-do once the summary message is emitted
    case "EDITS":
      return reEnterFromEdit(toolName);
    default:
      return phase;
  }
}
```

Note: `phaseDirective` and `advancePhase` share the same `PhaseCtx` type — session-do builds one ctx object (`{ boardsMode, liveMode }`) and passes it to both.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/agent/phases.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add worker/agent/phases.ts worker/agent/phases.test.ts
git commit -m "feat(phases): advancePhase reducer + result-shape helpers (advance by observation)"
```

---

## Task 3: persist `tripPhase` in `SessRecord`

**Files:**
- Modify: `worker/session-store.ts`
- Test: `worker/session-store.test.ts`

- [ ] **Step 1: Read the current `SessRecord` shape**

Run: `grep -n "SessRecord" worker/session-store.ts`
Read the interface so the new field matches the existing optional-field style (e.g. `liveMode`, `routing`, `hotelsPromoted` are already optional with `??` defaults on hydrate).

- [ ] **Step 2: Add a failing test asserting the field round-trips**

Add to `worker/session-store.test.ts` (match the file's existing import + describe style):
```ts
it("SessRecord carries an optional tripPhase", () => {
  const rec: SessRecord = { tripId: "t", boardsMode: false, liveMode: false, replay: {} as any, tripPhase: "ENRICH_DINING" };
  expect(rec.tripPhase).toBe("ENRICH_DINING");
});
```
(If `SessRecord` requires other fields, include them exactly as the existing tests construct one — copy from the nearest existing `SessRecord` literal in this test file.)

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run worker/session-store.test.ts`
Expected: FAIL — `tripPhase` not assignable / unknown property.

- [ ] **Step 4: Add the field to `SessRecord`**

In `worker/session-store.ts`, add to the `SessRecord` interface (import the type at the top of the file):
```ts
import type { TripPhase } from "./agent/phases";
// ...inside interface SessRecord { ... }
  tripPhase?: TripPhase;   // current build-machine phase (phase-machine mode only; undefined otherwise)
```

- [ ] **Step 5: Run to verify it passes + typecheck**

Run: `npx vitest run worker/session-store.test.ts && npx tsc --noEmit`
Expected: PASS; tsc silent.

- [ ] **Step 6: Commit**

```bash
git add worker/session-store.ts worker/session-store.test.ts
git commit -m "feat(phases): persist tripPhase on SessRecord"
```

---

## Task 4: `loop.ts` — add result-carrying batch hook + capped continuation

**Files:**
- Modify: `worker/agent/loop.ts`
- Test: `worker/agent/loop.test.ts`

The loop today: (a) calls `nudge?(batch)` with only `{name,input}` after a tool batch and appends the returned string; (b) `return`s (ending the turn) the moment the model produces no tool calls. We add two *additive, optional* hooks. **When neither new hook is provided, behavior is unchanged.**

- [ ] **Step 1: Write failing tests for the new hooks**

Read `worker/agent/loop.test.ts` first to reuse its existing fake-provider helper (it already constructs a provider that yields scripted `tool-call` / `turn-complete` events). Add:
```ts
it("afterToolBatch receives each tool's parsed-ish result text and its return is appended", async () => {
  // fake provider: turn 1 calls one tool, turn 2 produces no tools (stops).
  const seen: Array<{ name: string; result: string }> = [];
  // ...build provider that yields a tool-call 'flight_search' on turn 0, nothing on turn 1...
  await runAgentLoop({
    /* provider, tools, messages, emit, onFolio */ ...base,
    callTool: async () => JSON.stringify({ status: "ok" }),
    afterToolBatch: (batch) => { for (const b of batch) seen.push({ name: b.name, result: b.result }); return null; },
  } as any);
  expect(seen[0].name).toBe("flight_search");
  expect(seen[0].result).toContain("ok");
});

it("continueDirective injects a synthetic user turn when the model stops, capped", async () => {
  let calls = 0;
  // fake provider that NEVER calls a tool (always stops) → would end immediately today.
  await runAgentLoop({
    ...baseNoToolProvider,
    continueDirective: () => { calls++; return calls <= 2 ? "proceed" : null; },
  } as any);
  // 1 initial stop + 2 continuations that re-prompt, then null ends it.
  expect(calls).toBe(3);
});
```
(Fill `base` / `baseNoToolProvider` from the patterns already in `loop.test.ts`. If the existing file lacks a reusable fake provider, copy the one nearest the top of that file verbatim.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run worker/agent/loop.test.ts`
Expected: FAIL — `afterToolBatch` / `continueDirective` not invoked.

- [ ] **Step 3: Extend `AgentLoopArgs` and the loop body**

In `worker/agent/loop.ts`, add to `AgentLoopArgs` (keep the existing `nudge` for backward compat / flag-off path):
```ts
  // Phase-machine seam (additive; absent → unchanged behavior). Called once per
  // tool batch with each tool's parsed result text. Its return (if any) is
  // appended to the tool_result message exactly like `nudge`. Used to advance the
  // phase reducer and inject the next phase's directive.
  afterToolBatch?: (batch: Array<{ name: string; input: Record<string, unknown>; result: string }>) => string | null;
  // Phase-machine seam: called when the model produced NO tool calls (would end the
  // turn). Return a directive string to inject as a synthetic user turn and CONTINUE
  // the loop; return null to end the turn as usual. The implementer owns the cap.
  continueDirective?: () => string | null;
```

Replace the no-tool branch (currently `if (pendingTools.length === 0) { emit({ type: "turn-complete" }); return; }`) with:
```ts
    if (pendingTools.length === 0) {
      const cont = args.continueDirective?.();
      if (cont) {
        // Structural auto-continuation: re-prompt with the current phase directive
        // and keep looping (the model stopped mid-build). The hook owns the cap.
        messages.push({ role: "user", content: cont });
        continue;
      }
      emit({ type: "turn-complete" });
      return;
    }
```

Replace the existing post-batch nudge block:
```ts
    const note = args.nudge?.(pendingTools.map((t) => ({ name: t.name, input: t.input })));
    if (note) results.content.push({ type: "text", text: note });
```
with a version that prefers the result-carrying hook when present (so phase mode and legacy mode are mutually exclusive, both supported):
```ts
    const batchWithResults = pendingTools.map((t, i) => ({ name: t.name, input: t.input, result: resultTexts[i] }));
    const note = args.afterToolBatch
      ? args.afterToolBatch(batchWithResults)
      : args.nudge?.(pendingTools.map((t) => ({ name: t.name, input: t.input })));
    if (note) results.content.push({ type: "text", text: note });
```
To make `resultTexts[i]` available, capture each tool's `content` while iterating `pendingTools` — add `const resultTexts: string[] = [];` just before the `for (const t of pendingTools)` loop and `resultTexts.push(content);` immediately after `content` is finalized (right after the `emit({ type: "tool", ... phase: "done" ...})` line).

- [ ] **Step 4: Run tests to verify they pass + full suite + typecheck**

Run: `npx vitest run worker/agent/loop.test.ts && npx tsc --noEmit`
Expected: PASS; tsc silent. Also run `npx vitest run` — the 167 baseline must still pass (proves the flag-off path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add worker/agent/loop.ts worker/agent/loop.test.ts
git commit -m "feat(loop): additive afterToolBatch (result-carrying) + capped continueDirective hooks"
```

---

## Task 5: wire the phase machine into `session-do.ts` (flag-gated)

**Files:**
- Modify: `worker/session-do.ts`

This is the integration task. **Everything here is gated on `env.DEMO_PHASE_MACHINE` being set** — when unset, the existing seed + `nudge` path runs unchanged.

- [ ] **Step 1: Add the env flag to the `Env` interface**

In `worker/session-do.ts`, add to `interface Env`:
```ts
  DEMO_PHASE_MACHINE?: string;   // when set, SessionDO drives the deterministic build phase machine
```
And in `worker/index.ts` `interface Env`, add the same field (the top-level worker doesn't use it, but keep the interfaces consistent; safe to skip if index.ts doesn't reference it — it does not, so this is optional cosmetic).

- [ ] **Step 2: Hold + hydrate + persist `tripPhase`**

Add an instance field near the other latched state (`private liveMode = false;` etc.):
```ts
  private tripPhase: TripPhase = INITIAL_PHASE;
```
Import at the top: `import { INITIAL_PHASE, advancePhase, phaseDirective, isBeforeSummary, type TripPhase, type PhaseCtx } from "./agent/phases";`

In `hydrate()`, after the existing `this.routing = ...` line:
```ts
      this.tripPhase = sess.tripPhase ?? INITIAL_PHASE;
```
In `persistSession()`, add `tripPhase: this.tripPhase` to the `sess` object literal (alongside `routing`, `hotelsPromoted`).

- [ ] **Step 3: Add the flag check + a live-reading ctx builder at the top of `handleChat`**

After `this.routing = buildRouting(...)` in `handleChat`, add:
```ts
    const phaseMachine = !!this.env.DEMO_PHASE_MACHINE;
    // ctx is just the two mode flags. They change DURING an exchange (liveMode
    // latches mid-run when a search leaves the featured catalog), so build it fresh
    // on each read rather than snapshotting. Directives carry no trip facts — the
    // model fills <destination city>/<departure_date> from the conversation.
    const buildPhaseCtx = (): PhaseCtx => ({ boardsMode: this.boardsMode, liveMode: this.liveMode });
```
No route resolution is needed — this is why the directives use angle-bracket placeholders (Task 1) instead of interpolating city/dates.

- [ ] **Step 4: Inject the INTAKE directive into the seed (first turn only)**

Where the seed is pushed (the `if (this.messages.length === 0)` block), after pushing the seed user message, when `phaseMachine` is on, append the initial directive to the user's first real message so the model's first turn is phase-driven. Concretely, after `this.messages.push({ role: "user", content: message });`:
```ts
    if (phaseMachine && isBeforeSummary(this.tripPhase)) {
      this.messages.push({ role: "user", content: phaseDirective(this.tripPhase, buildPhaseCtx()) });
    }
```
(Two consecutive user messages are acceptable to the Anthropic API; alternatively append to the same message string. Appending a separate block keeps the directive visually distinct — fine either way. If the implementer prefers one user turn, concatenate `message + "\n\n" + directive`.)

- [ ] **Step 5: Implement the phase hooks and pass them to `runAgentLoop`**

Add a continuation counter local in `handleChat`: `let continuations = 0; const MAX_CONTINUATIONS = 4;`

In the `runAgentLoop({ ... })` call, when `phaseMachine` is on, pass `afterToolBatch` + `continueDirective` (and OMIT the legacy `nudge` so the two paths don't double-inject). The cleanest is to compute the options object conditionally. Pass:
```ts
      afterToolBatch: phaseMachine ? (batch) => {
        for (const b of batch) {
          let parsed: any = null;
          try { parsed = JSON.parse(b.result); } catch { /* non-JSON tool result */ }
          const next = advancePhase(this.tripPhase, b.name, b.input, parsed, buildPhaseCtx());
          if (next !== this.tripPhase) {
            this.tripPhase = next;
            emit({ type: "inspector", kind: "phase", exchangeId, phase: next, via: b.name }); // Task 7
          }
        }
        // Hand the model the CURRENT phase's directive after every tool batch —
        // including SUMMARY, so the model writes the closing message right after the
        // dining result. EDITS = post-build, no directive.
        return this.tripPhase === "EDITS" ? null : phaseDirective(this.tripPhase, buildPhaseCtx());
      } : undefined,
      continueDirective: phaseMachine ? () => {
        // The model stopped with no tool calls.
        // 1) Boards present-and-wait: a stop at a boards pick phase IS the model
        //    correctly waiting for the human — do NOT auto-continue. The traveler's
        //    next /chat POST re-enters the loop and afterToolBatch handles promotion.
        if (this.boardsMode && (this.tripPhase === "FLIGHT_PICK" || this.tripPhase === "HOTEL_PICK")) return null;
        // 2) At SUMMARY the model just wrote the closing message → advance to EDITS and end.
        if (this.tripPhase === "SUMMARY") { this.tripPhase = "EDITS"; return null; }
        // 3) Post-build (EDITS) → end the turn.
        if (!isBeforeSummary(this.tripPhase)) return null;
        // 4) Stopped mid-build: re-prompt with the current directive, capped. On the
        //    cap, force the SUMMARY directive so the trip always gets a closing message.
        if (continuations >= MAX_CONTINUATIONS) { this.tripPhase = "SUMMARY"; return phaseDirective("SUMMARY", buildPhaseCtx()); }
        continuations++;
        return phaseDirective(this.tripPhase, buildPhaseCtx());
      } : undefined,
      nudge: phaseMachine ? undefined : nudge,   // legacy path only when the machine is off
```
Normal flow: the dining tool result advances to SUMMARY and `afterToolBatch` appends the SUMMARY directive, so the model writes the closing message on the next turn; when it then stops, `continueDirective` advances SUMMARY→EDITS and ends. Stops-early flow: `continueDirective` re-prompts the current directive up to `MAX_CONTINUATIONS`, then forces SUMMARY — so the build can never wedge or end half-written.

- [ ] **Step 6: Typecheck + run full suite**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3`
Expected: tsc silent; all tests pass (the 167 baseline + the new phases/loop/store tests). The flag-off path is unchanged, so existing session-do behavior tests stay green.

- [ ] **Step 7: Commit**

```bash
git add worker/session-do.ts worker/index.ts
git commit -m "feat(phases): flag-gated phase-machine wiring in SessionDO (DEMO_PHASE_MACHINE)"
```

---

## Task 6: local smoke — prove the machine drives a full Dublin build (flag on)

**Files:** none (local run)

- [ ] **Step 1: Run the worker locally with the flag on**

Add `DEMO_PHASE_MACHINE=1` to `.dev.vars` (gitignored), plus the existing `ANTHROPIC_API_KEY`, `VOYGENT_MCP_URL`, `VOYGENT_MCP_BEARER`. Run:
```bash
npx wrangler dev --local --port 8787
```

- [ ] **Step 2: Drive a Dublin build over SSE and watch the phase events**

In another shell, POST a Dublin build and confirm the SSE stream shows phase transitions INTAKE→…→SUMMARY and a folio with activities + dining:
```bash
curl -sS -N -X POST "http://localhost:8787/chat?session=pm-smoke" -H "content-type: application/json" \
  --data '{"message":"Plan the Dublin in October trip for 2.","mode":"boards"}' | grep -E '"kind":"phase"|"type":"folio"' | tail -20
```
Expected: a sequence of `"kind":"phase"` events ending at `SUMMARY`, and folio events whose final payload has `days` with activities and `hotels` populated. (Boards mode will pause at FLIGHT_PICK — send the pick message to continue, mirroring `scripts/record-replay.mjs`'s 3-exchange flow. For a one-shot non-interactive check, POST with `"mode":"auto"`-equivalent by omitting `mode` so the model auto-picks.)

- [ ] **Step 3: Confirm flag-OFF is unchanged**

Remove `DEMO_PHASE_MACHINE` from `.dev.vars`, restart `wrangler dev`, repeat the POST, and confirm there are NO `"kind":"phase"` events and the build still completes (legacy nudge path). This is the regression guard.

*(No commit — this is a manual gate. If the machine wedges, fix the reducer/directives before proceeding.)*

---

## Task 7: inspector phase events — demo theater (the "engine drives the model" flex)

**Files:**
- Modify: `shared/events.ts`
- Modify: `web/src/App.tsx`, `web/src/Inspector.tsx`

This surfaces the machine stepping in the engineering panel — the whole marketing point ("the workflow engine drives; the model executes"). The `emit({ kind: "phase" })` call was already added in Task 5; this task defines the event type and renders it.

- [ ] **Step 1: Add the event to the `InspectorEvent` union**

In `shared/events.ts`, add to the `InspectorEvent` union:
```ts
  | { type: "inspector"; kind: "phase"; exchangeId: string; phase: string; via: string }
```

- [ ] **Step 2: Typecheck — the Task-5 emit call should now compile**

Run: `npx tsc --noEmit`
Expected: silent (the `emit({ ..., kind: "phase", ... })` in session-do now matches a union member).

- [ ] **Step 3: Capture phase events in `App.tsx`**

Add state `const [insPhases, setInsPhases] = useState<{ phase: string; via: string }[]>([]);` and in `applyEvent`'s inspector branch add `else if (e.kind === "phase") setInsPhases((p) => [...p, { phase: e.phase, via: e.via }]);`. Pass `phases={insPhases}` to `<Inspector />`.

- [ ] **Step 4: Render the phase trail in `Inspector.tsx`**

Add `phases?: { phase: string; via: string }[]` to the Inspector props. In the "Live this session" region, when `phases?.length`, render a compact trail:
```tsx
{phases && phases.length > 0 && (
  <div className="ins-phases">
    <h4>Workflow engine</h4>
    <div className="ins-phase-trail">
      {phases.map((p, i) => (
        <span key={i} className="ins-phase-step">{p.phase}{i < phases.length - 1 ? " → " : ""}</span>
      ))}
    </div>
    <p className="ins-note">The server-side phase machine drives each step; the model executes one instruction at a time.</p>
  </div>
)}
```
(No new CSS strictly required — reuses `ins-note`; `ins-phases`/`ins-phase-trail` are optional cosmetic hooks. Match the existing inspector section styling.)

- [ ] **Step 5: Typecheck + build the web app + run tests**

Run: `npx tsc --noEmit && VITE_API_BASE="" npm run build:web && npx vitest run 2>&1 | tail -3`
Expected: tsc silent; web build succeeds; tests pass.

- [ ] **Step 6: Commit**

```bash
git add shared/events.ts web/src/App.tsx web/src/Inspector.tsx
git commit -m "feat(phases): inspector phase events — show the workflow engine stepping"
```

---

## Task 8: /codex-review — external review of the phase machine

**Files:** none (review + fold findings)

This is the requested external review checkpoint. Run it now that the implementation is complete and all unit tests are green, BEFORE spending money on the live acceptance runs and before any deploy.

- [ ] **Step 1: Make sure the branch is committed and note the base SHA**

Run: `git log --oneline demo-enrichment..HEAD` — confirm Tasks 1–7 are all committed. Record the merge-base: `git merge-base demo-enrichment HEAD`.

- [ ] **Step 2: Invoke `/codex-review` on the phase-machine diff**

Invoke the skill with:
```
/codex-review repo=/home/neil/dev/voygent-demo-demo-enrichment range=<merge-base-sha>..HEAD — Review the server-side trip-build phase machine. Focus on: (1) state-machine soundness — can advancePhase get stuck or skip a phase given out-of-order or duplicate tool results in one batch? (2) the auto-continuation cap in session-do — can it infinite-loop or end a turn prematurely; is the boards-mode present-and-wait guard correct (must NOT auto-continue while awaiting a human pick at FLIGHT_PICK/HOTEL_PICK)? (3) flag isolation — is the DEMO_PHASE_MACHINE-off path provably byte-identical to today (seed + nudge), and is the legacy nudge correctly suppressed when the machine is on? (4) prompt-cache interaction — does injecting the per-phase directive at the END of the message list avoid busting the tools-block/system cache? (5) the SUMMARY→EDITS handoff and the retry-cap→SUMMARY escape hatch — are there paths where the model never writes a closing message or the folio is left half-built? (6) liveMode lodging-patch detection in advancePhase. Do NOT rewrite; report findings with file:line and severity.
```

- [ ] **Step 3: Triage findings**

REQUIRED SUB-SKILL: Use superpowers:receiving-code-review to evaluate each finding (verify before agreeing; push back on anything technically wrong). For each accepted finding, write a failing test first (extend `phases.test.ts` or `loop.test.ts`) where applicable, then fix, then re-run `npx vitest run`.

- [ ] **Step 4: Commit fixes**

```bash
git add -p   # stage only the review-fix changes by name
git commit -m "fix(phases): address /codex-review findings (<one-line summary>)"
```

---

## Task 9: acceptance — 10/10 haiku Dublin runs, promoted into the smoke script

**Files:**
- Modify: `scripts/smoke-enriched-run.mjs`

The spec's acceptance bar: with `LLM_MODEL=claude-haiku-4-5`, 10/10 scripted Dublin runs produce days ≥ 3, ≥1 free + ≥1 paid activity, dining ≥ 4, zero un-fixture names in prose.

- [ ] **Step 1: Read the current smoke script's assertions**

Run: `grep -n "assert\|days\|dining\|free\|paid\|fixture\|--repeat\|--base" scripts/smoke-enriched-run.mjs`
Identify what it already checks (it analyzes the SSE stream + final folio) and where to add a repeat loop + the prose-name check.

- [ ] **Step 2: Add a `--repeat N` loop and the acceptance assertions**

Extend `scripts/smoke-enriched-run.mjs` so `--repeat N` runs the Dublin build N times against `--base`, and per run asserts: final folio `days.length >= 3`; activities include `>= 1` with `free:true` (or priceFrom 0) AND `>= 1` paid; `dining.length >= 4`; and no restaurant/activity name appears in assistant *prose* that isn't present in the fixture (cross-check assistant text deltas against `worker/fixtures/dublin-oct.json` titles/names — flag any tour/restaurant-looking name in prose not found in the fixture). Print a per-run PASS/FAIL and an N/N summary; exit non-zero if any run fails. Use `process.env.DEMO_TEST_TOKEN` for the `x-demo-test` header (skips budget + stats) and `mode:"boards"` with the 3-exchange pick flow (or `auto` for a one-shot), mirroring `scripts/record-replay.mjs`.

- [ ] **Step 3: Run the acceptance suite against a flag-on deploy target**

The machine must run server-side, so point the smoke at a deployment (or local `wrangler dev`) that has `DEMO_PHASE_MACHINE=1` AND `LLM_MODEL=claude-haiku-4-5`. Easiest: local —
```bash
# .dev.vars: DEMO_PHASE_MACHINE=1, LLM_MODEL=claude-haiku-4-5, plus ANTHROPIC/MCP creds
npx wrangler dev --local --port 8787 &
export DEMO_TEST_TOKEN=$(grep '^DEMO_TEST_TOKEN=' .env | cut -d= -f2- | tr -d '"')
node scripts/smoke-enriched-run.mjs --base http://localhost:8787 --boards --repeat 10
```
Expected: `10/10 PASS`. If <10/10, the directives/reducer need tuning (iterate on `phases.ts`, re-run; do NOT lower the bar).

- [ ] **Step 4: Commit the smoke harness**

```bash
git add scripts/smoke-enriched-run.mjs
git commit -m "test(phases): acceptance smoke — 10x haiku Dublin build assertions (--repeat)"
```

---

## Task 10: merge to `demo-enrichment`, deploy dormant, canary, enable

**Files:** none (deploy)

The flag means we ship the code OFF first (zero risk), then canary, then enable.

- [ ] **Step 1: Merge the feature branch back to `demo-enrichment`**

```bash
git checkout demo-enrichment && git merge --no-ff phase-machine && npx tsc --noEmit && npx vitest run 2>&1 | tail -3
```
Expected: clean merge; tests pass.

- [ ] **Step 2: Deploy with the flag still OFF (code dormant)**

```bash
VITE_API_BASE="" npm run build:web && npx wrangler deploy
```
Verify the demo is unchanged for visitors (no `DEMO_PHASE_MACHINE` secret set yet → legacy path). Quick check: `curl -sS https://voygent-demo.somotravel.workers.dev/stats` still 200; a normal autoplay/build still works.

- [ ] **Step 3: Canary the flag on a test session**

Set the secret, then drive ONE real Dublin build with the test token and confirm phase events + a complete folio:
```bash
npx wrangler secret put DEMO_PHASE_MACHINE   # value: 1
# optionally: npx wrangler secret put LLM_MODEL  (value: claude-haiku-4-5) to test the cost win
export DEMO_TEST_TOKEN=$(grep '^DEMO_TEST_TOKEN=' .env | cut -d= -f2- | tr -d '"')
node scripts/smoke-enriched-run.mjs --base https://voygent-demo.somotravel.workers.dev --boards --repeat 3
```
Expected: `3/3 PASS`. **Instant rollback if anything is off:** `npx wrangler secret delete DEMO_PHASE_MACHINE` (reverts to the legacy path with no redeploy).

- [ ] **Step 4: Decide on haiku + record the outcome**

If 3/3 (and ideally a follow-up 10/10) pass on prod with haiku, leave `LLM_MODEL=claude-haiku-4-5` for the ~3× cost win. Write the handoff `docs/summaries/handoff-2026-06-08-phase-machine.md` (what shipped, the flag, the rollback command, the acceptance numbers, the deployed Worker version). Update the project memory pointer.

---

## Open questions — resolutions baked into this plan

- **KV namespace for phase prompts:** code-only v1 (per spec recommendation). `phaseDirective()` is the source of truth; a KV override (`_prompts/demo-phases/<phase>`) is a clean v2 and is NOT in scope here.
- **EDITS re-entry:** tool-observation only (`reEnterFromEdit`), no intent classifier. Sufficient for v1.
- **Inspector phase events:** included in v1 (Task 7) — they ARE the demo's marketing payload, and the emit hook is essentially free once the machine exists.
- **Rollout safety:** the `DEMO_PHASE_MACHINE` flag (not in the original spec) is added deliberately — a public, money-spending demo must ship this behavior change dormant with instant rollback. This is the single most important risk control in the plan.

## Non-goals (from the spec — do not touch)

- No changes to `worker/mcp/replay.ts` fixtures, the fabrication guard, `onFolio` overlay, `patch_trip` sanitize, the SSE contract shape (beyond the additive `kind:"phase"` event), or the captured fixtures / golden recording.
- Not a general voygent-lite framework — demo-repo only.
