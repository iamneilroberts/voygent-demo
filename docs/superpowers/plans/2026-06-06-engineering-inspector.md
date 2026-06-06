# Engineering Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle-able "Engineering Inspector" drawer to the voygent-demo SPA that surfaces real per-session engineering (orchestration graph, tool round-trips, token/cost meter vs subscription tiers, context-saved meter, observer-effect overhead) plus static "behind the scenes" cards and a business-case section.

**Architecture:** The agent loop emits new `inspector` SSE events (tool round-trips with latency + scrubbed args/result; one per-turn usage event per provider call). `session-do.ts` wraps `emit` to inject real cost, emits per-mechanism `savings` + an `overhead` + a `summary` event (cost computed server-side so the client never holds pricing). The React app accumulates these across the session into a drawer. Pure, unit-testable helpers live in `worker/inspector.ts`; the loop stays provider/pricing-agnostic.

**Tech Stack:** TypeScript, Cloudflare Workers (workerd) + Durable Objects, React + Vite, vitest. SSE over `ReadableStream`.

**Source spec:** `docs/superpowers/specs/2026-06-06-engineering-inspector-design.md` (commit `36a7708`).

**Slicing (build in order; each ends green + demoable):**
- **Slice 1 — Live inspector spine** (Tasks 1–8): events, helpers, loop, session-do summary, drawer region 1, cost meter + tier table.
- **Slice 2 — Measured savings + overhead** (Tasks 9–14): savings/overhead events, four live mechanisms, capture-script change + gated recapture, context-saved + observer-effect UI.
- **Slice 3 — Static cards + business case** (Tasks 15–17): behind-the-scenes cards, business-case table.

**Conventions:**
- Run all worker/shared tests with `npm run test`. Typecheck with `npx tsc --noEmit`.
- Build the SPA with `rm -rf dist-web && VITE_API_BASE="" npm run build:web`.
- Stage files by name (never `git add -A`). Do **not** modify the voygent-lite repo.

---

# SLICE 1 — Live inspector spine

## Task 1: Extend the `ServerEvent` union with inspector events

**Files:**
- Modify: `shared/events.ts`
- Test: `shared/events.test.ts`

- [ ] **Step 1: Write the failing test** — append to `shared/events.test.ts` inside the existing `describe("encodeSse", …)`:

```ts
  it("round-trips an inspector tool event", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "tool", exchangeId: "x1", turn: 0,
      name: "flight_search", args: { origin: "MOB" }, result: '{"count":2}', latencyMs: 12, ok: true,
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });

  it("round-trips an inspector summary event with costByModel", () => {
    const ev: ServerEvent = {
      type: "inspector", kind: "summary", exchangeId: "x1",
      turns: 3, toolCalls: 6, exposedToolCount: 9, fullToolCount: 79,
      inputTokens: 1200, outputTokens: 300, cacheReadTokens: 980, cacheCreationTokens: 0,
      costByModel: { haiku: 0.0026, sonnet: 0.013, opus: 0.065 },
    };
    const decoded = JSON.parse(encodeSse(ev).slice("data: ".length).trim());
    expect(decoded).toEqual(ev);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- shared/events.test.ts`
Expected: TypeScript/compile error — `inspector` not assignable to `ServerEvent`.

- [ ] **Step 3: Implement** — in `shared/events.ts`, replace the `ServerEvent` union and add `InspectorEvent` below the existing `FolioData` interface:

```ts
export type ServerEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; tool: string; phase: "start" | "done"; summary?: string }
  | { type: "folio"; folio: FolioData }
  | { type: "turn-complete" }
  | { type: "error"; message: string }
  | InspectorEvent;

export type InspectorEvent =
  | { type: "inspector"; kind: "tool"; exchangeId: string; turn: number; name: string;
      args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean }
  | { type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      costUsd: number }
  | { type: "inspector"; kind: "savings"; exchangeId: string;
      mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
      tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string }
  | { type: "inspector"; kind: "overhead"; exchangeId: string;
      instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
      folioReprojectMs?: number | null; note?: string }
  | { type: "inspector"; kind: "summary"; exchangeId: string;
      turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
      inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
      costByModel: { haiku: number; sonnet: number; opus: number } };
```

Leave `encodeSse` unchanged (it already stringifies any `ServerEvent`).

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- shared/events.test.ts`
Expected: PASS (all encodeSse tests green).

- [ ] **Step 5: Commit**

```bash
git add shared/events.ts shared/events.test.ts
git commit -m "feat(demo): add inspector SSE event variants"
```

---

## Task 2: Pure inspector helpers (`worker/inspector.ts`)

**Files:**
- Create: `worker/inspector.ts`
- Test: `worker/inspector.test.ts`

- [ ] **Step 1: Write the failing test** — `worker/inspector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  estTokens, utf8Bytes, scrubArgs, scrubResultText, scrubAdvisor,
  withInspectorCost, sessionCostByModel, stageForTool,
} from "./inspector";
import type { ServerEvent } from "../shared/events";

describe("estTokens / utf8Bytes", () => {
  it("estTokens is ceil(len/4)", () => { expect(estTokens("abcde")).toBe(2); });
  it("utf8Bytes counts UTF-8 bytes, not UTF-16 units", () => {
    expect("€".length).toBe(1);        // 1 UTF-16 unit
    expect(utf8Bytes("€")).toBe(3);    // 3 UTF-8 bytes
  });
});

describe("scrubAdvisor", () => {
  it("drops advisor-only keys in nested objects and arrays", () => {
    const input = { price: 100, commission: 12, items: [{ netRate: 9, name: "x" }] };
    expect(scrubAdvisor(input)).toEqual({ price: 100, items: [{ name: "x" }] });
  });
  it("bounds recursion at depth 8 with a sentinel", () => {
    let deep: any = { v: 1 };
    for (let i = 0; i < 12; i++) deep = { nest: deep };
    const out = JSON.stringify(scrubAdvisor(deep));
    expect(out).toContain("[scrub: too deep]");
  });
  it("scrubResultText passes through non-JSON unchanged", () => {
    expect(scrubResultText("not json")).toBe("not json");
  });
  it("scrubArgs strips advisor keys from args", () => {
    expect(scrubArgs({ origin: "MOB", markupPct: 5 })).toEqual({ origin: "MOB" });
  });
});

describe("withInspectorCost", () => {
  it("fills costUsd on a zero-cost turn event", () => {
    const ev: ServerEvent = { type: "inspector", kind: "turn", exchangeId: "x", turn: 0,
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
    const out = withInspectorCost(ev, "claude-haiku-4-5");
    expect(out).toMatchObject({ kind: "turn", costUsd: 1 }); // haiku $1 / Mtok input
  });
  it("passes non-turn events through untouched", () => {
    const ev: ServerEvent = { type: "text", delta: "hi" };
    expect(withInspectorCost(ev, "claude-haiku-4-5")).toBe(ev);
  });
});

describe("sessionCostByModel", () => {
  it("returns three model costs (opus > sonnet > haiku for same usage)", () => {
    const c = sessionCostByModel({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(c.opus).toBeGreaterThan(c.sonnet);
    expect(c.sonnet).toBeGreaterThan(c.haiku);
  });
});

describe("stageForTool", () => {
  it("maps tools to orchestration stages", () => {
    expect(stageForTool("save_trip")).toBe("create");
    expect(stageForTool("flight_search")).toBe("search");
    expect(stageForTool("flight_list")).toBe("distill");
    expect(stageForTool("patch_trip")).toBe("stage");
    expect(stageForTool("promote_flights")).toBe("promote");
    expect(stageForTool("read_trip")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- worker/inspector.test.ts`
Expected: FAIL — `Cannot find module './inspector'`.

- [ ] **Step 3: Implement** — create `worker/inspector.ts`:

```ts
import { estimateCostUsd } from "./llm/cost";
import type { TokenUsage } from "./llm/provider";
import type { ServerEvent } from "../shared/events";

/** Token ESTIMATE only (chars÷4). Never used for wire-byte accounting. */
export function estTokens(s: string): number { return Math.ceil(s.length / 4); }

const _enc = new TextEncoder();
/** Exact UTF-8 wire bytes (NOT UTF-16 String#length). */
export function utf8Bytes(s: string): number { return _enc.encode(s).length; }

const ADVISOR_KEY = /^(commission|commissionable|netRate|net_rate|markup|advisorNotes|advisor_only)/i;
const MAX_DEPTH = 8;

/** Defense-in-depth: drop advisor-economics keys anywhere in a value. Bounded recursion. */
export function scrubAdvisor(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[scrub: too deep]";
  if (Array.isArray(value)) return value.map((v) => scrubAdvisor(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ADVISOR_KEY.test(k)) continue;
      out[k] = scrubAdvisor(v, depth + 1);
    }
    return out;
  }
  return value;
}
export function scrubArgs(obj: Record<string, unknown>): Record<string, unknown> {
  return scrubAdvisor(obj) as Record<string, unknown>;
}
export function scrubResultText(raw: string): string {
  try { return JSON.stringify(scrubAdvisor(JSON.parse(raw))); }
  catch { return raw; }
}

/** Inject real USD into a zero-cost turn event; passthrough everything else. */
export function withInspectorCost(ev: ServerEvent, model: string): ServerEvent {
  if (ev.type === "inspector" && ev.kind === "turn" && ev.costUsd === 0) {
    return { ...ev, costUsd: estimateCostUsd(model, {
      inputTokens: ev.inputTokens, outputTokens: ev.outputTokens,
      cacheCreationTokens: ev.cacheCreationTokens, cacheReadTokens: ev.cacheReadTokens,
    }) };
  }
  return ev;
}

const COST_MODELS = { haiku: "claude-haiku-4-5", sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-8" } as const;
/** This session's real cost under each model tier (server-side; client never holds pricing). */
export function sessionCostByModel(u: TokenUsage): { haiku: number; sonnet: number; opus: number } {
  return {
    haiku: estimateCostUsd(COST_MODELS.haiku, u),
    sonnet: estimateCostUsd(COST_MODELS.sonnet, u),
    opus: estimateCostUsd(COST_MODELS.opus, u),
  };
}

export type OrchStage = "create" | "search" | "distill" | "stage" | "promote" | "render";
export function stageForTool(name: string): OrchStage | null {
  if (name === "save_trip") return "create";
  if (name === "flight_search" || name === "hotel_search") return "search";
  if (name === "flight_list" || name === "hotel_list") return "distill";
  if (name === "patch_trip") return "stage";
  if (name === "promote_flights" || name === "promote_hotels_to_lodging") return "promote";
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- worker/inspector.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add worker/inspector.ts worker/inspector.test.ts
git commit -m "feat(demo): pure inspector helpers (estTokens/utf8Bytes/scrub/cost/stage)"
```

---

## Task 3: Loop emits inspector tool + turn events

**Files:**
- Modify: `worker/agent/loop.ts`
- Test: `worker/agent/loop.test.ts`

- [ ] **Step 1: Update the existing failing-expectation test** — in `worker/agent/loop.test.ts`, the first test now sees an inspector `turn` event between `text` and `turn-complete`. Replace its assertion:

```ts
    expect(out.filter((e) => e.type !== "inspector").map((e) => e.type)).toEqual(["text", "turn-complete"]);
    expect(out.some((e) => e.type === "inspector" && (e as any).kind === "turn")).toBe(true);
```

Append a new test inside the `describe`:

```ts
  it("emits an inspector tool event with scrubbed args, ok flag, and numeric latency", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_use", id: "tu9", name: "flight_search", input: { trip_id: "t9", markupPct: 5 } }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "ok" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tu9", name: "flight_search", input: { trip_id: "t9", markupPct: 5 } }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "ok" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [], exchangeId: "EX1",
      messages: [{ role: "user", content: "go" }] as ConversationMessage[],
      callTool: async (name) => `result of ${name}`,
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    const tool = out.find((e) => e.type === "inspector" && (e as any).kind === "tool") as any;
    expect(tool).toBeTruthy();
    expect(tool.name).toBe("flight_search");
    expect(tool.args).toEqual({ trip_id: "t9" });   // markupPct scrubbed
    expect(tool.ok).toBe(true);
    expect(typeof tool.latencyMs).toBe("number");
    expect(tool.exchangeId).toBe("EX1");
  });

  it("marks ok=false when a tool throws", async () => {
    const asstWithTool: AssistantMessage = {
      role: "assistant", content: [{ type: "tool_use", id: "tuE", name: "hotel_search", input: {} }],
    };
    const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "x" }] };
    const provider = fakeProvider([
      [{ type: "tool-call", id: "tuE", name: "hotel_search", input: {} }, { type: "turn-complete", assistant: asstWithTool }],
      [{ type: "text-delta", delta: "x" }, { type: "turn-complete", assistant: asstFinal }],
    ]);
    const out: ServerEvent[] = [];
    await runAgentLoop({
      provider, tools: [], exchangeId: "EX2",
      messages: [{ role: "user", content: "go" }] as ConversationMessage[],
      callTool: async () => { throw new Error("boom"); },
      onFolio: async () => {},
      emit: (e) => out.push(e),
    });
    const tool = out.find((e) => e.type === "inspector" && (e as any).kind === "tool") as any;
    expect(tool.ok).toBe(false);
    expect(tool.result).toContain("boom");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- worker/agent/loop.test.ts`
Expected: FAIL — no inspector events emitted; `exchangeId` not accepted.

- [ ] **Step 3: Implement** — edit `worker/agent/loop.ts`:

Add the import at top:

```ts
import { scrubArgs, scrubResultText } from "../inspector";
import type { TokenUsage } from "../llm/provider";
```

Add `exchangeId?: string;` to the `AgentLoopArgs` interface (after `maxToolCalls?`).

Replace the body of `runAgentLoop` from the `const { … } = args;` line through the end with:

```ts
  const { provider, tools, messages, callTool, onFolio, emit } = args;
  const exchangeId = args.exchangeId ?? "";
  const maxTurns = args.maxTurns ?? 12;
  const maxToolCalls = args.maxToolCalls ?? 24;
  let totalToolCalls = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const pendingTools: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    const tu: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

    for await (const ev of provider.stream(messages, tools)) {
      if (ev.type === "text-delta") {
        emit({ type: "text", delta: ev.delta });
      } else if (ev.type === "tool-call") {
        pendingTools.push({ id: ev.id, name: ev.name, input: ev.input });
      } else if (ev.type === "usage") {
        args.onUsage?.(ev.usage);
        tu.inputTokens += ev.usage.inputTokens;
        tu.outputTokens += ev.usage.outputTokens;
        tu.cacheCreationTokens += ev.usage.cacheCreationTokens;
        tu.cacheReadTokens += ev.usage.cacheReadTokens;
      } else if (ev.type === "turn-complete") {
        messages.push(ev.assistant);
      }
    }

    // Exactly one turn event per provider call (incl. the final no-tool answer turn).
    // costUsd:0 is filled by session-do's emit wrapper (loop stays pricing-agnostic).
    emit({
      type: "inspector", kind: "turn", exchangeId, turn,
      inputTokens: tu.inputTokens, outputTokens: tu.outputTokens,
      cacheReadTokens: tu.cacheReadTokens, cacheCreationTokens: tu.cacheCreationTokens, costUsd: 0,
    });

    if (pendingTools.length === 0) { emit({ type: "turn-complete" }); return; }

    const results: { role: "user"; content: Array<{ type: "tool_result"; tool_use_id: string; content: string }> } = {
      role: "user", content: [],
    };
    for (const t of pendingTools) {
      emit({ type: "tool", tool: t.name, phase: "start" });
      const t0 = Date.now();
      let content: string;
      let ok = true;
      try { content = await callTool(t.name, t.input); if (content.startsWith("ERROR:")) ok = false; }
      catch (e) { content = `ERROR: ${(e as Error).message}`; ok = false; }
      const latencyMs = Date.now() - t0;
      emit({ type: "tool", tool: t.name, phase: "done", summary: content.slice(0, 120) });
      // Rich, persisted twin — args+result SCRUBBED for the client side channel only;
      // the model still receives the unscrubbed `content` below.
      emit({
        type: "inspector", kind: "tool", exchangeId, turn, name: t.name,
        args: scrubArgs(t.input), result: scrubResultText(content), latencyMs, ok,
      });
      results.content.push({ type: "tool_result", tool_use_id: t.id, content });
      if (isTripMutating(t.name, t.input)) {
        try { await onFolio(t.name, t.input); }
        catch { /* folio refresh is best-effort; a failed refresh must never abort the turn */ }
      }
    }
    messages.push(results);
    totalToolCalls += pendingTools.length;
    if (totalToolCalls >= maxToolCalls) { emit({ type: "turn-complete" }); return; }
  }
  emit({ type: "turn-complete" });
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- worker/agent/loop.test.ts`
Expected: PASS (all four tests, including the two new ones).

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm run test
git add worker/agent/loop.ts worker/agent/loop.test.ts
git commit -m "feat(demo): loop emits inspector tool+turn events with latency"
```

Expected: tsc clean; suite green.

---

## Task 4: session-do wires exchangeId, cost injection, and the summary event

**Files:**
- Modify: `worker/session-do.ts`

This DO method is exercised via the live demo / E2E harness rather than a unit test (it owns I/O + streaming). The pure logic it relies on is already unit-tested in Task 2.

- [ ] **Step 1: Add imports** — at the top of `worker/session-do.ts`, extend the inspector/cost import line:

```ts
import { estimateCostUsd } from "./llm/cost";
import { withInspectorCost, sessionCostByModel } from "./inspector";
```

(`estimateCostUsd` is already imported — keep one import; add `withInspectorCost, sessionCostByModel`.)

- [ ] **Step 2: Mint exchangeId + counters + cost-aware emit** — inside `handleChat`, replace the telemetry/emit setup block (the lines from `// Per-session cost telemetry …` down to the start of the `void (async () => {` IIFE) with:

```ts
    // Per-session cost telemetry (server-side only — never sent to the client).
    let sessionCost = 0;
    const u: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };

    // Inspector bookkeeping (Slice 1: summary spine).
    const exchangeId = crypto.randomUUID();
    let turnCount = 0;
    let toolCallCount = 0;
    let fullToolCount = 0;
    let exposedToolCount = 0;

    // Cost-aware emit: inject real $ into zero-cost turn events; tally inspector counters.
    const emit = (e: ServerEvent): boolean => {
      const ev = withInspectorCost(e, model);
      if (ev.type === "inspector") {
        if (ev.kind === "turn") turnCount++;
        else if (ev.kind === "tool") toolCallCount++;
      }
      return mux.send(ev);
    };
```

Add the `ServerEvent` type import if not present — at the top: `import type { ServerEvent } from "../shared/events";`.

- [ ] **Step 3: Use `emit` + exchangeId in the loop call** — inside the IIFE, change the tool-list capture and the `runAgentLoop` call:

```ts
        // Restrict the catalog to the tools the demo actually uses (cost guardrail).
        const fullTools = await mcp.listTools();
        fullToolCount = fullTools.length;
        const tools = fullTools.filter((t) => DEMO_TOOLS.has(t.name));
        exposedToolCount = tools.length;
        await runAgentLoop({
          provider, tools, messages: this.messages, exchangeId,
          callTool,
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* tolerate */ }
            const data = (parsed && typeof parsed === "object" && parsed.data) ? parsed.data : (parsed ?? {});
            const promoted = this.replay.lastPromoted();
            if (promoted.flights != null) data.flights = promoted.flights;
            if (promoted.lodging != null) data.lodging = promoted.lodging;
            mux.send({ type: "folio", folio: tripToFolio(this.tripId, { data }) });
          },
          onUsage: (turn) => {
            u.inputTokens += turn.inputTokens; u.outputTokens += turn.outputTokens;
            u.cacheCreationTokens += turn.cacheCreationTokens; u.cacheReadTokens += turn.cacheReadTokens;
            sessionCost += estimateCostUsd(model, turn);
          },
          emit,
        });
```

- [ ] **Step 4: Emit the summary BEFORE closing the stream** — replace the `finally` block with:

```ts
      } finally {
        // Inspector summary — emitted while the stream is still open.
        emit({
          type: "inspector", kind: "summary", exchangeId,
          turns: turnCount, toolCalls: toolCallCount, exposedToolCount, fullToolCount,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens, cacheCreationTokens: u.cacheCreationTokens,
          costByModel: sessionCostByModel(u),
        });
        mux.close();
        // Record cost: log (visible via `wrangler tail`) + add to the daily ledger.
        console.log(`[cost] model=${model} trip=${this.tripId} in=${u.inputTokens} out=${u.outputTokens} cacheR=${u.cacheReadTokens} cacheW=${u.cacheCreationTokens} usd=${sessionCost.toFixed(4)}`);
        if (sessionCost > 0) {
          try { await this.budgetStub().fetch("https://do/__budget/add", { method: "POST", body: JSON.stringify({ usd: sessionCost }) }); }
          catch { /* ledger update is best-effort */ }
        }
      }
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add worker/session-do.ts
git commit -m "feat(demo): session-do injects cost + emits inspector summary"
```

Expected: tsc clean.

---

## Task 5: App accumulates inspector events + opens the drawer

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Add inspector types + state** — in `web/src/App.tsx`, after the existing imports add:

```ts
import { Inspector, type InsTool, type InsTurn, type InsSummary } from "./Inspector";
```

Inside `App()`, after the existing `useState` hooks add:

```ts
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [insTools, setInsTools] = useState<InsTool[]>([]);
  const [insTurns, setInsTurns] = useState<InsTurn[]>([]);
  const [insSummaries, setInsSummaries] = useState<InsSummary[]>([]);
```

- [ ] **Step 2: Handle inspector events in the stream callback** — in `send`, extend the `streamChat` event handler (after the `else if (e.type === "error")` branch):

```ts
        else if (e.type === "inspector") {
          if (e.kind === "tool") setInsTools((t) => [...t, e]);
          else if (e.kind === "turn") setInsTurns((t) => [...t, e]);
          else if (e.kind === "summary") setInsSummaries((s) => [...s, e]);
          // savings/overhead handled in Slice 2
        }
```

(Inspector state is NOT reset per send — the panel shows the whole session.)

- [ ] **Step 3: Render the header toggle + drawer** — replace the `return ( … )` JSX with:

```tsx
  return (
    <div className="app">
      <header>
        <strong>Voygent</strong> <span className="sub">AI travel-planning agent</span>{" "}
        <span className="by">built by Neil Roberts</span>
        <button className="inspector-toggle" onClick={() => setInspectorOpen((o) => !o)}>
          🔍 Inspector
        </button>
      </header>
      <div className="cols">
        <ChatView messages={messages} tools={tools} onSend={send} busy={busy} presets={presets} geoCity={geoCity} />
        <FolioPanel folio={folio} />
      </div>
      <Inspector
        open={inspectorOpen} onClose={() => setInspectorOpen(false)}
        tools={insTools} turns={insTurns} summaries={insSummaries}
      />
    </div>
  );
```

- [ ] **Step 4: Commit** (build verified after Task 7 once `Inspector.tsx` exists)

```bash
git add web/src/App.tsx
git commit -m "feat(demo): accumulate inspector events + drawer toggle in App"
```

---

## Task 6: Static tier-table data (`web/src/inspector-data.ts`)

**Files:**
- Create: `web/src/inspector-data.ts`

- [ ] **Step 1: Implement** — create `web/src/inspector-data.ts` (extended in Slice 3):

```ts
// Static, clearly-labeled reference data for the Inspector. Subscription figures are
// community-observed ESTIMATES — Anthropic meters by rolling 5-hour windows + weekly
// caps, NOT monthly token quotas — and are shared across claude.ai chat + Claude Code.
export interface PlanTier {
  id: string; name: string; priceMo: number;
  windowTokens: number | null; windowNote?: string;
  monthlyEstTokens: number | null;   // window × 1 fresh window/day × 30 (labeled assumption)
}

export const PLAN_TIERS: PlanTier[] = [
  { id: "free",  name: "Free",   priceMo: 0,   windowTokens: null,    windowNote: "a few short chats", monthlyEstTokens: null },
  { id: "pro",   name: "Pro",    priceMo: 20,  windowTokens: 44_000,  monthlyEstTokens: 1_320_000 },
  { id: "max5",  name: "Max 5×", priceMo: 100, windowTokens: 88_000,  monthlyEstTokens: 2_640_000 },
  { id: "max20", name: "Max 20×",priceMo: 200, windowTokens: 220_000, monthlyEstTokens: 6_600_000 },
];

export const TIER_DISCLAIMER =
  "Estimated — Anthropic meters by rolling 5-hour windows + weekly caps, not monthly token quotas; " +
  "figures are community-observed and shared across claude.ai chat + Claude Code.";

export const TIER_SOURCES: { label: string; url: string }[] = [
  { label: "Claude Help Center — What is the Max plan?", url: "https://support.claude.com/en/articles/11049741" },
  { label: "Claude Help Center — How usage & length limits work", url: "https://support.claude.com/en/articles/11647753" },
  { label: "IntuitionLabs — Claude Max plan pricing & limits", url: "https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits" },
  { label: "TokenMix — Claude limits 2026 (5-hr / weekly)", url: "https://tokenmix.ai/blog/complete-claude-limits-guide-2026-tokens-uploads-5-hour" },
];
```

- [ ] **Step 2: Commit**

```bash
git add web/src/inspector-data.ts
git commit -m "feat(demo): inspector static tier-table data"
```

---

## Task 7: Inspector drawer — region 1 (graph, timeline, scoreboard, cost meter)

**Files:**
- Create: `web/src/Inspector.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Implement the component** — create `web/src/Inspector.tsx`:

```tsx
import { useState } from "react";
import { PLAN_TIERS, TIER_DISCLAIMER, TIER_SOURCES } from "./inspector-data";

export interface InsTool {
  type: "inspector"; kind: "tool"; exchangeId: string; turn: number;
  name: string; args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean;
}
export interface InsTurn {
  type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; costUsd: number;
}
export interface InsSummary {
  type: "inspector"; kind: "summary"; exchangeId: string;
  turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
  costByModel: { haiku: number; sonnet: number; opus: number };
}

const STAGES: { key: string; label: string; tools: string[] }[] = [
  { key: "create",  label: "Create",  tools: ["save_trip"] },
  { key: "search",  label: "Search",  tools: ["flight_search", "hotel_search"] },
  { key: "distill", label: "Distill", tools: ["flight_list", "hotel_list"] },
  { key: "stage",   label: "Stage",   tools: ["patch_trip"] },
  { key: "promote", label: "Promote", tools: ["promote_flights", "promote_hotels_to_lodging"] },
  { key: "render",  label: "Render",  tools: [] }, // lit when any folio exists (>=1 promote)
];

function fmt(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function usd(n: number): string { return `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`; }

function ToolRow({ t }: { t: InsTool }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`ins-tool ${t.ok ? "" : "err"}`}>
      <button className="ins-tool-head" onClick={() => setOpen((o) => !o)}>
        <span>{open ? "▾" : "▸"} {t.name}</span>
        <span className="ins-lat">{t.latencyMs} ms {t.ok ? "✓" : "✗"}</span>
      </button>
      {open && (
        <pre className="ins-raw">{JSON.stringify({ args: t.args, result: safeParse(t.result) }, null, 2)}</pre>
      )}
    </div>
  );
}
function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

export function Inspector(
  { open, onClose, tools, turns, summaries }:
  { open: boolean; onClose: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[] },
) {
  const [showCost, setShowCost] = useState(false);
  if (!open) return null;

  const firedTools = new Set(tools.map((t) => t.name));
  const hasFolio = tools.some((t) => t.name.startsWith("promote_"));
  const stageActive = (s: typeof STAGES[number]) =>
    s.key === "render" ? hasFolio : s.tools.some((n) => firedTools.has(n));

  const tokensIn = turns.reduce((a, t) => a + t.inputTokens, 0);
  const tokensOut = turns.reduce((a, t) => a + t.outputTokens, 0);
  const cacheRead = turns.reduce((a, t) => a + t.cacheReadTokens, 0);
  const latest = summaries[summaries.length - 1];
  const cost = summaries.reduce(
    (a, s) => ({ haiku: a.haiku + s.costByModel.haiku, sonnet: a.sonnet + s.costByModel.sonnet, opus: a.opus + s.costByModel.opus }),
    { haiku: 0, sonnet: 0, opus: 0 },
  );
  const sessionTokens = tokensIn + cacheRead;

  return (
    <aside className="inspector" role="complementary" aria-label="Engineering inspector">
      <div className="ins-head">
        <strong>Engineering Inspector</strong>
        <button className="ins-close" onClick={onClose} aria-label="Close inspector">×</button>
      </div>

      <section className="ins-region">
        <h3>Live this session</h3>

        <div className="ins-graph">
          {STAGES.map((s, i) => (
            <span key={s.key}>
              <span className={`ins-node ${stageActive(s) ? "on" : ""}`}>{stageActive(s) ? "●" : "○"} {s.label}</span>
              {i < STAGES.length - 1 ? <span className="ins-arrow">→</span> : null}
            </span>
          ))}
        </div>

        <div className="ins-timeline">
          {tools.length === 0 ? <p className="ins-empty">No tool calls yet — start planning a trip.</p>
            : tools.map((t, i) => <ToolRow key={i} t={t} />)}
        </div>

        <div className="ins-scoreboard">
          <div>{turns.length} turns · {tools.length} tool calls</div>
          {latest && <div>{latest.exposedToolCount} of {latest.fullToolCount} tools exposed</div>}
          <div>{fmt(tokensIn)} in · {fmt(tokensOut)} out · {fmt(cacheRead)} cache-read</div>
        </div>

        <div className="ins-cost">
          <button className="ins-toggle" onClick={() => setShowCost((s) => !s)}>
            {showCost ? "hide $" : "show $"}
          </button>
          {showCost && latest && (
            <div className="ins-cost-rows">
              <div>This session, API-equivalent: <b>{usd(cost.haiku)}</b> haiku · <b>{usd(cost.sonnet)}</b> sonnet · <b>{usd(cost.opus)}</b> opus</div>
            </div>
          )}
          <table className="ins-tiers">
            <thead><tr><th>Plan</th><th>$/mo</th><th>~tok / 5-hr window</th></tr></thead>
            <tbody>
              {PLAN_TIERS.map((p) => {
                const pct = p.windowTokens ? Math.min(100, (sessionTokens / p.windowTokens) * 100) : null;
                return (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>${p.priceMo}</td>
                    <td>{p.windowTokens ? `~${fmt(p.windowTokens)}${pct != null ? ` · this trip ≈ ${pct.toFixed(pct < 1 ? 2 : 0)}%` : ""}` : p.windowNote}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="ins-note">{TIER_DISCLAIMER}</p>
          <details className="ins-sources">
            <summary>how we estimate</summary>
            <p>Monthly estimate = window tokens × 1 fresh window/day × 30. Sources:</p>
            <ul>{TIER_SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>
          </details>
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Add drawer styles** — append to `web/src/styles.css`:

```css
.inspector-toggle { margin-left: auto; font-size: 12px; padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
.inspector { position: fixed; top: 0; right: 0; width: 380px; max-width: 92vw; height: 100vh; overflow-y: auto; background: #0f172a; color: #e2e8f0; box-shadow: -8px 0 24px rgba(0,0,0,.3); padding: 14px 16px; z-index: 50; font-size: 13px; }
.ins-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.ins-close { background: none; border: none; color: #e2e8f0; font-size: 20px; cursor: pointer; }
.ins-region h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin: 12px 0 6px; }
.ins-graph { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 10px; }
.ins-node { color: #64748b; } .ins-node.on { color: #38bdf8; font-weight: 600; }
.ins-arrow { color: #475569; margin: 0 2px; }
.ins-tool { border-top: 1px solid #1e293b; }
.ins-tool.err .ins-tool-head { color: #fca5a5; }
.ins-tool-head { width: 100%; display: flex; justify-content: space-between; background: none; border: none; color: inherit; padding: 6px 0; cursor: pointer; font-size: 13px; }
.ins-lat { color: #94a3b8; }
.ins-raw { background: #020617; border-radius: 6px; padding: 8px; overflow-x: auto; font-size: 11px; max-height: 280px; }
.ins-scoreboard { margin: 10px 0; line-height: 1.6; color: #cbd5e1; }
.ins-toggle { font-size: 11px; padding: 2px 8px; border: 1px solid #334155; border-radius: 5px; background: #1e293b; color: #e2e8f0; cursor: pointer; }
.ins-tiers { width: 100%; border-collapse: collapse; margin: 8px 0; }
.ins-tiers th, .ins-tiers td { text-align: left; padding: 3px 4px; border-bottom: 1px solid #1e293b; font-size: 12px; }
.ins-note { color: #64748b; font-size: 11px; }
.ins-sources summary { cursor: pointer; color: #94a3b8; font-size: 11px; }
.ins-empty { color: #64748b; }
```

- [ ] **Step 3: Build the SPA to verify it compiles + renders**

Run: `rm -rf dist-web && VITE_API_BASE="" npm run build:web`
Expected: build succeeds, no TS errors.

- [ ] **Step 4: Visual check (Playwright screenshot)**

Run the local dev worker (`npx wrangler dev --port 8799`), open the app, click **🔍 Inspector**, send a featured-trip prompt, confirm the graph lights up, tool rows expand to raw JSON, scoreboard + tier table render, and `show $` reveals the three model costs. Capture a screenshot via the repo's Playwright harness (`/tmp/voygent-demo-shot2.cjs` pattern). Expected: drawer renders with live data; no console errors.

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npx tsc --noEmit
npm run test
git add web/src/Inspector.tsx web/src/styles.css
git commit -m "feat(demo): Inspector drawer region 1 — graph, timeline, scoreboard, cost meter"
```

Expected: tsc clean; 44+ tests green. **Slice 1 complete + demoable.**

---

## Task 8: Slice 1 deploy gate (optional, Neil-driven)

- [ ] **Step 1:** Per the shared-worker rule, coordinate one deploy. `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`. Verify live at https://voygent-demo.somotravel.workers.dev with `npx wrangler tail` showing `[cost]` lines. (Deploy is Neil's call; do not auto-deploy.)

---

# SLICE 2 — Measured savings + observer-effect overhead

## Task 9: Replay exposes a measurement side channel

**Files:**
- Modify: `worker/mcp/replay.ts`
- Test: `worker/mcp/replay.test.ts`

- [ ] **Step 1: Write the failing test** — append to `worker/mcp/replay.test.ts`:

```ts
  it("records lastMeasurement for an intercepted flight_search", async () => {
    // Arrange a replay whose flightSearch returns a known fixture (use an existing matchable route).
    const r = new FixtureReplay("demo-x");
    const helpers = { readTrip: async () => ({}), patchTrip: async () => {} };
    const out = await r.handle("flight_search", { origin: "MOB", destination: "DUB" }, helpers as any);
    const m = r.lastMeasurement();
    expect(m).toBeTruthy();
    expect(m!.tool).toBe("flightSearch");
    expect(m!.modelFacingTokens).toBe(Math.ceil(out.length / 4));
  });
```

(If `worker/mcp/replay.test.ts` doesn't exist, create it with the standard `import { describe, it, expect } from "vitest"; import { FixtureReplay } from "./replay";` header.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- worker/mcp/replay.test.ts`
Expected: FAIL — `lastMeasurement` is not a function.

- [ ] **Step 3: Implement** — in `worker/mcp/replay.ts`:

Add the import: `import { estTokens } from "../inspector";`

Add a field to `FixtureReplay`:

```ts
  private measurement: { tool: string; modelFacingTokens: number } | null = null;
  lastMeasurement(): { tool: string; modelFacingTokens: number } | null { return this.measurement; }
```

In `flightSearch`, before each `return JSON.stringify({...})` that yields candidates, capture the string and record it. Replace the success `return` with:

```ts
    const payload = JSON.stringify({
      status: "ok", source: "serp", tripId: this.tripId, count: candidates.length, candidates,
      _next: "Pick ONE round-trip option, stage it with patch_trip updates {flights:[{_candidateId:'<id>'}]}, then call promote_flights.",
    });
    this.measurement = { tool: "flightSearch", modelFacingTokens: estTokens(payload) };
    return payload;
```

Do the analogous capture in `hotelSearch` (`tool: "hotelSearch"`), `flightList` (`tool: "flightList"`), and `hotelList` (`tool: "hotelList"`) success returns. For the no-result / `clear` branches, leave `this.measurement` unset (the caller only emits when a measurement exists).

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- worker/mcp/replay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/mcp/replay.ts worker/mcp/replay.test.ts
git commit -m "feat(demo): replay records model-facing token measurement per intercepted search"
```

---

## Task 10: Capture script records real prod response size + latency

**Files:**
- Modify: `scripts/capture-fixtures.mjs`
- Modify: `worker/fixtures/index.ts`

- [ ] **Step 1: Add a UTF-8 byte helper + timing in `callTool`** — in `scripts/capture-fixtures.mjs`, change `rpc()` to time the fetch and `callTool()` to return latency + bytes. Replace the `rpc` fetch + the `callTool` function with:

```js
const ENC = new TextEncoder();
let rpcId = 0;
async function rpc(method, params) {
  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  const latencyMs = Date.now() - t0;
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${text.slice(0, 200)}`);
  let payload = {};
  if (!ct.includes("text/event-stream")) { payload = JSON.parse(text); }
  else {
    for (const frame of text.split(/\n\n+/)) {
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n").trim();
      if (!data) continue;
      try { payload = JSON.parse(data); } catch { /* skip */ }
    }
  }
  if (payload.error) throw new Error(`MCP ${method}: ${JSON.stringify(payload.error).slice(0, 300)}`);
  return { result: payload.result, latencyMs };
}

async function callTool(name, args) {
  const { result, latencyMs } = await rpc("tools/call", { name, arguments: args });
  const text = (result?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { text, json, raw: result, latencyMs, responseBytes: ENC.encode(text).length };
}
```

- [ ] **Step 2: Collect per-tool meta in `captureRoute`** — record meta from the `flight_search`/`flight_list`/`hotel_search`/`hotel_list` calls (each `out` now carries `latencyMs` + `responseBytes`). After step 6 (hotel_list) in `captureRoute`, build:

```js
  const meta = {
    flightSearch: metaFrom(flightSearchOut),
    flightList:   metaFrom(flightListOut),
    hotelSearch:  metaFrom(hotelSearchOut),
    hotelList:    metaFrom(hotelListOut),
    capturedAt: new Date().toISOString().slice(0, 10),
  };
```

where (add near the top of the file):

```js
function metaFrom(out) {
  if (!out) return undefined;
  return { rawTokensEst: Math.ceil((out.text?.length ?? 0) / 4), responseBytes: out.responseBytes, prodLatencyMs: out.latencyMs };
}
```

Note: `rawTokensEst = ceil(text.length / 4)` (chars÷4 on the model-facing text); `responseBytes` is UTF-8. Capture the four `out` results into named vars (`flightSearchOut`, etc.) where each tool is called (e.g. `const flightSearchOut = out;` right after `record("flight_search", …)`).

- [ ] **Step 3: Write `meta` into the slim fixture** — in the slim-fixture `writeFile`, add `meta` to the object:

```js
  await writeFile(resolve(FIX_DIR, `${r.id}.json`), JSON.stringify({
    route: { id: r.id, label: r.label, origin: r.origin, destination: r.destination, city: r.city, depart: r.depart, ret: r.ret, adults: r.adults },
    flights: flightCandidates,
    hotels: hotelCandidates,
    promotedFlightsById,
    promotedLodgingById,
    meta,
  }, null, 2));
```

- [ ] **Step 4: Add optional `meta` to the Fixture interface** — in `worker/fixtures/index.ts`, add to the `Fixture` interface:

```ts
  meta?: {
    flightSearch?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    flightList?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    hotelSearch?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    hotelList?: { rawTokensEst: number; responseBytes: number; prodLatencyMs: number };
    capturedAt?: string;
  };
```

- [ ] **Step 5: Typecheck + commit (code only — recapture is Task 11)**

```bash
npx tsc --noEmit
git add scripts/capture-fixtures.mjs worker/fixtures/index.ts
git commit -m "feat(demo): capture records real prod response size+latency into fixture meta"
```

---

## Task 11: Gated fixture recapture (Neil runs this)

**Files:**
- Modify (regenerated): `worker/fixtures/dublin-oct.json`, `cancun-beach.json`, `tokyo-blossom.json`, `rome-amalfi.json`, `nyc-weekend.json`

- [ ] **Step 1: Run the capture** (uses Neil's prod per-user token; hits prod; ~$0.01–0.02 SERP/call; secret never logged):

```bash
VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs
```

Expected: the summary prints flights/hotels per route; each `worker/fixtures/<route>.json` now contains a `meta` block with non-zero `rawTokensEst`/`responseBytes`/`prodLatencyMs`.

- [ ] **Step 2: Verify + full suite + commit**

```bash
node -e "const f=require('./worker/fixtures/dublin-oct.json'); if(!f.meta?.flightSearch?.responseBytes) throw new Error('no meta'); console.log('meta ok', f.meta.flightSearch);"
npm run test
git add worker/fixtures/dublin-oct.json worker/fixtures/cancun-beach.json worker/fixtures/tokyo-blossom.json worker/fixtures/rome-amalfi.json worker/fixtures/nyc-weekend.json
git commit -m "chore(demo): recapture fixtures with prod response-size+latency meta"
```

---

## Task 12: session-do emits savings + overhead events

**Files:**
- Modify: `worker/session-do.ts`

- [ ] **Step 1: Add savings/overhead bookkeeping** — extend the inspector bookkeeping block in `handleChat` (alongside `turnCount` etc.):

```ts
    let instrumentationBytes = 0;
    let instrumentationMs = 0;
    let maxFolioTokens = 0;
    this.lastBaselineTripJson = null;
```

Add the field to the class (near `private tripId`):

```ts
  private lastBaselineTripJson: string | null = null;
```

Add helper imports at top: extend the inspector import to
`import { withInspectorCost, sessionCostByModel, estTokens, utf8Bytes } from "./inspector";`
and `import { encodeSse } from "../shared/events";`.

- [ ] **Step 2: Count instrumentation bytes in `emit`** — replace the `emit` wrapper with a version that times the wrap + tallies inspector bytes (excluding overhead/summary to avoid circularity):

```ts
    const emit = (e: ServerEvent): boolean => {
      const t0 = Date.now();
      const ev = withInspectorCost(e, model);
      if (ev.type === "inspector") {
        if (ev.kind === "turn") turnCount++;
        else if (ev.kind === "tool") toolCallCount++;
        if (ev.kind !== "overhead" && ev.kind !== "summary") {
          instrumentationBytes += utf8Bytes(encodeSse(ev));
        }
      }
      instrumentationMs += Date.now() - t0;
      return mux.send(ev);
    };
```

- [ ] **Step 3: Emit toolCatalog savings once** — right after computing `tools` in the IIFE:

```ts
        emit({
          type: "inspector", kind: "savings", exchangeId, mechanism: "toolCatalog",
          tokensSaved: Math.max(0, estTokens(JSON.stringify(fullTools)) - estTokens(JSON.stringify(tools))),
          basis: "chars/4", scope: "perTurn",
          detail: `${exposedToolCount} of ${fullToolCount} tool schemas sent each turn`,
        });
```

- [ ] **Step 4: Capture baseline + searchDistill + patch savings in `callTool`** — replace the `callTool` closure with a wrapper that measures:

```ts
    const baseCallTool = (name: string, input: Record<string, unknown>): Promise<string> =>
      this.replay.isIntercepted(name)
        ? this.replay.handle(name, input as Record<string, any>, helpers)
        : mcp.callTool(name, input);

    const callTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
      // patch savings: incremental patch vs full-trip rewrite (baseline-gated, clamped ≥0).
      if (name === "patch_trip" && this.lastBaselineTripJson) {
        const updates = (input as any).updates ?? input;
        emit({
          type: "inspector", kind: "savings", exchangeId, mechanism: "patch",
          tokensSaved: Math.max(0, estTokens(this.lastBaselineTripJson) - estTokens(JSON.stringify(updates))),
          basis: "chars/4", scope: "perTurn", detail: "incremental patch vs full-trip rewrite",
        });
      }
      const out = await baseCallTool(name, input);
      // searchDistill: prod response size (fixture meta) vs the slim payload the model saw.
      if (this.replay.isIntercepted(name)) {
        const m = this.replay.lastMeasurement();
        const fx = this.replay.currentFixture();
        const metaKey = m?.tool as ("flightSearch" | "flightList" | "hotelSearch" | "hotelList" | undefined);
        const meta = metaKey && fx?.meta ? fx.meta[metaKey] : undefined;
        if (m && meta) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "searchDistill",
            tokensSaved: Math.max(0, meta.rawTokensEst - m.modelFacingTokens),
            basis: "chars/4", scope: "aggregate",
            detail: `prod ${m.tool} returned ~${meta.rawTokensEst} tok → model saw ~${m.modelFacingTokens} tok`,
          });
        }
      }
      return out;
    };
```

Add `currentFixture()` to `FixtureReplay` (in `worker/mcp/replay.ts`) returning the active flight/hotel fixture:

```ts
  currentFixture(): import("../fixtures/index").Fixture | null {
    const id = this.flightRouteId ?? this.hotelRouteId;
    return id ? FIXTURE_BY_ID[id] : null;
  }
```

- [ ] **Step 5: Track baseline + maxFolio in `onFolio`** — extend the `onFolio` callback to cache the pre-overlay baseline and the max folio size:

```ts
          onFolio: async () => {
            const raw = await mcp.callTool("read_trip", { tripId: this.tripId });
            let parsed: any = {};
            try { parsed = JSON.parse(raw); } catch { /* tolerate */ }
            const data = (parsed && typeof parsed === "object" && parsed.data) ? parsed.data : (parsed ?? {});
            this.lastBaselineTripJson = JSON.stringify(data); // pre-overlay baseline for patch savings
            const promoted = this.replay.lastPromoted();
            if (promoted.flights != null) data.flights = promoted.flights;
            if (promoted.lodging != null) data.lodging = promoted.lodging;
            const folio = tripToFolio(this.tripId, { data });
            maxFolioTokens = Math.max(maxFolioTokens, estTokens(JSON.stringify(folio)));
            mux.send({ type: "folio", folio });
          },
```

- [ ] **Step 6: Emit template savings + overhead in the `finally` (before summary, before close):**

```ts
      } finally {
        if (maxFolioTokens > 0) {
          emit({
            type: "inspector", kind: "savings", exchangeId, mechanism: "template",
            tokensSaved: maxFolioTokens, basis: "chars/4", scope: "perRender",
            detail: "deterministic render payload (chars÷4) the model never had to generate — not a model-measured count",
          });
        }
        emit({
          type: "inspector", kind: "overhead", exchangeId,
          instrumentationMs: instrumentationMs > 0 ? instrumentationMs : null,
          instrumentationBytes, addedModelTokens: 0,
        });
        emit({
          type: "inspector", kind: "summary", exchangeId,
          turns: turnCount, toolCalls: toolCallCount, exposedToolCount, fullToolCount,
          inputTokens: u.inputTokens, outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens, cacheCreationTokens: u.cacheCreationTokens,
          costByModel: sessionCostByModel(u),
        });
        mux.close();
        console.log(`[cost] model=${model} trip=${this.tripId} in=${u.inputTokens} out=${u.outputTokens} cacheR=${u.cacheReadTokens} cacheW=${u.cacheCreationTokens} usd=${sessionCost.toFixed(4)}`);
        if (sessionCost > 0) {
          try { await this.budgetStub().fetch("https://do/__budget/add", { method: "POST", body: JSON.stringify({ usd: sessionCost }) }); }
          catch { /* ledger update is best-effort */ }
        }
      }
```

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
npm run test
git add worker/session-do.ts worker/mcp/replay.ts
git commit -m "feat(demo): emit savings (toolCatalog/patch/template/searchDistill) + overhead"
```

---

## Task 13: App accumulates savings + overhead

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/Inspector.tsx`

- [ ] **Step 1: Add state + handlers** — in `App.tsx`, add types to the Inspector import and state:

```ts
import { Inspector, type InsTool, type InsTurn, type InsSummary, type InsSavings, type InsOverhead } from "./Inspector";
...
  const [insSavings, setInsSavings] = useState<InsSavings[]>([]);
  const [insOverhead, setInsOverhead] = useState<InsOverhead[]>([]);
```

Extend the inspector branch in `send`:

```ts
          else if (e.kind === "savings") setInsSavings((s) => [...s, e]);
          else if (e.kind === "overhead") setInsOverhead((o) => [...o, e]);
```

Pass them to `<Inspector … savings={insSavings} overhead={insOverhead} />`.

- [ ] **Step 2: Commit** (Inspector UI rendering them lands in Task 14)

```bash
git add web/src/App.tsx
git commit -m "feat(demo): accumulate savings+overhead inspector events"
```

---

## Task 14: Inspector renders context-saved + observer-effect

**Files:**
- Modify: `web/src/Inspector.tsx`

- [ ] **Step 1: Add the prop types + sections** — in `Inspector.tsx` add the interfaces and extend the component props:

```ts
export interface InsSavings {
  type: "inspector"; kind: "savings"; exchangeId: string;
  mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
  tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate"; detail: string;
}
export interface InsOverhead {
  type: "inspector"; kind: "overhead"; exchangeId: string;
  instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
  folioReprojectMs?: number | null; note?: string;
}
```

Add `savings` + `overhead` to the destructured props and compute, after the cost block:

```tsx
  // Context saved: sum perTurn (× turns) + aggregate; template (perRender) shown separately as latest/max.
  const turnsCount = latest?.turns ?? turns.length;
  const summed = savings.reduce((acc, s) => {
    if (s.scope === "perTurn") acc.sum += s.tokensSaved * Math.max(1, turnsCount);
    else if (s.scope === "aggregate") acc.sum += s.tokensSaved;
    else if (s.mechanism === "template") acc.template = Math.max(acc.template, s.tokensSaved);
    return acc;
  }, { sum: 0, template: 0 });
  const ov = overhead[overhead.length - 1];
```

Render after the cost section, still inside region 1:

```tsx
        <div className="ins-saved">
          <h4>Context kept out of the model</h4>
          <div className="ins-saved-total">≈ {fmt(summed.sum)} tokens kept out of context</div>
          <ul>
            {savings.filter((s) => s.scope !== "perRender").map((s, i) => (
              <li key={i}><b>{s.mechanism}</b> · {fmt(s.tokensSaved)}{s.scope === "perTurn" ? "/turn" : ""} — {s.detail}</li>
            ))}
          </ul>
          {summed.template > 0 && (
            <div className="ins-note">Folio render: ≈ {fmt(summed.template)} tokens the model never generated (deterministic template, counterfactual — not summed above).</div>
          )}
        </div>

        <div className="ins-overhead">
          <h4>Observer effect — the cost of measuring</h4>
          <div>Added model tokens: <b>0</b> (inspector data is a side channel, never in context)</div>
          {ov && <div>Inspector client payload: <b>{(ov.instrumentationBytes / 1024).toFixed(1)} KB</b></div>}
          <div>Instrumentation CPU: <b>{ov && ov.instrumentationMs != null ? `${ov.instrumentationMs} ms` : "below timer resolution"}</b></div>
        </div>
```

Add styles to `styles.css`:

```css
.ins-saved h4, .ins-overhead h4 { font-size: 12px; color: #94a3b8; margin: 12px 0 4px; }
.ins-saved-total { color: #34d399; font-weight: 600; }
.ins-saved ul { margin: 4px 0; padding-left: 16px; } .ins-saved li { margin: 2px 0; }
```

- [ ] **Step 2: Build + visual check**

Run: `rm -rf dist-web && VITE_API_BASE="" npm run build:web`
Then dev-run + Playwright screenshot: confirm the context-saved totals + per-mechanism rows + observer-effect (0 model tokens, KB payload, CPU/below-resolution) render after a trip build.

- [ ] **Step 3: Typecheck + suite + commit**

```bash
npx tsc --noEmit
npm run test
git add web/src/Inspector.tsx web/src/styles.css
git commit -m "feat(demo): Inspector renders context-saved meter + observer-effect"
```

**Slice 2 complete + demoable.**

---

# SLICE 3 — Static cards + business case

## Task 15: Static behind-the-scenes card data

**Files:**
- Modify: `web/src/inspector-data.ts`

- [ ] **Step 1: Append card + business-case data** to `web/src/inspector-data.ts`:

```ts
export interface BtsCard { title: string; claim: string; detail: string; source: string; }

export const BTS_DISCLAIMER =
  "These are capabilities of the production Voygent system this demo is built on. " +
  "The live panel above shows only what THIS session actually did.";

export const BTS_CARDS: BtsCard[] = [
  { title: "Edge-native bot-defeat as a discipline",
    claim: "23-supplier anti-bot catalog; TLS/JA3 from a Worker where the industry uses Playwright+VMs.",
    detail: "Falsification discipline: earlier 'worker-viable' verdicts (AA Vacations, FareBuzz) were overturned by byte-cert and recorded as such.",
    source: "docs/probes/2026-04-29-defense-bypass-catalog.md" },
  { title: "AI multi-persona QA + Judge",
    claim: "13 advisor personas × 22 scenarios make real MCP calls; an AI Judge scores 4 weighted dimensions.",
    detail: "Self-files issues + auto-writes cold-start fix-prompts + synthesizes regression scenarios from open issues.",
    source: "voygent-desktop/src/testing/ + docs/QA-TESTING-SYSTEM.md" },
  { title: "/onboard vendor pipeline",
    claim: "probe → classify → scaffold (category template) → wire → test → staged commit, in one command.",
    detail: "Audit mode diffs a shipped adapter against captured baselines and auto-files an issue.",
    source: ".claude/skills/onboard/SKILL.md" },
  { title: "Commission firewall (LAW 1)",
    claim: "The client view is provably free of advisor economics — enforced as a codified law with a grep-verify.",
    detail: "assertNoAdvisorKeys runs on the client render path; economics are served separately behind Bearer + no-store.",
    source: "src/folio-board/allowlist.ts + LAWS.md" },
  { title: "One server → Claude + ChatGPT",
    claim: "OAuth 2.1 + Dynamic Client Registration; per-user URL+token; tier-gated catalog locked per session.",
    detail: "The hand-rolled host makes the driving model swappable — the moat is tools+orchestration, not a model vendor.",
    source: "src/mcp/oauth.ts + docs/adr/0004" },
  { title: "Scale",
    claim: "119 tool registrations, ~30 supplier adapters across cruise/flight/hotel/package/car/excursion.",
    detail: "All on Workers fetch() — no browser, no VM, for everything that probes worker-viable.",
    source: "src/mcp/tools/ + src/adapters/" },
  { title: "Curator confabulation guard + LAWS",
    claim: "A read-only verification agent whose cardinal rule is 'no evidence → no verdict'.",
    detail: "Runs the grep-verifies behind 6 codified invariants (≤6 laws by design).",
    source: "~/.claude/agents/curator.md + LAWS.md" },
  { title: "Production telemetry",
    claim: "One non-blocking Analytics-Engine data point per tool call at the tier-gate chokepoint.",
    detail: "No-ops when AE is unbound and never throws (test: 'never throws if writeDataPoint itself throws') — fire-and-forget, negligible hot-path overhead.",
    source: "src/telemetry/index.ts" },
];

// Business case (parametric). The live API-equivalent $ comes from the summary event's costByModel.
export const VOYGENT_PRICE_POINTS = [0, 12, 29];
export const USAGE_SCENARIOS = [
  { label: "Light", tripsMo: 2 },
  { label: "Medium", tripsMo: 8 },
  { label: "Heavy", tripsMo: 20 },
];
export const BIZ_ASSUMPTION =
  "Assumes 1 trip ≈ this session's measured tokens; infra + margin not modeled. " +
  "API-equivalent $ is real (this session × each model's published rates).";
```

- [ ] **Step 2: Commit**

```bash
git add web/src/inspector-data.ts
git commit -m "feat(demo): static behind-the-scenes cards + business-case constants"
```

---

## Task 16: Inspector renders region 2 (cards) + region 3 (business case)

**Files:**
- Modify: `web/src/Inspector.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Import the data** — in `Inspector.tsx`:

```ts
import { BTS_CARDS, BTS_DISCLAIMER, VOYGENT_PRICE_POINTS, USAGE_SCENARIOS, BIZ_ASSUMPTION } from "./inspector-data";
```

- [ ] **Step 2: Add a collapsible card component** — add inside `Inspector.tsx`:

```tsx
function Card({ c }: { c: { title: string; claim: string; detail: string; source: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ins-card">
      <button className="ins-card-head" onClick={() => setOpen((o) => !o)}>{open ? "▾" : "▸"} {c.title}</button>
      {open && <div className="ins-card-body"><p>{c.claim}</p><p className="ins-note">{c.detail}</p><code className="ins-src">{c.source}</code></div>}
    </div>
  );
}
```

- [ ] **Step 3: Render regions 2 + 3** — after the region-1 `</section>`, add:

```tsx
      <section className="ins-region">
        <h3>Behind the scenes</h3>
        <p className="ins-note">{BTS_DISCLAIMER}</p>
        {BTS_CARDS.map((c) => <Card key={c.title} c={c} />)}
      </section>

      <section className="ins-region">
        <h3>The business case</h3>
        <p>Under the MCP model, Voygent's marginal inference cost is <b>$0</b> — your flat Claude subscription already paid for the tokens. You get frontier-model reasoning at a flat rate; a standalone app must meter, mark up, and bear billing/abuse/infra liability, and that cost compounds with volume and model tier.</p>
        {latest ? (
          <table className="ins-tiers">
            <thead><tr><th>Per month</th>{USAGE_SCENARIOS.map((s) => <th key={s.label}>{s.label} ({s.tripsMo})</th>)}</tr></thead>
            <tbody>
              {(["haiku", "sonnet", "opus"] as const).map((m) => (
                <tr key={m}>
                  <td>App (API, {m})</td>
                  {USAGE_SCENARIOS.map((s) => <td key={s.label}>{usd(cost[m] * s.tripsMo)}</td>)}
                </tr>
              ))}
              {VOYGENT_PRICE_POINTS.map((v) => (
                <tr key={v}><td>Voygent ${v} + your Claude sub</td>{USAGE_SCENARIOS.map((s) => <td key={s.label}>${v} + $0 inference</td>)}</tr>
              ))}
            </tbody>
          </table>
        ) : <p className="ins-note">Build a trip to populate the live cost basis.</p>}
        <p className="ins-note">{BIZ_ASSUMPTION}</p>
      </section>
```

- [ ] **Step 4: Add styles** — append to `styles.css`:

```css
.ins-card { border-top: 1px solid #1e293b; }
.ins-card-head { width: 100%; text-align: left; background: none; border: none; color: #e2e8f0; padding: 6px 0; cursor: pointer; font-size: 13px; }
.ins-card-body p { margin: 4px 0; } .ins-src { color: #38bdf8; font-size: 11px; word-break: break-all; }
```

- [ ] **Step 5: Build + visual check + suite + commit**

```bash
rm -rf dist-web && VITE_API_BASE="" npm run build:web
npx tsc --noEmit
npm run test
git add web/src/Inspector.tsx web/src/styles.css
git commit -m "feat(demo): Inspector regions 2+3 — behind-the-scenes cards + business case"
```

Dev-run + Playwright screenshot: confirm all three regions render; cards expand to cite real paths; business-case table shows API-vs-subscription with the live cost basis. **Slice 3 complete.**

---

## Task 17: Final verification + optional deploy

- [ ] **Step 1: Full green gate**

```bash
npm run test          # expect 50+ green (42 baseline + new inspector/loop/replay tests)
npx tsc --noEmit      # clean
rm -rf dist-web && VITE_API_BASE="" npm run build:web   # SPA builds
```

- [ ] **Step 2: E2E sanity** — `DEMO_BASE=http://localhost:8799 node /tmp/demo-e2e.mjs s1 "Plan the Dublin in October trip"` — confirm the run completes and the folio assembles. Open the app, toggle the Inspector, confirm live numbers + all three regions.

- [ ] **Step 3: Deploy (Neil's call only)** — coordinate one superset deploy: `npx wrangler deploy`; verify https://voygent-demo.somotravel.workers.dev with `npx wrangler tail`. Update the handoff `docs/summaries/handoff-2026-06-06-phase3-next.md` to mark Phase 3 shipped.

---

## Notes for the executor
- **Honesty invariants:** every estimated number must render with its label (chars÷4, tier estimates, business-case assumptions). The model receives **unscrubbed** tool results (it needs the real data); only the client-facing inspector copy is scrubbed. `addedModelTokens` is literally `0`. Never present a `0`/`null` timer reading as a measurement — render "below timer resolution".
- **Do not** modify the voygent-lite repo. **Do not** point the public demo at live prod creds. Stage files by name.
- The web app has no automated test harness today; UI tasks are verified by build + Playwright screenshot, matching repo norm.
