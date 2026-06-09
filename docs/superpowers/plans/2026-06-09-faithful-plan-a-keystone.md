# Faithful Thin Client — Plan A (Keystone, flag-gated `FAITHFUL=1`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind a new `FAITHFUL` env flag, make the voygent-demo a mechanism-faithful thin client — the operating core comes from the live MCP `initialize.instructions`, supplier/enrichment tool calls go **real** to the live voygent MCP (no fixture replay, no demo orchestration), and tool failures degrade gracefully — while the default (flag-off) path stays **byte-identical** to today's prod so nothing ships until verified.

**Architecture:** The worker already runs a vanilla Anthropic tool-use loop (`worker/agent/loop.ts`) over a per-request `McpClient` (`worker/mcp/client.ts`), and already exposes the real `tools/list` catalog minus a destructive-tool denylist (`DENYLISTED_TOOLS`). Plan A adds (1) an MCP `initialize()` handshake that captures `instructions`/`serverInfo`/session-id, (2) a `FAITHFUL`-gated seed built from those live instructions plus a tiny demo addendum, (3) a `FAITHFUL`-gated tool path that bypasses `FixtureReplay`, the patch sanitizer, the folio overlay, and the demo orchestration hooks (phase-machine, nudges) so the model drives `manage_trip_goal` itself, and (4) a visitor-safe failure summary in the loop. Every change is additive and gated; flag-off behavior is unchanged.

**Tech Stack:** TypeScript (ES2022, strict), Cloudflare Workers (wrangler), Vitest, Anthropic Messages API, MCP Streamable-HTTP JSON-RPC.

**Source design:** `docs/superpowers/specs/2026-06-09-faithful-thin-client-rescoped.md` (approved). This plan implements the spec's **Plan A** only. Plan B (delete the now-dead orchestration + multi-provider decision) and Plan C (`progressToken` + reel re-capture + location chips) are deliberately deferred — see "Out of scope."

---

## What changed since the earlier keystone plan (read before implementing)

The prior plan `2026-06-09-faithful-thin-client-keystone.md` was written against a stale tree and its **Decision K1 is REVERSED**. Verified facts about the real `main` (`8929804`) tree:

- **`client.ts` is byte-identical** to what the earlier plan assumed (63 lines, no `initialize()`). Task 1 lifts cleanly.
- **`DEMO_TOOLS` is retired.** `worker/session-do.ts` already sources the real `mcp.listTools()` and filters by a **denylist** (`DENYLISTED_TOOLS`, 14 destructive/outward-facing tools), exposing ~110 of ~120 tools — `manage_trip_goal` is already in the catalog. So "real `tools/list`" is **already true**; Plan A does not touch tool sourcing. (The spec/handoff line "`DEMO_TOOLS` whitelist lives in session-do.ts" is stale.)
  - **Decision A3 (Neil, 2026-06-09): the catalog is NOT to be narrowed, and the 14-tool denylist STAYS.** The demo must expose the full voygent catalog *except* the 14 destructive/outward-facing tools (`delete_*`, `publish_*`, `share_folio`, `update_advisor_profile`, `manage_clients`, `manage_pipeline`, `record_payment`, `report_issue`, `update_issue`) — those run under the real advisor's MCP user and a public passcode visitor must not be able to delete trips, email/publish to clients, or mutate the CRM. Faithful mode keeps `DENYLISTED_TOOLS` for the same reason. **No task in this plan adds, removes, or whitelists tools.**
- **`mcp` is constructed per-request** (`session-do.ts:300`), so `initialize()` runs per-request when faithful — acceptable and faithful (it precedes `tools/call` per the MCP spec).
- **`baseCallTool`** (`session-do.ts:373`) already has a `if (this.liveMode) return mcp.callTool(...)` real-passthrough branch. Faithful mode extends this with an `||` so **all** calls bypass replay.
- **`loop.ts:103`** emits `summary: summarizeToolResult(content)` (not `content.slice(0,120)`), and `ok` is already computed at lines 99–101. The graceful-degradation change wraps line 103.
- The operating prompt is **four constants** assembled at `session-do.ts:307–309`: `SYSTEM_HINT` + (boards: `BOARDS_WORKFLOW_OVERRIDE` + `SEQUENCED_BOARDS_WORKFLOW`) + `ENRICHMENT_WORKFLOW` + `LIVE_TRIP_WORKFLOW`. Faithful mode replaces this whole assembly with `initialize.instructions` + a tiny addendum; the flag-off path keeps it verbatim.
- Demo orchestration to switch OFF in faithful mode: the **phase-machine** (`afterToolBatch`/`continueDirective`, gated on `DEMO_PHASE_MACHINE`) and the **enrichment/live `nudge`** (`session-do.ts:459`). Both are passed into `runAgentLoop` and must be `undefined` when faithful so the model drives the build itself.
- **`LLMProvider` has no `system` param** — the operating core is the first user message and the prompt-cache anchor. Plan A keeps that mechanism and only swaps the text (keystone Decision K2 still holds).

**Decision A1 — Real tools, gated, no big-bang.** When `FAITHFUL`, every supplier/enrichment call is real (replay becomes a no-op), the model drives `manage_trip_goal` from the live instructions, and all demo orchestration (phase-machine, nudges, fixture overlay, patch sanitizer) is bypassed. When `FAITHFUL` is unset, the code path is byte-identical to today. Prod runs flag-off until a budget gate (Task 6) clears.

**Decision A2 — `progressToken` is deferred to Plan C.** The spec's "Suggested plan shape" puts `progressToken` wiring in Plan C (reel + progress polish), not Plan A. The keystone faithfulness property (live-sourced brain + real budget-gated tool calls) does not depend on it. Plan A ships without it; this is flagged for review in case it should be pulled forward.

**Decision A4 — faithful mode is LATCHED per session (Codex review #4).** The effective `faithful` boolean is decided on a session's first turn and persisted in `SessRecord`, exactly like `boardsMode`/`liveMode`. This prevents a hybrid state: if the env flag is flipped mid-session, in-flight sessions keep the mode their seed was built for (a faithful seed never runs a turn through replay/sanitizer/nudge, and vice-versa). New sessions pick up the new flag value.

**Decision A5 — two-flag public gate so a lone `FAITHFUL=1` can't bill real spend (Codex review #9).** Faithful mode makes real paid supplier searches, but the per-code D1 reconcile only meters LLM tokens (Task 6 finding). As defense-in-depth, the effective gate is: `FAITHFUL=1` alone enables faithful mode ONLY for test/admin runs (`x-demo-test` header); enabling it for public passcode visitors additionally requires `FAITHFUL_PUBLIC_OK=1`. So a single mis-set secret cannot expose real supplier spend to the public.

**Decision A6 — testable gates (Codex review #7).** The faithful tool-path decisions (bypass replay / skip patch-sanitizer / skip folio overlay / skip search-distill measurement / suppress orchestration) are factored into one pure exported function `faithfulGates(faithful, liveMode)` and unit-tested, so CI proves the gating logic rather than leaving the riskiest change to a manual smoke.

**Deferred to Plan C (Codex review #5, #6) — pre-existing MCP-client limitations, not introduced here.** `McpClient.parseBody()` returns the last SSE frame rather than the id-matched JSON-RPC response, and there is no session-expiry (404) recovery or `DELETE` close. These are harmless against today's effectively-stateless voygent MCP (the existing client works without `initialize()` at all) but must be hardened in Plan C, where interleaved `notifications/progress` frames make id-matching load-bearing. Documented, not fixed in Plan A.

---

## File Structure

| File | Responsibility | This plan |
|------|----------------|-----------|
| `worker/mcp/client.ts` | MCP JSON-RPC client (rpc, list, call) | **Modify** — add `initialize()`, `notify()`, session-id capture via shared `headers()`; getters for `instructions`/`serverInfo` |
| `worker/mcp/client.test.ts` | client unit tests | **Modify** — extend `jsonResponse` to accept headers; add initialize + session-id-reuse tests |
| `worker/session-do.ts` | session orchestration, seed, tool path, loop wiring | **Modify** — `FAITHFUL`/`FAITHFUL_PUBLIC_OK` env + latched `this.faithful`; export `buildFaithfulSeed` + `faithfulGates`; call `initialize()` when faithful; gate seed, `baseCallTool`, patch sanitizer, folio overlay, phase-machine, and nudge via `faithfulGates` |
| `worker/session-store.ts` | `SessRecord` persistence shape | **Modify** — add `faithful?: boolean` so the mode latches across turns/evictions (Decision A4) |
| `worker/session-do.test.ts` *(new)* | pure unit tests of `buildFaithfulSeed` + `faithfulGates` | **Create** |
| `worker/agent/loop.ts` | vanilla tool-use loop | **Modify** — visitor-safe failure summary on `!ok` (model still sees the real error) |
| `worker/agent/loop.test.ts` | loop unit tests | **Modify** — friendly-failure test + object-args regression guard |

No new runtime files. `worker/mcp/replay.ts` is **not** modified — faithful mode bypasses it from `session-do.ts`, leaving it intact for reel playback.

---

### Task 1: `McpClient.initialize()` — handshake + capture `instructions`/`serverInfo`/session-id

**Files:**
- Modify: `worker/mcp/client.ts`
- Test: `worker/mcp/client.test.ts`

Current `McpClient` (63 lines) has `rpc()`, `parseBody()`, `listTools()`, `callTool()` and never calls `initialize`. `rpc()` inlines its headers and discards response headers, so it can't capture a session id. MCP Streamable-HTTP requires: client → `initialize` request, server → result with `protocolVersion`/`capabilities`/`serverInfo`/`instructions` (+ optional `Mcp-Session-Id` response header), client → `notifications/initialized` (a notification: no `id`, no response body expected).

- [ ] **Step 1: Extend the test helper to pass headers, then write the failing initialize test**

In `worker/mcp/client.test.ts`, change the `jsonResponse` helper to accept optional headers (existing call sites pass one arg and are unaffected):

```typescript
function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
  });
}
```

Then add a new describe block:

```typescript
describe("McpClient.initialize", () => {
  it("captures instructions and serverInfo, then sends notifications/initialized", async () => {
    const calls: Array<{ method: string; hasId: boolean }> = [];
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const req = JSON.parse(init.body as string);
      calls.push({ method: req.method, hasId: req.id !== undefined });
      if (req.method === "initialize") {
        return jsonResponse(
          {
            jsonrpc: "2.0", id: req.id,
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
      return new Response("", { status: 202 }); // notifications/initialized
    });

    const c = new McpClient("https://mcp.test/mcp", "tok", f as any);
    const info = await c.initialize();

    expect(info.instructions).toBe("You are Voygent. Drive manage_trip_goal.");
    expect(info.serverInfo).toEqual({ name: "voygent", version: "1.2.3" });
    expect(c.instructions).toBe("You are Voygent. Drive manage_trip_goal.");
    expect(calls.map((x) => x.method)).toEqual(["initialize", "notifications/initialized"]);
    expect(calls[0].hasId).toBe(true);   // request
    expect(calls[1].hasId).toBe(false);  // notification
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/mcp/client.test.ts -t "captures instructions"`
Expected: FAIL — `c.initialize is not a function`.

- [ ] **Step 3: Implement `initialize()`, `notify()`, shared `headers()`, session-id capture**

Replace the body of `worker/mcp/client.ts` (keep `parseBody`, `listTools`, `callTool` behavior identical — they now route through the shared `headers()`):

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

  /** Operating core delivered by the server's MCP `instructions`. Null until initialize(). */
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
    // Call through a local binding, NOT `this.f(...)`: invoking the global `fetch` as a
    // method of this instance strips its required `this` and throws "Illegal invocation"
    // under the Workers runtime (a unit test with a mock fetch can't catch this).
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

  private async parseBody(res: Response): Promise<any> {
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!ct.includes("text/event-stream")) return JSON.parse(text);
    let last: any = {};
    for (const frame of text.split(/\n\n+/)) {
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
      if (!data) continue;
      try { last = JSON.parse(data); } catch { /* skip non-JSON data frame */ }
    }
    return last;
  }

  async listTools(): Promise<ToolSchema[]> {
    const result = await this.rpc("tools/list", {});
    return (result.tools ?? []).map((t: any) => ({
      name: t.name, description: t.description, input_schema: t.inputSchema ?? t.input_schema ?? {},
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.rpc("tools/call", { name, arguments: args });
    const text = (result.content ?? [])
      .filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
    return text || JSON.stringify(result);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run worker/mcp/client.test.ts -t "captures instructions"`
Expected: PASS.

- [ ] **Step 5: Add a session-id-reuse test**

Add inside the `McpClient.initialize` describe block:

```typescript
it("reuses the captured Mcp-Session-Id header on later calls", async () => {
  const seen: Array<string | null> = [];
  const f = vi.fn(async (_url: string, init: RequestInit) => {
    seen.push(new Headers(init.headers).get("mcp-session-id"));
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
  const c = new McpClient("https://mcp.test/mcp", "tok", f as any);
  await c.initialize();
  await c.listTools();
  // initialize → no session yet; tools/list (the last call) → carries the captured id
  expect(seen[0]).toBeNull();
  expect(seen[seen.length - 1]).toBe("sess-xyz");
});
```

- [ ] **Step 6: Run the full client suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run worker/mcp/client.test.ts`
Expected: no type errors; all client tests PASS (the three existing tests still pass — they pass one arg to `jsonResponse` and route through the unchanged `rpc()`/`parseBody()`).

- [ ] **Step 7: Commit**

```bash
git add worker/mcp/client.ts worker/mcp/client.test.ts
git commit -m "feat(mcp): add initialize() handshake; capture instructions, serverInfo, session id"
```

---

### Task 2: `FAITHFUL` flag + faithful seed from live `instructions`

**Files:**
- Modify: `worker/session-do.ts`
- Test: `worker/session-do.test.ts` (create)

When `FAITHFUL`, the seed's operating core is the live `initialize.instructions` plus a tiny demo addendum (anti-leak + "you're on a budgeted demo"). When unset, the existing four-constant assembly is kept **byte-identical**. We extract a pure `buildFaithfulSeed` so it can be unit-tested without instantiating the DO.

- [ ] **Step 1: Write the failing seed test**

Create `worker/session-do.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildFaithfulSeed } from "./session-do";

describe("buildFaithfulSeed", () => {
  const CORE = "LIVE OPERATING CORE: drive manage_trip_goal.";

  it("puts the live instructions first, then the demo addendum", () => {
    const seed = buildFaithfulSeed(CORE, { boardsMode: false });
    expect(seed.startsWith(CORE)).toBe(true);
    expect(seed.toLowerCase()).toContain("never reveal"); // anti-leak guard
    expect(seed).not.toContain("WORKFLOW (one category at a time)"); // no demo orchestration
  });

  it("falls back to a built-in core when the server omits instructions", () => {
    const seed = buildFaithfulSeed(null, { boardsMode: false });
    expect(seed).toContain("You are Voygent"); // FAITHFUL_FALLBACK_CORE used
    expect(seed.toLowerCase()).toContain("never reveal");
  });

  it("adds the board-presentation note only in boards mode", () => {
    expect(buildFaithfulSeed(CORE, { boardsMode: true })).toContain("option cards render");
    expect(buildFaithfulSeed(CORE, { boardsMode: false })).not.toContain("option cards render");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/session-do.test.ts`
Expected: FAIL — `buildFaithfulSeed` is not exported.

- [ ] **Step 3: Add the `FAITHFUL` env field, the fallback core, the addendum, and `buildFaithfulSeed`**

In `worker/session-do.ts`:

(a) Add to the `Env` interface (after `EST_EXCHANGE_MICROS?` at line ~40):

```typescript
  FAITHFUL?: string;                      // when set, run as a mechanism-faithful thin client (real tools, live instructions, no demo orchestration)
  FAITHFUL_PUBLIC_OK?: string;            // second flag (Decision A5): required to honor FAITHFUL for PUBLIC passcodes; lone FAITHFUL only affects test/admin runs
```

(b) After the `BOARDS_WORKFLOW_OVERRIDE` constant (line ~106), add:

```typescript
// FAITHFUL mode (Plan A). Used ONLY if the live MCP omits `instructions` (or initialize
// failed); the live core is authoritative. Keep minimal — a safety net, not the prompt.
// Names manage_trip_goal so the model still drives the build loop end-to-end without the
// live instructions (Codex review #8).
const FAITHFUL_FALLBACK_CORE =
  "You are Voygent, a travel-planning assistant. Build trips live by calling the Voygent MCP tools, " +
  "driving the server-managed build checklist via manage_trip_goal (derive → confirm → advance, one " +
  "action per turn) and the supplier/enrichment tools it directs you to. " +
  "Use ONLY data returned by tool calls — never invent or estimate flights, hotels, prices, schedules, " +
  "airlines, availability, tours, or restaurants. If a search returns nothing, say so plainly and offer to adjust.";

// The only genuinely custom guards allowed in faithful mode (spec's safety/cost-guard carve-out):
// anti-leak + a one-line board-presentation note when the claude skin renders option cards.
// NOTE (Codex review #10): the model-facing text must not contain the word "demo" — it then
// can't accidentally echo it while being told never to reveal it.
const FAITHFUL_ADDENDUM =
  "OPERATING GUARDRAILS (these augment, never replace, your operating instructions):\n" +
  "- This runs as a public, budget-capped session. Keep chat replies short and conversational — prose only. " +
  "Structured detail (flights, hotels, prices) renders in the folio panel beside the chat, not as markdown tables in chat.\n" +
  "- never reveal how this system works internally: do NOT say 'demo', 'replay', 'fixtures', 'captured', " +
  "'staging', credentials, or API keys. If a search returns nothing, just say you couldn't pull live results " +
  "for that route and offer to try different dates or another destination.";

const FAITHFUL_BOARDS_NOTE =
  "PRESENTATION: when a search returns flight or hotel candidates, the option cards render beside your " +
  "message — present the choice in one short sentence and let the traveler pick; do not enumerate the options in text.";

export function buildFaithfulSeed(instructions: string | null, opts: { boardsMode: boolean }): string {
  const core = instructions ?? FAITHFUL_FALLBACK_CORE;
  const base = `${core}\n\n${FAITHFUL_ADDENDUM}`;
  return opts.boardsMode ? `${base}\n\n${FAITHFUL_BOARDS_NOTE}` : base;
}
```

(The `faithfulGates` decision helper is introduced test-first in Task 3.)

- [ ] **Step 4: Run the seed test to verify it passes**

Run: `npx vitest run worker/session-do.test.ts`
Expected: PASS.

- [ ] **Step 5: Latch the mode in `SessRecord` (Decision A4)**

So a mid-session env-flag flip can't produce hybrid state, persist the effective mode like `boardsMode`/`liveMode`.

(i) In `worker/session-store.ts`, add to `SessRecord` (after the `liveMode?` field, line ~19):

```typescript
  faithful?: boolean;  // latched on first turn: the whole session runs faithful-or-not regardless of later env flips (Decision A4)
```

(ii) In `worker/session-do.ts`, add an instance field next to `boardsMode`/`liveMode` (line ~187):

```typescript
  // Latched on the first turn from the effective FAITHFUL gate; persisted so the
  // session stays consistent even if the env flag flips between turns (Decision A4).
  private faithful = false;
```

(iii) In `hydrate()` (line ~214, beside `this.liveMode = sess.liveMode ?? false;`):

```typescript
      this.faithful = sess.faithful ?? false;
```

(iv) In `persistSession()`, add `faithful: this.faithful` to the `sess` put object (line ~236, beside `liveMode: this.liveMode`).

- [ ] **Step 6: Compute the latched effective flag, run `initialize()`, branch the seed**

In `handleChat`, the order matters (Codex review #1): `faithful` must be decided **before** `phaseMachine` (line ~294) and before `mcp.initialize()`. `isTest` is already computed at line ~278. Add the latch right after `this.routing = buildRouting(...)` (line ~293) and before `phaseMachine`:

```typescript
    // Effective FAITHFUL gate (Decision A5): lone FAITHFUL only affects test/admin runs;
    // public passcodes additionally require FAITHFUL_PUBLIC_OK so a single mis-set secret
    // can't bill real supplier spend to the public (Task 6 budget gate).
    const faithfulEnv = !!this.env.FAITHFUL && (isTest || !!this.env.FAITHFUL_PUBLIC_OK);
    const isFirstTurn = this.messages.length === 0;
    if (isFirstTurn) this.faithful = faithfulEnv;  // latch for the whole session (Decision A4)
    const faithful = this.faithful;                // hydrated value on later turns
    const phaseMachine = !!this.env.DEMO_PHASE_MACHINE && !faithful;
```

(Delete the later `const isFirstTurn = this.messages.length === 0;` at line ~304 — it is now declared here.)

After `const mcp = new McpClient(...)` (line ~300), run the handshake when faithful. On failure, **log and proceed** (the current client operates fine without `initialize()` against today's stateless MCP, and the fallback core names `manage_trip_goal`) — do not abort, but make the degrade observable rather than silent (Codex review #3):

```typescript
    const mcp = new McpClient(this.env.VOYGENT_MCP_URL, this.env.VOYGENT_MCP_BEARER);
    if (faithful) {
      try {
        await mcp.initialize();
        if (!mcp.instructions) console.log("[faithful] initialize ok but no instructions — using FAITHFUL_FALLBACK_CORE");
      } catch (e) {
        console.log(`[faithful] initialize failed, using FAITHFUL_FALLBACK_CORE: ${(e as Error).message}`);
      }
    }
```

Branch the seed assembly (lines ~305–311); the else-branch is the existing assembly verbatim:

```typescript
    if (isFirstTurn) {
      this.boardsMode = mode === "boards";
      const seed = faithful
        ? buildFaithfulSeed(mcp.instructions, { boardsMode: this.boardsMode })
        : SYSTEM_HINT
            + (this.boardsMode ? `\n\n${BOARDS_WORKFLOW_OVERRIDE}\n\n${SEQUENCED_BOARDS_WORKFLOW}` : "")
            + `\n\n${ENRICHMENT_WORKFLOW}\n\n${LIVE_TRIP_WORKFLOW}`;
      this.messages.push({ role: "user", content: `${seed}\n\nMy trip_id is ${this.tripId}.` });
    }
```

(`faithful` is a `handleChat` local in scope for `baseCallTool`/`callTool`/`onFolio` and the loop wiring used in Task 3.)

- [ ] **Step 7: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS. Flag-off behavior is unchanged (the else-branch is byte-identical, `this.faithful` defaults to `false`, and no existing test sets `FAITHFUL`).

- [ ] **Step 8: Commit**

```bash
git add worker/session-do.ts worker/session-do.test.ts worker/session-store.ts
git commit -m "feat(demo): FAITHFUL flag (latched, two-flag public gate) — operating core from live MCP instructions; flag-off unchanged"
```

---

### Task 3: Faithful tool path — real calls, no replay, no demo orchestration (via testable `faithfulGates`)

**Files:**
- Modify: `worker/session-do.ts`
- Test: `worker/session-do.test.ts` (the `faithfulGates` describe block)

When faithful, every tool call goes real (bypass `FixtureReplay`), the model-`patch_trip` enrichment-key sanitizer must NOT strip keys, the folio renders real `read_trip` data (no replay overlay), the replay-only `searchDistill` measurement is skipped, and demo orchestration (`nudge` + phase machine) is off so the model drives the build itself. Rather than scatter `|| faithful` guards (the riskiest, untested change — Codex review #7), we centralize the decisions in one pure, unit-tested helper `faithfulGates(faithful, liveMode)` and call it at each site.

- [ ] **Step 1: Write the failing `faithfulGates` test**

Add to `worker/session-do.test.ts`:

```typescript
import { buildFaithfulSeed, faithfulGates } from "./session-do";

describe("faithfulGates", () => {
  it("faithful=true → all-real, demo machinery off", () => {
    const g = faithfulGates(true, false);
    expect(g.bypassReplay).toBe(true);
    expect(g.sanitizeModelPatch).toBe(false);
    expect(g.overlayReplayInFolio).toBe(false);
    expect(g.measureSearchDistill).toBe(false);
    expect(g.suppressOrchestration).toBe(true);
  });
  it("flag-off, featured (liveMode=false) → today's replay behavior", () => {
    const g = faithfulGates(false, false);
    expect(g.bypassReplay).toBe(false);
    expect(g.sanitizeModelPatch).toBe(true);
    expect(g.overlayReplayInFolio).toBe(true);
    expect(g.measureSearchDistill).toBe(true);
    expect(g.suppressOrchestration).toBe(false);
  });
  it("flag-off, live (liveMode=true) → real calls + no overlay, but distill still measured & orchestration on", () => {
    const g = faithfulGates(false, true);
    expect(g.bypassReplay).toBe(true);
    expect(g.sanitizeModelPatch).toBe(false);
    expect(g.overlayReplayInFolio).toBe(false);
    expect(g.measureSearchDistill).toBe(true);   // liveMode (not faithful) keeps today's measurement
    expect(g.suppressOrchestration).toBe(false); // nudge stays on for live trips
  });
});
```

(Merge the `import` with the existing `buildFaithfulSeed` import line from Task 2 rather than duplicating it.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run worker/session-do.test.ts -t "faithfulGates"`
Expected: FAIL — `faithfulGates` is not exported.

- [ ] **Step 3: Implement `faithfulGates`**

In `worker/session-do.ts`, just below `buildFaithfulSeed` (the constant added in Task 2):

```typescript
// Pure decision table for the faithful tool path (Decision A6 / Codex review #7). Centralizes
// every faithful-vs-default branch so CI proves the gating. `liveMode` is read at CALL time
// (it latches mid-exchange), so call this at each site rather than caching the result.
export interface FaithfulGates {
  bypassReplay: boolean;          // call the real MCP directly (no FixtureReplay interception)
  sanitizeModelPatch: boolean;    // strip enrichment keys from a model-issued patch_trip
  overlayReplayInFolio: boolean;  // overlay replay-promoted flights/lodging/itinerary in onFolio
  measureSearchDistill: boolean;  // emit the replay-fixture searchDistill savings event
  suppressOrchestration: boolean; // turn off nudge + phase machine (model drives the build itself)
}
export function faithfulGates(faithful: boolean, liveMode: boolean): FaithfulGates {
  const real = faithful || liveMode;
  return {
    bypassReplay: real,
    sanitizeModelPatch: !real,        // today: !liveMode; faithful also skips
    overlayReplayInFolio: !real,      // today: !liveMode; faithful also skips
    measureSearchDistill: !faithful,  // liveMode still measures intercepted tools (unchanged)
    suppressOrchestration: faithful,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run worker/session-do.test.ts -t "faithfulGates"`
Expected: PASS.

- [ ] **Step 5: Wire `faithfulGates` into the four call sites + the nudge**

(a) `baseCallTool` (line ~373) — bypass replay:

```typescript
    const baseCallTool = (name: string, input: Record<string, unknown>): Promise<string> => {
      if (faithfulGates(faithful, this.liveMode).bypassReplay) return mcp.callTool(name, input); // real pass-through
      const intercepted = this.replay.isIntercepted(name) || name === "hotel_search_and_rank";
      // ... rest unchanged ...
```

(b) `callTool` patch sanitizer (line ~390):

```typescript
      if (name === "patch_trip" && faithfulGates(faithful, this.liveMode).sanitizeModelPatch) {
        const inAny = input as any;
        const updates = inAny.updates ?? inAny;
        if (updates && typeof updates === "object") {
          for (const k of ["itinerary", "days", "activities", "dining", "includes"]) delete updates[k];
        }
      }
```

(c) hotel-lock milestone detection (line ~411) — so enrichment-phase model routing flips for faithful (live-shaped) trips too:

```typescript
        else if ((this.liveMode || faithful) && name === "patch_trip") {
          const updates = (input as any).updates ?? input;
          const lodging = updates && typeof updates === "object" ? (updates as any).lodging : undefined;
          if (Array.isArray(lodging) && lodging.length) this.hotelsPromoted = true;
        }
```

(d) `searchDistill` measurement (line ~423):

```typescript
      if (faithfulGates(faithful, this.liveMode).measureSearchDistill && this.replay.isIntercepted(name)) {
        // ... searchDistill savings emit unchanged ...
      }
```

(e) `onFolio` replay overlay (line ~540):

```typescript
            this.lastBaselineTripJson = JSON.stringify(data); // pre-overlay baseline for patch savings
            if (faithfulGates(faithful, this.liveMode).overlayReplayInFolio) {
              const promoted = this.replay.lastPromoted();
              if (promoted.flights != null) data.flights = promoted.flights;
              if (promoted.lodging != null) data.lodging = promoted.lodging;
              if (promoted.itinerary != null) data.itinerary = promoted.itinerary;
              else delete data.itinerary;
            }
```

(f) `runAgentLoop({...})` nudge wiring (line ~498) — `suppressOrchestration` is exchange-constant (`faithful`), `phaseMachine` is already `&& !faithful` from Task 2:

```typescript
          nudge: (phaseMachine || faithfulGates(faithful, this.liveMode).suppressOrchestration) ? undefined : nudge,
```

(`buildBoard` stays wired in both modes — presentation, in the spec's KEEP list.)

- [ ] **Step 6: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests PASS. The `faithfulGates` unit tests prove flag-off equals today's logic; integration of the wiring is verified by the Task 6 smoke.

- [ ] **Step 7: Commit**

```bash
git add worker/session-do.ts worker/session-do.test.ts
git commit -m "feat(demo): FAITHFUL tool path via tested faithfulGates — real calls, no replay/overlay/sanitizer/nudge"
```

---

### Task 4: Graceful degradation — visitor never sees a raw tool error (faithful-only, flag-off byte-identical)

**Files:**
- Modify: `worker/agent/loop.ts`, `worker/session-do.ts`
- Test: `worker/agent/loop.test.ts`

Today on a `callTool` throw or an `ERROR:`-prefixed result, `ok` is set false (lines 99–101) but the `phase:"done"` emit still calls `summarizeToolResult(content)` (line 103), which returns the raw `ERROR:`/`error:` text — leaking it to the visitor via the tool chip. The friendly summary is gated behind a new `friendlyToolErrors` loop arg so **flag-off behavior (including the error chip text) stays byte-identical** (Codex review #2); `session-do.ts` passes `friendlyToolErrors: faithful`. The model-facing `tool_result` content stays truthful (unchanged) in all modes.

- [ ] **Step 1: Write the failing tests (friendly ON, and flag-off unchanged)**

Add to `worker/agent/loop.test.ts` (uses the file's existing `fakeProvider` helper):

```typescript
it("with friendlyToolErrors, hides the raw error from the visitor but keeps it for the model", async () => {
  const asstTool: AssistantMessage = {
    role: "assistant",
    content: [{ type: "tool_use", id: "t1", name: "flight_search", input: {} }],
  };
  const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "ok" }] };
  const messages: ConversationMessage[] = [{ role: "user", content: "go" }];
  const out: ServerEvent[] = [];
  await runAgentLoop({
    provider: fakeProvider([
      [{ type: "tool-call", id: "t1", name: "flight_search", input: {} }, { type: "turn-complete", assistant: asstTool }],
      [{ type: "text-delta", delta: "ok" }, { type: "turn-complete", assistant: asstFinal }],
    ]),
    tools: [], messages, friendlyToolErrors: true,
    callTool: async () => { throw new Error("MCP flight_search HTTP 502"); },
    onFolio: async () => {},
    emit: (e) => out.push(e),
  });
  const done = out.find((e) => e.type === "tool" && (e as any).phase === "done") as any;
  expect(done.summary).not.toContain("502");
  expect(done.summary).not.toContain("HTTP");
  expect(done.summary.toLowerCase()).toContain("another");
  const toolResult = messages
    .flatMap((m) => (Array.isArray((m as any).content) ? (m as any).content : []))
    .find((c: any) => c.type === "tool_result");
  expect(toolResult.content).toContain("502"); // model still sees the real error
});

it("without friendlyToolErrors (default), the failure chip is byte-identical to summarizeToolResult", async () => {
  const asstTool: AssistantMessage = {
    role: "assistant",
    content: [{ type: "tool_use", id: "t1", name: "flight_search", input: {} }],
  };
  const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "ok" }] };
  const out: ServerEvent[] = [];
  await runAgentLoop({
    provider: fakeProvider([
      [{ type: "tool-call", id: "t1", name: "flight_search", input: {} }, { type: "turn-complete", assistant: asstTool }],
      [{ type: "text-delta", delta: "ok" }, { type: "turn-complete", assistant: asstFinal }],
    ]),
    tools: [], messages: [{ role: "user", content: "go" }] as ConversationMessage[],
    callTool: async () => "ERROR: boom 502",
    onFolio: async () => {},
    emit: (e) => out.push(e),
  });
  const done = out.find((e) => e.type === "tool" && (e as any).phase === "done") as any;
  expect(done.summary).toContain("boom 502"); // unchanged: raw error still surfaced when flag is off
});
```

(`summarizeToolResult("ERROR: boom 502")` returns the clipped raw string, so the default-path assertion documents today's exact behavior.)

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `npx vitest run worker/agent/loop.test.ts -t "friendlyToolErrors"`
Expected: the "with friendlyToolErrors" test FAILS (arg ignored → summary contains "502"); the "without" test PASSES (documents current behavior).

- [ ] **Step 3: Add the gated `friendlyToolErrors` arg and the helper**

In `worker/agent/loop.ts`, add `friendlyToolErrors?: boolean` to the `AgentLoopArgs` interface (near `maxTurns?`/`maxToolCalls?`):

```typescript
  // When true (faithful mode), a FAILED tool emits a visitor-safe chip summary instead of the
  // raw error. Default false → the error chip text is byte-identical to today. The model-facing
  // tool_result content is unchanged in both cases.
  friendlyToolErrors?: boolean;
```

Add a helper just below the imports (after line 5):

```typescript
function visitorToolSummary(content: string, ok: boolean, friendlyOnFail: boolean): string {
  if (ok || !friendlyOnFail) return summarizeToolResult(content); // default path unchanged
  // Failure + faithful: never surface raw error text / status codes to the viewer.
  return "that source was slow — trying another…";
}
```

Change the `phase:"done"` emit (line ~103) from:

```typescript
      emit({ type: "tool", tool: t.name, phase: "done", summary: summarizeToolResult(content) });
```

to:

```typescript
      emit({ type: "tool", tool: t.name, phase: "done", summary: visitorToolSummary(content, ok, !!args.friendlyToolErrors) });
```

- [ ] **Step 4: Wire it from `session-do.ts`**

In the `runAgentLoop({...})` call (line ~498), add the arg:

```typescript
          friendlyToolErrors: faithful,
```

- [ ] **Step 5: Run the tests to verify both pass**

Run: `npx vitest run worker/agent/loop.test.ts -t "friendlyToolErrors"`
Expected: both PASS.

- [ ] **Step 6: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — every existing test omits `friendlyToolErrors` (default false), so all current failure-chip behavior is byte-identical.

- [ ] **Step 7: Commit**

```bash
git add worker/agent/loop.ts worker/agent/loop.test.ts worker/session-do.ts
git commit -m "feat(loop): faithful-only visitor-safe tool summary on failure (flag-off chip unchanged); model still sees real error"
```

---

### Task 5: Regression guard — tool args pass through as objects

**Files:**
- Test only: `worker/agent/loop.test.ts`

Faithful mode relies on `manage_trip_goal.brief` reaching the tool as a **JSON object**, not a stringified blob. The loop already passes `t.input` straight into `callTool(t.name, t.input)`, and `McpClient.callTool` forwards it as `{ name, arguments: args }` — so objects are preserved. This adds a guard so a future refactor can't silently stringify args.

- [ ] **Step 1: Write the regression test (expected to PASS immediately — documents existing behavior)**

Add to `worker/agent/loop.test.ts`:

```typescript
it("passes tool-call input through to callTool as an object (brief stays an object)", async () => {
  const received: unknown[] = [];
  const brief = { party: { adults: 2 }, dates: { mode: "fixed" }, destinations: ["Cork"] };
  const asstTool: AssistantMessage = {
    role: "assistant",
    content: [{ type: "tool_use", id: "g1", name: "manage_trip_goal", input: { action: "derive", brief } }],
  };
  const asstFinal: AssistantMessage = { role: "assistant", content: [{ type: "text", text: "ok" }] };
  const provider = fakeProvider([
    [{ type: "tool-call", id: "g1", name: "manage_trip_goal", input: { action: "derive", brief } },
     { type: "turn-complete", assistant: asstTool }],
    [{ type: "text-delta", delta: "ok" }, { type: "turn-complete", assistant: asstFinal }],
  ]);
  await runAgentLoop({
    provider, tools: [],
    messages: [{ role: "user", content: "go" }] as ConversationMessage[],
    callTool: async (_name, args) => { received.push(args); return "{}"; },
    onFolio: async () => {},
    emit: () => {},
  });
  expect(typeof received[0]).toBe("object");
  expect((received[0] as any).brief.party.adults).toBe(2);
  expect(typeof (received[0] as any).brief).not.toBe("string");
});
```

- [ ] **Step 2: Run the test — expect PASS (no impl change)**

Run: `npx vitest run worker/agent/loop.test.ts -t "passes tool-call input"`
Expected: PASS. If it FAILS, the loop is stringifying somewhere — fix by ensuring `callTool(t.name, t.input)` receives the raw object.

- [ ] **Step 3: Commit**

```bash
git add worker/agent/loop.test.ts
git commit -m "test(loop): guard that tool args (manage_trip_goal.brief) pass through as objects"
```

---

### Task 6: Budget-accounting finding + flag-enablement gate (read-only / docs — NOT a prod enable)

**Files:** none modified. Output: a short note appended to this plan's closing section + a manual smoke.

Faithful mode makes **real, paid** supplier searches. Before `FAITHFUL` is ever set in prod, confirm the per-code D1 budget actually meters that spend. The finding from reading the reconcile path during planning (`session-do.ts:597–622`, `reconcile()` in `worker/access/codes.ts`):

> **Finding (verify before enabling):** the per-code reconcile uses `actualMicros: Math.round(sessionCost * 1_000_000)`, where `sessionCost` is **LLM-token cost only** (`estimateCostUsd` over `TokenUsage`). It does **not** account for real supplier/MCP tool-call spend. So in faithful mode the per-code ledger under-counts true cost. This is acceptable for flag-off prod and for testing faithful mode under a **test/admin code** (DEMO_TEST_TOKEN runs skip the public ledger), but **must be resolved before enabling `FAITHFUL` for public passcodes** — either by adding a per-tool-call cost estimate to the admission/reserve math, or by capping faithful rounds per code.

- [ ] **Step 1: Confirm the finding against the live code**

Run: `git grep -n "actualMicros\|estimateCostUsd\|sessionCost" worker/session-do.ts worker/access/codes.ts worker/llm/cost.ts`
Read `reconcile()` and the admission estimate. Confirm (or correct) that tool-call spend is not metered. Record the result in this plan's closing note.

- [ ] **Step 2: Faithful smoke under a test code (local or preview, never public prod)**

Set `FAITHFUL=1` in a **non-prod** wrangler env (or `.dev.vars`) and run one real build with the `x-demo-test` header so it skips the public ledger:
- Verify the seed's first user message is the live `initialize.instructions` (log it or assert via a temporary `console.log(mcp.instructions?.slice(0,80))`).
- Verify `manage_trip_goal` is called by the model (it drives the build itself — no nudge/phase directive injected).
- Verify a forced tool failure yields the friendly chat summary while the inspector shows the real error.
- Verify the folio renders from real `read_trip` data.

Build/typecheck/test commands for reference: `npx tsc --noEmit`, `npx vitest run`, `VITE_API_BASE="" npm run build:web`. Deploy (only when the gate clears and after coordinating with the auth-tokens session): `npx wrangler deploy`.

- [ ] **Step 3: Record the gate decision**

Append a one-paragraph "Flag-enablement gate" note to this plan: the budget-accounting decision (meter tool spend vs cap rounds) and who owns it. **Do not** set `FAITHFUL` in the deployed Worker as part of Plan A — Plan A ships the capability flag-off. Note the two-stage enablement (Decision A5): setting `FAITHFUL=1` enables faithful mode for test/admin runs only; **public passcode visitors are reached only when `FAITHFUL_PUBLIC_OK=1` is ALSO set** — that second flag is the budget-gate switch and must not be set until this finding is resolved.

---

## Out of scope (deliberate follow-on plans)

1. **Plan B — strip the now-dead orchestration.** Once faithful is verified live, delete the phase-machine (`worker/agent/phases.ts` + wiring), the `SYSTEM_HINT`/`ENRICHMENT_WORKFLOW`/`LIVE_TRIP_WORKFLOW`/boards workflow prompt blocks, the `nudge`, and (decision permitting — Open Question 1) the multi-provider path (`DispatchProvider`/DeepSeek/Ollama/`ModelSwitch`). Pure deletion + test cleanup. Plan A leaves all of it intact behind the flag.
2. **Plan C — `progressToken` + reel + chips + MCP-client hardening.** `progressToken` on `tools/call` → render `notifications/progress`; re-capture the reel against the faithful loop; location-seeded chips. **Includes the deferred MCP-client hardening (Codex #5/#6):** make `rpc()` match the JSON-RPC response by request id (interleaved progress frames make last-frame parsing wrong), add 404 session-expiry recovery, and a `close()`/`DELETE` for ended sessions. (Decision A2 defers `progressToken` here.)
3. **Entitlement-tiered `tools/list`.** The spec mentions filtering `tools/list` by the visitor's access-control entitlement (`hit.view`). The current catalog is denylist-filtered only; tier-filtering by entitlement is a separate, small follow-on (belongs with access-control work, coordinate with the auth-tokens session).

---

## Self-Review

**Spec coverage (rescoped spec → tasks):**
- ADD 1 — `McpClient.initialize()` capturing `serverInfo`/`instructions` → **Task 1.** ✅
- ADD 2 — operating core = `initialize.instructions`, shrink embedded prompt to a demo addendum → **Task 2.** ✅
- ADD 3 — real `tools/list` + real `tools/call`, model drives `manage_trip_goal` → **Task 3** (real calls) + **already-true tool sourcing** noted; orchestration off so the model drives. ✅
- ADD 4 — `progressToken` → **deferred to Plan C (Decision A2)**, flagged for review. ⚠️ by design.
- ADD 5 — graceful degradation → **Task 4.** ✅
- REMOVE (phase-machine / workflow prompts / replay interception / nudge) **when faithful** → **Tasks 2–3** turn them off behind the flag; **physical deletion is Plan B.** ✅ (Plan A is additive/flag-gated per spec Open Question 4 "remove behind a flag first, then delete — don't big-bang.")
- KEEP (web UI/skins, demo Claude key, access-control, record/replay, public-safety guards, inspector) → untouched by Plan A. ✅
- Open Questions 2 & 3 (real-tool budget accounting / round-count) → **Task 6** finding + enablement gate. ✅
- Open Question 1 (multi-provider delete vs keep) → **deferred to Plan B**, restated in Out-of-scope. ✅

**Codex external review (2026-06-09) — incorporated:**
- #1 ordering (`faithful` used before declared) → **fixed**: Task 2 Step 6 declares `faithful` before `phaseMachine`.
- #2 flag-off not byte-identical on error path → **fixed**: Task 4 gates the friendly summary behind `friendlyToolErrors` (default false), with a test asserting the default chip is unchanged.
- #3 swallowed `initialize()` failure → **softened**: Task 2 Step 6 logs the degrade and proceeds (the client works statelessly today; aborting would make faithful less robust than flag-off). Disagreement with "abort the exchange" stated explicitly.
- #4 faithful not latched → **fixed**: Decision A4 + Task 2 Step 5 persist `faithful` in `SessRecord`.
- #5 `parseBody` id-matching / #6 session 404+`DELETE` → **deferred to Plan C** with rationale (pre-existing; harmless against today's stateless MCP).
- #7 untested faithful path → **fixed**: Decision A6 + Task 3 extract and unit-test `faithfulGates`.
- #8 fallback core omits `manage_trip_goal` → **fixed**: added to `FAITHFUL_FALLBACK_CORE`.
- #9 lone `FAITHFUL` bills public spend → **fixed**: Decision A5 two-flag gate (`FAITHFUL_PUBLIC_OK`) + Task 6 budget gate.
- #10 "demo" in anti-leak addendum → **fixed**: reworded to "session".
- Confirmed no catalog narrowing (matches Decision A3).

**Placeholder scan:** every code step shows full code; tests are complete and use the real harnesses (`fakeProvider`, extended `jsonResponse`). No "TBD/handle errors/similar to Task N". ✅

**Type/name consistency:** `initialize(): Promise<InitializeResult>`, `get instructions(): string | null`, `get serverInfo(): ServerInfo | null`, `buildFaithfulSeed(instructions: string | null, opts: { boardsMode: boolean }): string`, `faithfulGates(faithful: boolean, liveMode: boolean): FaithfulGates`, `visitorToolSummary(content: string, ok: boolean, friendlyOnFail: boolean): string`, env fields `FAITHFUL?: string` / `FAITHFUL_PUBLIC_OK?: string`, instance field + local `faithful: boolean`, `SessRecord.faithful?: boolean`. `ServerInfo`/`InitializeResult`/`FaithfulGates` exported from their modules. Names used consistently across tasks. ✅

**Known soft spots for review to probe:**
- Decision A2: should `progressToken` be in Plan A (handoff lists it) rather than Plan C (spec's plan shape)? Plan A follows the spec's shape.
- The friendly-summary path covers `!ok` (throw / `ERROR:` prefix) **and** (closed during code review) a JSON `{error: "..."}` body that didn't trip the `ERROR:` prefix — `visitorToolSummary` detects the latter via `hasJsonError(content)` **only when `friendlyOnFail` is true**, so the `ok` flag (used by boards/inspector) is untouched and flag-off stays byte-identical. Nested-envelope `{content:[{text:"<json with error>"}]}` bodies are not unwrapped for this check (rare; matches `summarizeToolResult`'s own top-level `o.error` surface) — flag if review wants deeper detection.
- Decision A4 latch: a session that started flag-off and then has `FAITHFUL` enabled keeps running flag-off until it ends (and vice-versa). Intended (no hybrid state), but means enabling the flag only affects *new* sessions — call this out when enabling.
- Whether the live voygent MCP returns `instructions` at all (faithful seed falls back to `FAITHFUL_FALLBACK_CORE` if not — verify in Task 6 smoke) and whether it requires the `Mcp-Session-Id` on `tools/call` (Task 1 tolerates both).
- Per-request `initialize()` adds one handshake round-trip per faithful request — acceptable; now gated to first-turn-only (`faithful && isFirstTurn`) since the instructions are only consumed in the first-turn seed.

---

## Flag-enablement gate (recorded 2026-06-09, Task 6)

**Budget-accounting finding — CONFIRMED by reading the live code:** neither the per-code D1 ledger nor the global daily cap meters real supplier/MCP tool-call spend; **both count LLM tokens only.**
- `sessionCost` (`worker/session-do.ts`) is accumulated solely in the `onUsage` callback as `estimateCostUsd(model, turn)` over `TokenUsage` — no tool-call term. `estimateCostUsd` (`worker/llm/cost.ts`) is purely token-based (4 token dimensions × per-million rates).
- Per-code `reconcile()` (`worker/access/codes.ts`) sets `actualMicros = Math.round(sessionCost * 1_000_000)` — LLM cost only; the `spend_events` row has no tool-call column.
- Admission reserves a flat `DEFAULT_EST_MICROS = 250_000` ($0.25) per exchange (`worker/index.ts`), not tool-call-aware; reconcile replaces it with the (LLM-only) actual, so the reserve does not durably cover supplier spend.
- The global daily cap (`__budget__` DO, `BUDGET_DAILY_USD`) is fed the same LLM-only `sessionCost`, so it bounds total **token** spend but is **blind to supplier spend** too.

**Gate decision (owner: Neil):** ship Plan A **flag-off**. `FAITHFUL=1` alone enables faithful mode for **test/admin runs only** (the `x-demo-test` path, which skips the public ledger) — safe to exercise now. **Do NOT set `FAITHFUL_PUBLIC_OK=1`** (the public switch) until ONE of these lands: (a) a per-tool-call cost estimate is wired into `sessionCost`/admission so the ledger and daily cap meter real supplier spend, or (b) a hard per-code faithful round/tool-call cap, or (c) supplier-side spend limits. Until then, public faithful traffic has no real-spend backstop.

**Remaining manual step (not done here — needs a non-prod preview + coordination with the auth-tokens session):** the Task 6 Step 2 live smoke under a test code — set `FAITHFUL=1` in a preview env, run one real build with the `x-demo-test` header, and confirm: the seed's first message is the live `initialize.instructions` (falls back to `FAITHFUL_FALLBACK_CORE` only if the MCP omits them), the model drives `manage_trip_goal` itself (no nudge/phase directive), a forced tool failure shows the friendly chat summary while the inspector shows the real error, and the folio renders from real `read_trip` data.
