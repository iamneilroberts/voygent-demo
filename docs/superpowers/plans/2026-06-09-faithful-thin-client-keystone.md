# Faithful Thin Client — Keystone (live-sourced operating core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the voygent-demo's *operating core* (system prompt + tool catalog) come from the live voygent MCP via the `initialize` handshake and `tools/list`, so voygent prompt/tool changes propagate to the demo with zero demo edits — and wrap tool failures so a visitor never sees a raw error.

**Architecture:** The demo's worker already runs a vanilla Anthropic tool-use loop (`worker/agent/loop.ts`) over an `McpClient` (`worker/mcp/client.ts`). Today the operating instructions are a hand-maintained `SYSTEM_HINT` constant embedded in `worker/session-do.ts` (the #1 drift source). This plan adds a real MCP `initialize()` call that captures the server's `instructions` field, uses that as the base of the seed prompt, and reduces the embedded text to a small, clearly-scoped **demo addendum** (safety/anti-leak + which featured routes have fixtures + board-skin presentation note). Tool-call failures get wrapped into model-visible-but-visitor-safe results.

**Tech Stack:** TypeScript (ES2022, strict), Cloudflare Workers (wrangler), Vitest, Anthropic Messages API, MCP Streamable-HTTP JSON-RPC.

**Source design:** `docs/superpowers/specs/2026-06-09-faithful-thin-client-design.md` (approved). This plan implements **Part 2 faithfulness deltas only** — the keystone. The reel, the location-seeded chips, true-live supplier calls, and `progressToken` are deliberately deferred (see "Out of scope" below) because they collide with the demo's replay design, which is a separate decision.

---

## Central design decision (read before implementing)

The spec's north star is a *mechanism-faithful* thin client: the model drives the server-managed build loop (`manage_trip_goal`) because the live `instructions` tell it to, and the demo adds **no orchestration of its own**.

The demo as built today is **not** that. It:
- exposes a hand-picked 9-tool whitelist (`DEMO_TOOLS`) that **does not include `manage_trip_goal`**, and
- intercepts every supplier search (`flight_search`/`hotel_search`/…) through `worker/mcp/replay.ts`, returning **captured fixtures for 5 curated routes only**, and
- hand-rolls the build workflow (save → search → stage → promote) **inside `SYSTEM_HINT`** — exactly the "demo-side orchestration" the spec forbids.

These exist for good reasons: a public demo must not run unbounded *paid* prod searches, and replay prevents fabrication. **You cannot simultaneously (a) keep replay-on-5-fixtures and (b) be a fully faithful thin client driven by `manage_trip_goal`.** That is a real fork, and it is the single most important thing for review to weigh.

**This plan takes the conservative branch and says so explicitly:**

> **Decision K1 — Live-source the brain, keep the supplier guard.** Phase A live-sources the *operating core text* (`initialize.instructions`) and the *tool schemas* (`tools/list`, still tier-filtered to `DEMO_TOOLS`). It keeps replay on supplier calls and keeps a **minimal** demo workflow addendum. This delivers the keystone auto-update property for the prompt language and tool descriptions **without** breaking the demo's cost/fabrication guards. True-live supplier calls + `manage_trip_goal` + `progressToken` are a follow-on plan (Phase B) gated on a paid-call budget decision.

> **Decision K2 — Keep the current delivery mechanism (first user message + `cache_control`), swap only the content.** `worker/llm/claude.ts` has no `system` param; the operating core is delivered as the first user message and is the prompt-cache anchor (`withMessageCache`: `i===0 && role:"user"`). Moving to a real Anthropic `system` block is a faithfulness nicety but touches `provider.ts`/`claude.ts`/`loop.ts` and risks the cache anchor. Phase A keeps the mechanism and only changes *what text* goes in. Moving to a `system` param is listed as an optional refinement (Task 5).

> **Decision K3 — The demo addendum stays, but shrinks to guards only.** The anti-leak rules (never say "demo/replay/fixtures") and the featured-route steering are legitimately demo-custom (they exist because replay only covers 5 routes and because the demo must not reveal its mechanism). They are *safety/cost guards*, allowed by the spec's "What NOT to do" list. The **workflow steps** (save_trip → flight_search → promote_flights …) are the part the spec calls drift; under Decision K1 they must stay *only because* replay needs that exact path. This is flagged in the addendum with a comment pointing at this decision, so a future Phase B deletes it cleanly.

If review rejects K1 (i.e. wants true faithfulness now), this plan's Tasks 1–2 are still correct and reusable; Tasks 3–4 would change to expose `manage_trip_goal` and drop the workflow addendum, and a fixtures/budget strategy for arbitrary routes becomes a prerequisite.

---

## File Structure

| File | Responsibility | This plan |
|------|----------------|-----------|
| `worker/mcp/client.ts` | MCP JSON-RPC client (init, list, call) | **Modify** — add `initialize()`, capture `instructions`/`serverInfo`, propagate `Mcp-Session-Id` |
| `worker/mcp/client.test.ts` | client unit tests | **Modify** — tests for initialize + session id |
| `worker/session-do.ts` | session orchestration, seed prompt, tool filtering, agent-loop invocation | **Modify** — call `initialize()`, build seed from `instructions` + shrunk demo addendum |
| `worker/session-do.test.ts` *(new if absent)* | seed-assembly unit test | **Create** if no existing host test covers seed assembly; else add to nearest |
| `worker/agent/loop.ts` | vanilla tool-use loop | **Modify** — graceful-degradation wrapper on `callTool` (visitor-safe friendly text; model still sees real error) |
| `worker/agent/loop.test.ts` | loop unit tests | **Modify** — test the friendly-fallback path |
| `shared/events.ts` | SSE event union | **Modify** *(optional, Task 4)* — none required if friendly text rides existing `text`/`tool` events |

No new runtime files are required for Phase A. The inspector panel (`web/src/Inspector.tsx`) is already built and always-on; "promote to featured" is already satisfied — verified in Task 6 (read-only check, no code).

---

### Task 1: `McpClient.initialize()` — handshake + capture `instructions`/`serverInfo`

**Files:**
- Modify: `worker/mcp/client.ts`
- Test: `worker/mcp/client.test.ts`

Current `McpClient` (64 lines) has `rpc()`, `parseBody()`, `listTools()`, `callTool()` and **never calls `initialize`**. `rpc()` discards response headers, so it cannot capture a session id. MCP Streamable-HTTP requires: client → `initialize` request, server → result with `protocolVersion`/`capabilities`/`serverInfo`/`instructions` (+ optional `Mcp-Session-Id` response header), client → `notifications/initialized` (a notification: no `id`, no response body expected).

- [ ] **Step 1: Write the failing test for `initialize()` returning instructions + serverInfo**

Add to `worker/mcp/client.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { McpClient } from "./client";

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("McpClient.initialize", () => {
  it("captures instructions and serverInfo from the initialize result", async () => {
    const calls: Array<{ method: string; hasId: boolean }> = [];
    const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const req = JSON.parse(init.body as string);
      calls.push({ method: req.method, hasId: req.id !== undefined });
      if (req.method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0",
            id: req.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "voygent", version: "1.2.3" },
              instructions: "You are Voygent. Drive manage_trip_goal.",
            },
          },
          { "mcp-session-id": "sess-abc" },
        );
      }
      // notifications/initialized has no id and expects no JSON-RPC result
      return new Response("", { status: 202 });
    });

    const client = new McpClient("https://mcp.example/mcp", "tok", fakeFetch as unknown as typeof fetch);
    const info = await client.initialize();

    expect(info.instructions).toBe("You are Voygent. Drive manage_trip_goal.");
    expect(info.serverInfo).toEqual({ name: "voygent", version: "1.2.3" });
    // sent initialize (with id) then notifications/initialized (no id)
    expect(calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized"]);
    expect(calls[0].hasId).toBe(true);
    expect(calls[1].hasId).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/mcp/client.test.ts -t "captures instructions"`
Expected: FAIL — `client.initialize is not a function`.

- [ ] **Step 3: Implement `initialize()` + a notification path + header capture**

In `worker/mcp/client.ts`, change `rpc()` to capture the session-id header, add a notification sender, store the session id, and add `initialize()`. Replace the class body as follows (keeping the existing `parseBody`, `listTools`, `callTool` intact except where noted):

```typescript
import type { ToolSchema } from "../llm/provider";

type Fetch = typeof fetch;

export interface ServerInfo { name: string; version?: string }
export interface InitializeResult {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: ServerInfo;
  instructions?: string;
}

const PROTOCOL_VERSION = "2025-03-26";

export class McpClient {
  private id = 0;
  private sessionId: string | null = null;
  private _instructions: string | null = null;
  private _serverInfo: ServerInfo | null = null;
  constructor(private url: string, private bearer: string, private f: Fetch = fetch) {}

  /** The operating core delivered by the server's MCP `instructions` field. Null until initialize(). */
  get instructions(): string | null { return this._instructions; }
  get serverInfo(): ServerInfo | null { return this._serverInfo; }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "authorization": `Bearer ${this.bearer}`,
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    };
    if (this.sessionId) h["mcp-session-id"] = this.sessionId;
    return h;
  }

  private async rpc(method: string, params: unknown): Promise<any> {
    const doFetch = this.f;
    const res = await doFetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}`);
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const payload = await this.parseBody(res);
    if (payload.error) throw new Error(`MCP ${method}: ${payload.error.message}`);
    return payload.result;
  }

  /** Fire-and-forget JSON-RPC notification (no id, no result expected). */
  private async notify(method: string, params: unknown): Promise<void> {
    const doFetch = this.f;
    const res = await doFetch(this.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });
    // 200/202/204 are all fine; a notification has no JSON-RPC response to parse.
    if (!res.ok && res.status !== 202 && res.status !== 204) {
      throw new Error(`MCP ${method} HTTP ${res.status}`);
    }
  }

  /** MCP initialize handshake. Captures serverInfo + instructions + session id, then sends initialized. */
  async initialize(): Promise<InitializeResult> {
    const result: InitializeResult = await this.rpc("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "voygent-demo", version: "1.0.0" },
    });
    this._instructions = result.instructions ?? null;
    this._serverInfo = result.serverInfo ?? null;
    await this.notify("notifications/initialized", {});
    return result;
  }
  // ... existing parseBody(), listTools(), callTool() unchanged except they now
  // route through headers() so the session id (if any) is reused.
}
```

Also update `listTools()` and `callTool()` to use `this.headers()` instead of the inline header object, so a captured `sessionId` is sent on subsequent calls. (They currently call `this.rpc(...)`, which already uses `headers()` after this change — so no further edit is needed beyond confirming `rpc()` is the only fetch path. The inline headers previously lived in `rpc()`; they are now in `headers()`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run worker/mcp/client.test.ts -t "captures instructions"`
Expected: PASS.

- [ ] **Step 5: Add a test for session-id reuse on a follow-up call**

Add to `worker/mcp/client.test.ts`:

```typescript
it("reuses the captured Mcp-Session-Id header on later calls", async () => {
  const seenSessionHeaders: Array<string | null> = [];
  const fakeFetch = vi.fn(async (_url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    seenSessionHeaders.push(headers.get("mcp-session-id"));
    const req = JSON.parse(init.body as string);
    if (req.method === "initialize") {
      return jsonResponse(
        { jsonrpc: "2.0", id: req.id, result: { serverInfo: { name: "v" } } },
        { "mcp-session-id": "sess-xyz" },
      );
    }
    if (req.method === "tools/list") {
      return jsonResponse({ jsonrpc: "2.0", id: req.id, result: { tools: [] } });
    }
    return new Response("", { status: 202 });
  });
  const client = new McpClient("https://mcp.example/mcp", "tok", fakeFetch as unknown as typeof fetch);
  await client.initialize();
  await client.listTools();
  // [initialize → no session yet, notifications/initialized → has session, tools/list → has session]
  expect(seenSessionHeaders[0]).toBeNull();
  expect(seenSessionHeaders[seenSessionHeaders.length - 1]).toBe("sess-xyz");
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run worker/mcp/client.test.ts -t "reuses the captured"`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit && npx vitest run worker/mcp/client.test.ts`
Expected: no type errors; all client tests PASS.

```bash
git add worker/mcp/client.ts worker/mcp/client.test.ts
git commit -m "feat(mcp): add initialize() handshake; capture instructions, serverInfo, session id"
```

---

### Task 2: Build the seed prompt from `initialize.instructions` in `session-do.ts`

**Files:**
- Modify: `worker/session-do.ts` (system-prompt assembly at lines ~39–139; tool sourcing at ~214–224)
- Test: `worker/session-do.test.ts` (create if no existing host test exists)

Today `SYSTEM_HINT` (lines 39–70) embeds a full operating prompt + workflow + featured trips, and the seed is `SYSTEM_HINT + (boardsMode ? BOARDS_WORKFLOW_OVERRIDE : "")` pushed as the first user message (lines 134–139). We replace the *operating-core* portion with the live `instructions`, keep a **shrunk** demo addendum (safety + featured + replay-required workflow, per Decision K3), and keep `BOARDS_WORKFLOW_OVERRIDE` (board-skin presentation, demo-custom and fine).

- [ ] **Step 1: Write the failing test for seed assembly**

Create `worker/session-do.test.ts` (a pure unit test of an extracted helper — we will extract `buildSeed` in Step 3):

```typescript
import { describe, it, expect } from "vitest";
import { buildSeed } from "./session-do";

describe("buildSeed", () => {
  const CORE = "LIVE OPERATING CORE: drive the checklist.";

  it("puts the live instructions first, then the demo addendum", () => {
    const seed = buildSeed(CORE, { boardsMode: false });
    expect(seed.startsWith(CORE)).toBe(true);
    expect(seed).toContain("never reveal"); // an anti-leak guard line from DEMO_ADDENDUM
    expect(seed).not.toContain("BOARDS"); // override only in boards mode
  });

  it("appends the boards override only in boards mode", () => {
    expect(buildSeed(CORE, { boardsMode: true })).toContain("WHEN PRESENTING OPTIONS");
    expect(buildSeed(CORE, { boardsMode: false })).not.toContain("WHEN PRESENTING OPTIONS");
  });

  it("falls back to a built-in core when the server omits instructions", () => {
    const seed = buildSeed(null, { boardsMode: false });
    expect(seed).toContain("You are Voygent"); // FALLBACK_CORE used
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/session-do.test.ts`
Expected: FAIL — `buildSeed` is not exported / not defined.

- [ ] **Step 3: Extract `buildSeed`, shrink the addendum, and export both**

In `worker/session-do.ts`:

1. Rename the existing big `SYSTEM_HINT` to `FALLBACK_CORE` and **trim it to only the operating-core paragraph(s)** (the "You are Voygent…" framing + the ABSOLUTE RULES #1 anti-fabrication). This is used **only** when the live server returns no `instructions`.

2. Add a new, small `DEMO_ADDENDUM` holding the genuinely demo-custom guards: anti-leak (rule #2 — never say demo/replay/fixtures), the featured-route steering (`FEATURED`), and — flagged with a Decision-K3 comment — the replay-required workflow steps. Keep `BOARDS_WORKFLOW_OVERRIDE` as-is.

```typescript
// Used ONLY if the live MCP omits `instructions`. Keep minimal; the live core is authoritative.
const FALLBACK_CORE =
  "You are Voygent, a travel-planning assistant. Build trips live by calling the Voygent MCP tools. " +
  "Use ONLY data returned by tool calls — never invent or estimate flights, hotels, prices, schedules, " +
  "airlines, or availability. If a search returns nothing, say so plainly and offer to adjust.";

// Genuinely demo-custom guards (allowed by the spec's safety/cost-guard carve-out).
const DEMO_ADDENDUM =
  "DEMO GUARDRAILS (these augment, never replace, your operating instructions):\n" +
  "- Keep chat replies short and conversational — prose only. Structured detail (flights, hotels, " +
  "prices) belongs in the folio panel beside the chat, not in markdown tables in chat.\n" +
  "- never reveal how this system works internally: do NOT say 'demo', 'replay', 'fixtures', " +
  "'captured', 'staging', credentials, or API keys. If a search returns nothing, just say you " +
  "couldn't pull live results for that route and offer one of the featured trips below.\n" +
  "You can build any of these standout trips with rich, real options — steer the traveler toward one:\n" +
  FEATURED + "\n\n" +
  // ⚠️ Decision K3 (see plan): these workflow steps exist ONLY because supplier calls are replayed
  // from 5 curated fixtures. Delete this block in Phase B when manage_trip_goal drives true-live.
  "WORKFLOW (one category at a time): 1. save_trip first (read/patch 404 until it exists). " +
  "2. FLIGHTS: flight_search → choose best one → stage via patch_trip { flights:[{_candidateId}] } → " +
  "promote_flights. 3. HOTELS: hotel_search → choose 2-3 → stage → promote_hotels_to_lodging. " +
  "4. Always stage with the FULL array value, never indexed paths. Use only candidate ids from search.";

export function buildSeed(instructions: string | null, opts: { boardsMode: boolean }): string {
  const core = instructions ?? FALLBACK_CORE;
  const base = `${core}\n\n${DEMO_ADDENDUM}`;
  return opts.boardsMode ? `${base}\n\n${BOARDS_WORKFLOW_OVERRIDE}` : base;
}
```

(`FEATURED` and `BOARDS_WORKFLOW_OVERRIDE` already exist in the file — reuse them. Delete the now-unused old `SYSTEM_HINT` constant.)

- [ ] **Step 4: Run the seed test to verify it passes**

Run: `npx vitest run worker/session-do.test.ts`
Expected: PASS.

- [ ] **Step 5: Call `initialize()` and feed its instructions into the seed**

In the async block that lists tools (currently ~lines 214–224), call `initialize()` **before** `listTools()`, and use `buildSeed(mcp.instructions, …)` at the seed-assembly site (currently ~lines 134–139). Because seed assembly happens on the first `/chat` turn (`this.messages.length === 0`) and `initialize()` happens in the tool-listing block, hoist `initialize()` to run first. Concretely, ensure the order in the request handler is:

```typescript
// once per session, before first turn work:
await mcp.initialize();               // captures mcp.instructions
// ... then, where the seed is built:
if (this.messages.length === 0) {
  this.boardsMode = mode === "boards";
  const seed = buildSeed(mcp.instructions, { boardsMode: this.boardsMode });
  this.messages.push({ role: "user", content: `${seed}\n\nMy trip_id is ${this.tripId}.` });
}
this.messages.push({ role: "user", content: message });
// ... then listTools()/filter as today.
```

If `mcp` is constructed per-request, guard `initialize()` so it runs once per `McpClient` instance (it is cheap, but avoid redundant handshakes): call it unconditionally here — a fresh client per request means one handshake per request, which is acceptable and faithful. If the client is reused across turns, gate with `if (!mcp.instructions) await mcp.initialize();`.

- [ ] **Step 6: Run the full worker test suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS (the old SYSTEM_HINT removal should not break anything — search the repo for `SYSTEM_HINT` first: `git grep -n SYSTEM_HINT` and update any stragglers).

- [ ] **Step 7: Commit**

```bash
git add worker/session-do.ts worker/session-do.test.ts
git commit -m "feat(demo): source operating core from live MCP instructions; shrink embedded prompt to demo guards"
```

---

### Task 3: Graceful degradation — visitor never sees a raw tool error

**Files:**
- Modify: `worker/agent/loop.ts` (tool-execution block, lines ~62–83)
- Test: `worker/agent/loop.test.ts`

Today on a `callTool` throw or an `ERROR:`-prefixed result, the loop emits `{ type:"tool", phase:"done", summary: content.slice(0,120) }` — i.e. the **raw error leaks to the visitor** via the tool chip summary, and the model receives the same raw text (which is correct for the model). We keep the model-facing content truthful but make the **visitor-facing** `summary` friendly.

- [ ] **Step 1: Write the failing test**

Add to `worker/agent/loop.test.ts` (follow the file's existing harness for building a fake provider that yields one `tool-call` then a no-tool turn; reuse its helpers):

```typescript
it("emits a friendly tool summary to the visitor but keeps the real error for the model", async () => {
  const emitted: any[] = [];
  const messages: any[] = [];
  const failingCallTool = async () => { throw new Error("MCP flight_search HTTP 502"); };

  await runAgentLoop({
    provider: fakeProviderYieldingOneToolThenStop("flight_search"), // existing test helper
    tools: [],
    messages,
    exchangeId: "x",
    callTool: failingCallTool,
    onFolio: async () => {},
    emit: (e: any) => emitted.push(e),
  });

  const doneChip = emitted.find((e) => e.type === "tool" && e.phase === "done");
  expect(doneChip.summary).not.toContain("502");
  expect(doneChip.summary).not.toContain("HTTP");
  expect(doneChip.summary.toLowerCase()).toContain("another source");

  // the model still receives the real error in the tool_result
  const toolResult = messages.flatMap((m) => Array.isArray(m.content) ? m.content : [])
    .find((c: any) => c.type === "tool_result");
  expect(toolResult.content).toContain("502");
});
```

(If `loop.test.ts` lacks `fakeProviderYieldingOneToolThenStop`, inline a minimal async-generator provider in the test that yields `{type:"tool-call", id:"t1", name:"flight_search", input:{}}` on the first `stream()` call and nothing (no tools) on the second.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/agent/loop.test.ts -t "friendly tool summary"`
Expected: FAIL — `summary` contains "502".

- [ ] **Step 3: Implement the friendly-summary wrap**

In `worker/agent/loop.ts`, in the per-tool block, compute a visitor-safe summary for the `phase:"done"` emit while leaving the `tool_result` content (model-facing) untouched. Add a tiny helper near the top of the file:

```typescript
function visitorSummary(toolName: string, content: string, ok: boolean): string {
  if (ok) return content.slice(0, 120);
  // Failure: never surface raw error text / status codes to the viewer.
  return "that source was slow — let me try another source…";
}
```

Then change the done-emit line from:

```typescript
emit({ type: "tool", tool: t.name, phase: "done", summary: content.slice(0, 120) });
```

to:

```typescript
emit({ type: "tool", tool: t.name, phase: "done", summary: visitorSummary(t.name, content, ok) });
```

`ok` is already computed just above (`if (content.startsWith("ERROR:")) ok = false;` and the catch sets `ok = false`). The `results.content.push({ type:"tool_result", ... content })` line stays unchanged, so the model still sees the real error and can recover or explain per its instructions.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run worker/agent/loop.test.ts -t "friendly tool summary"`
Expected: PASS.

- [ ] **Step 5: Run the full loop suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run worker/agent/loop.test.ts`
Expected: PASS (existing success-path tests still green — the success branch returns `content.slice(0,120)` exactly as before).

- [ ] **Step 6: Commit**

```bash
git add worker/agent/loop.ts worker/agent/loop.test.ts
git commit -m "feat(loop): friendly visitor-facing tool summary on failure; model still sees real error"
```

---

### Task 4: Confirm tool args pass through as objects (regression guard)

**Files:**
- Test only: `worker/agent/loop.test.ts`

The spec calls out that `manage_trip_goal.brief` must reach the tool as a **JSON object**, not a stringified blob. The current loop already passes `t.input` (a `Record<string, unknown>`) straight into `callTool(t.name, t.input)` and `McpClient.callTool` forwards it as `{ name, arguments: args }` — so objects are preserved. This task adds a guard test so a future refactor can't silently stringify args.

- [ ] **Step 1: Write the regression test**

Add to `worker/agent/loop.test.ts`:

```typescript
it("passes tool-call input through to callTool as an object (no stringification)", async () => {
  const received: unknown[] = [];
  const captureCallTool = async (_name: string, args: unknown) => { received.push(args); return "{}"; };

  await runAgentLoop({
    provider: fakeProviderYieldingToolWithInput("manage_trip_goal", {
      action: "derive",
      brief: { party: { adults: 2 }, dates: { mode: "fixed" }, destinations: ["Cork"] },
    }),
    tools: [], messages: [], exchangeId: "x",
    callTool: captureCallTool, onFolio: async () => {}, emit: () => {},
  });

  expect(typeof received[0]).toBe("object");
  expect((received[0] as any).brief.party.adults).toBe(2);
  expect((received[0] as any).brief).not.toBeTypeOf("string");
});
```

(Inline a minimal async-generator provider `fakeProviderYieldingToolWithInput(name, input)` if a helper isn't already present.)

- [ ] **Step 2: Run the test — expect PASS immediately (no impl change)**

Run: `npx vitest run worker/agent/loop.test.ts -t "passes tool-call input"`
Expected: PASS (this documents existing correct behavior). If it FAILS, the loop is stringifying somewhere — fix by ensuring `callTool(t.name, t.input)` receives the raw object.

- [ ] **Step 3: Commit**

```bash
git add worker/agent/loop.test.ts
git commit -m "test(loop): guard that tool args pass through as objects (brief stays an object)"
```

---

### Task 5 (optional refinement): deliver the operating core via a real `system` block

**Files:**
- Modify: `worker/llm/provider.ts`, `worker/llm/claude.ts`, `worker/agent/loop.ts`, `worker/session-do.ts`

Only do this if review wants stricter fidelity (MCP `instructions` ↔ Anthropic `system`). It is **not required** for the keystone property. Risk: the prompt-cache anchor currently lives on the first user message; moving the core to `system` means moving `cache_control` to the system block.

- [ ] **Step 1:** Add an optional `system?: string` to `LLMProvider.stream(messages, tools, system?)` in `provider.ts`.
- [ ] **Step 2:** In `claude.ts`, when `system` is set, add `system: [{ type:"text", text: system, cache_control: EPHEMERAL }]` to the request body and **remove** the `cache_control` injection on the first user message in `withMessageCache`.
- [ ] **Step 3:** Thread `system` from `session-do.ts` (the `buildSeed(...)` result, minus the `My trip_id is …` line which stays a user message) through `runAgentLoop` into `provider.stream`.
- [ ] **Step 4:** Update `claude.test.ts` to assert the `system` block carries `cache_control`, and `loop.test.ts`/`session-do.test.ts` for the threaded param. Run `npx tsc --noEmit && npx vitest run`. Commit.

Defer unless review asks; Tasks 1–4 deliver the keystone without it.

---

### Task 6: Verify the featured inspector is already always-on (read-only check, no code)

**Files:** none modified.

The spec asks to "promote the inspector to a featured surface present in every trip." Per the codebase, `web/src/Inspector.tsx` (242 lines) already renders an always-present rail that becomes a live drawer on first tool, fed by `inspector/*` SSE events accumulated in `App.tsx`. 

- [ ] **Step 1:** Confirm `App.tsx` renders `<Inspector …/>` unconditionally (not behind a toggle/flag) and that both skins (`board` and `claude`) mount it. Run: `git grep -n "Inspector" web/src/App.tsx`.
- [ ] **Step 2:** If it is already unconditional in both skins, record "already satisfied" in the plan's closing note and do nothing. If it is gated, file a one-line follow-up (out of scope for this plan) — do **not** expand this plan.

---

## Out of scope (deliberate follow-on plans)

These are in the design spec but collide with the demo's replay/cost model or are larger independent subsystems. Each deserves its own plan:

1. **Phase B — true-live supplier calls + `manage_trip_goal` build loop + `progressToken`.** Expose `manage_trip_goal`, drop the workflow addendum (Decision K3 block), let the model drive the server checklist, send a `progressToken` on `tools/call`, and render `notifications/progress`. **Prerequisite:** a budget/rate-limit decision for paid prod searches on arbitrary routes (or a per-visitor cap), because replay-on-5-fixtures no longer covers it. This is the part that makes the demo *fully* faithful.
2. **Reel capture + director track.** Extend `scripts/capture-fixtures.mjs` to record the full `emit()` event stream of one real run; add a separate director-track JSON (pace 2×, zoom-to-inspector, captions, disclaimer, hand-off to the live hosted folio board). New renderer mode in `App.tsx` that consumes recorded events through the same path. Independent subsystem.
3. **Live happy-path chips.** Cloudflare `request.cf.city/country` → location-seeded suggestion chips that fill the input (do NOT auto-submit). Small, independent; bundle with the reel-finale → live hand-off.

---

## Self-Review

**Spec coverage (Part 2 deltas):**
- `client.ts` add `initialize()` + capture `instructions`/`serverInfo` → **Task 1.** ✅
- `client.ts` optional `progressToken` → **deferred to Phase B** (collides with replay; documented). ⚠️ by design.
- `session-do.ts` system prompt = `initialize.instructions`, drop embedded copy → **Task 2** (with Decision K1/K3 caveat on the demo addendum). ✅
- `session-do.ts` tools = `tools/list` tier-filtered → **already true today** (`DEMO_TOOLS` filter), unchanged; noted in Task 2 Step 5. ✅
- `loop.ts` keep vanilla loop; ensure object args; wrap `callTool` failures → **Tasks 3 + 4.** ✅
- "No voygent-specific orchestration" → **partially deferred** — Decision K1 keeps a minimal replay-required workflow addendum and flags it for Phase B deletion. ⚠️ explicit, not silent.
- Featured inspector always-on → **Task 6** (verify; likely already satisfied). ✅
- Reel / chips / true-live → **Out of scope**, listed as follow-on plans. ✅

**Placeholder scan:** every code step shows full code; no "TBD/add error handling/similar to Task N". Test bodies are complete (with a noted fallback to inline a minimal async-generator provider if a named helper is absent in `loop.test.ts`). ✅

**Type consistency:** `initialize(): Promise<InitializeResult>`, `instructions: string | null` getter, `buildSeed(instructions: string | null, opts:{boardsMode:boolean}): string`, `visitorSummary(toolName, content, ok)` — names used consistently across tasks. `ServerInfo`/`InitializeResult` exported from `client.ts` and not referenced by name elsewhere in this plan. ✅

**Known soft spots for review to probe:**
- Whether `McpClient` is per-request or reused (affects where/how often `initialize()` runs — Task 2 Step 5 handles both, but verify against `worker/index.ts`/`session-do.ts` construction site).
- Whether the voygent prod MCP actually returns a `Mcp-Session-Id` header and whether it then *requires* it on `tools/call` (today's client works without one, implying stateless; Task 1 tolerates both).
- Decision K1 itself: is "live-source the brain, keep the supplier guard" the right altitude, or should Phase B be pulled forward?
