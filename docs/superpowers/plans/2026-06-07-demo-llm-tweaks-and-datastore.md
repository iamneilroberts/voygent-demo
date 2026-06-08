# Demo LLM Tweaks + Data-Store Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public Voygent engineering demo LLM-agnostic (live Claude + live DeepSeek, grayed local Ollama, optimize-for speed/cost/capability), add a live KV/D1 data-store-ops widget, and add two deep-dive info pages — without breaking the existing Claude-only behavior, wire contracts, or the demo's honesty invariants.

**Architecture:** Three workstreams over six dependency-ordered slices (C → B → A1 → A2 → A3 → A4). The `LLMProvider` interface is the cross-LLM seam; a new `DispatchProvider` routes per-turn on `opts.model` so the agent loop needs no change. Model ids stay strings (Claude ids verbatim) backed by a provider registry. The data-store widget maps tool calls → *projected* production KV/D1 ops (the demo itself runs on Durable Object SQLite, binds no KV/D1). Spec: `docs/superpowers/specs/2026-06-07-demo-llm-tweaks-and-datastore-design.md` (amendments R1–R9 are authoritative).

**Tech Stack:** Cloudflare Workers (`workerd`, `nodejs_compat`), TypeScript, React (Vite SPA), vitest. Anthropic Messages API (existing), DeepSeek OpenAI-compatible chat-completions (new), Ollama `/api/chat` (new, local-dev only).

**Where to work:** the demo worktree `/home/neil/dev/voygent-demo-demo-enrichment`, branch `demo-enrichment` (file tree `worker/`, `web/`, `shared/` — NOT the `src/` tree). All paths below are relative to that worktree root. If isolating, create a branch off `demo-enrichment` first.

**Commands:**
- Single test file: `npx vitest run <path>`
- Full suite: `npm test`
- Typecheck: `npx tsc --noEmit`
- Build SPA (for UI tasks): `npm run build:web`

---

## File map

**Create:**
- `worker/llm/deepseek.ts` — `DeepSeekProvider` + `parseOpenAiStream` + Anthropic⇄OpenAI translators
- `worker/llm/deepseek.test.ts`
- `worker/llm/ollama.ts` — minimal `OllamaProvider` (local-dev only)
- `worker/llm/index.ts` — `providerFor(modelId, env)` factory
- `worker/llm/dispatch.ts` — `DispatchProvider` (per-turn provider routing)
- `worker/llm/dispatch.test.ts`
- `worker/storeops.ts` — `storeOpsForTool(name, args?)` mapping
- `worker/storeops.test.ts`
- `web/src/StoreOpsWidget.tsx` — the KV/D1 widget
- `web/src/TweaksPanel.tsx` — provider/preset/grayed-local controls

**Modify:**
- `shared/models.ts` — provider registry, `ProviderId`, `modelEntry`/`providerOf`, widen `enabledModels`, `OPTIMIZE_PRESETS`
- `shared/models.test.ts` — registry + presets tests
- `worker/llm/cost.ts` — DeepSeek pricing; provider-aware caching note
- `worker/llm/cost.test.ts` — DeepSeek pricing tests
- `shared/events.ts` — add `InsStore` (`kind:"store"`) to `InspectorEvent`; widen `StatsResponse.byModel` with `other`
- `worker/stats.ts` — derive `byModel.other` in `shapeStats`; tests
- `worker/stats.test.ts` — other-bucket test (create if absent)
- `worker/session-do.ts` — Env additions; `DispatchProvider` swap (line 275); emit `kind:"store"` per tool (emit wrapper ~313)
- `worker/info/pages.ts` — two new pages
- `worker/info/layout.ts` — two new `INFO_NAV` entries
- `worker/index.ts` — `/presets` advertises DeepSeek gate
- `web/src/App.tsx` — reducer handles `kind:"store"`; pass `storeOps` to Inspector; richer routing state
- `web/src/Inspector.tsx` — render `StoreOpsWidget`; mount `TweaksPanel`; "Across all sessions" shows `other`; new `INFO_LINKS`
- `web/src/lib/model.ts` — provider/preset resolution
- `web/src/ModelSwitch.tsx` — add a "Tweaks" affordance (keep compact switch)

---

# Slice C — Two deep-dive info pages

No API keys, no agent-loop change. Lands first. The LLM page cites the **`LLMProvider` seam** (which exists today) and describes DeepSeek as "now wired" or "planned" depending on whether Slice A2 has landed — write it provider-seam-first so it never cites a non-existent `deepseek.ts`.

### Task C1: Add the `data-stores` info page

**Files:**
- Modify: `worker/info/pages.ts` (add to `PAGES`)
- Modify: `worker/info/layout.ts:8-15` (`INFO_NAV`)
- Test: `worker/info/pages.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `worker/info/pages.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { infoPageHtml } from "./pages";

describe("infoPageHtml", () => {
  it("renders the data-stores page with the SQL-DBA mindshift section", () => {
    const html = infoPageHtml("data-stores");
    expect(html).not.toBeNull();
    expect(html!).toContain("KV");
    expect(html!).toContain("D1");
    expect(html!).toContain("career SQL DBA");
  });
  it("renders the llm-options page citing the provider seam", () => {
    const html = infoPageHtml("llm-options");
    expect(html).not.toBeNull();
    expect(html!).toContain("LLMProvider");
    expect(html!).toContain("Ollama");
  });
  it("returns null for an unknown slug", () => {
    expect(infoPageHtml("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/info/pages.test.ts`
Expected: FAIL — `data-stores`/`llm-options` not in `PAGES`, `infoPageHtml` returns null.

- [ ] **Step 3: Add the `data-stores` page**

In `worker/info/pages.ts`, add this entry to the `PAGES` object (after `"production-system"`, before `"resume"`):
```ts
  "data-stores": {
    title: "KV, D1, and rewiring a SQL brain",
    subtitle: "Four storage primitives, one hybrid model — and the unlearning a career relational DBA has to do at the edge.",
    body: `
<p>Voygent runs on Cloudflare's edge, where "the database" isn't one box — it's four primitives with sharply different shapes. The discipline is matching each piece of state to the primitive whose grain fits, not forcing everything into rows-and-joins out of habit.</p>

<h2>The four primitives</h2>
<ul>
  <li><strong>Workers KV</strong> — a global, eventually-consistent key→value store. O(1) <code>get</code>/<code>put</code> by key, <code>list</code> by key prefix. No queries, no joins, ~60s global propagation. Voygent keeps each <em>trip blob</em> here under a caller-prefixed key.</li>
  <li><strong>D1</strong> — SQLite at the edge: real SQL, transactions, indexes, and FTS5 full-text search. Voygent uses it as the <em>catalog/index</em> — the queryable spine (find trips, search content) that KV can't express.</li>
  <li><strong>R2</strong> — object storage for binaries: rendered folio HTML, images, documents. Served by path, billed like S3, no egress fees.</li>
  <li><strong>Durable Objects</strong> — a single-writer, strongly-consistent compute+storage cell. Serialized transactions against one logical owner. This demo's per-session state (conversation, replay snapshot, the daily-budget ledger) lives in a DO — exactly the workload KV's eventual consistency can't safely hold.</li>
</ul>

<h2>The hybrid model</h2>
<p>A trip is written as a <strong>KV blob</strong> (cheap, global, read-heavy) <em>and</em> indexed as a <strong>D1 row</strong> (so "list this advisor's trips" or "search trip content" is a query, not a full-keyspace scan). R2 holds what the client downloads. DO holds the live, must-be-consistent session. Each store does the one thing it's shaped for.</p>

<h2>The mindshift for a career SQL DBA</h2>
<p>If your instinct is "third-normal-form, then JOIN," the edge will fight you. The rewiring:</p>
<ul>
  <li><strong>Key design <em>is</em> the schema.</strong> In KV there's no <code>WHERE</code> — only the key and its prefix. You design the key so the access you need is a <code>get</code> or a <code>list</code>, because nothing else exists.</li>
  <li><strong>No cross-key joins.</strong> You denormalize on purpose: duplicate the fields a read needs into the blob, rather than joining at read time. Storage is cheap; an extra round trip at the edge is not.</li>
  <li><strong>Eventual consistency is the default, not a bug.</strong> A KV write may not be globally visible for ~a minute. Anything that needs read-your-writes (a counter, a lock, a ledger) belongs in a DO or D1, not KV.</li>
  <li><strong><code>list</code> is not <code>SELECT</code>.</strong> Prefix scans are paginated and ordered by key — so you encode sort order and grouping <em>into</em> the key (zero-padded indices, sortable timestamps), the way this demo pads <span class="mono">msg:00000</span> keys so a list returns them in order.</li>
  <li><strong>Reach for D1 when you genuinely need a query.</strong> Full-text search, ad-hoc filters, aggregates — that's D1's FTS5 + SQL. The skill is knowing which reads justify the index and which are just a keyed blob fetch.</li>
  <li><strong>Values have hard caps.</strong> A DO storage value caps at 128 KiB; a real tool-result bundle can exceed it, so the persisted copy elides the largest payloads to fit (a real lesson from <span class="mono">worker/session-store.ts</span>) while the in-memory copy stays whole.</li>
</ul>
<blockquote>The relational reflexes aren't wrong — they're scoped. You still get SQL where SQL earns its keep (D1). You just stop paying join cost for reads that a well-designed key answers for free.</blockquote>
<span class="artifact">sources: CLAUDE.md (KV \`voygent-themed\`, D1 \`voygent-prod\`) · ADR hybrid-D1+KV direction · worker/session-store.ts (128 KiB cap + ordered msg: keys) · src/shared/kv-keys.ts (caller-prefixed keys)</span>
<p><a class="cta" href="/">watch the data-store ops accrue live →</a></p>`,
  },
```

- [ ] **Step 4: Add the `llm-options` page**

In `worker/info/pages.ts`, add this entry to `PAGES` immediately after `"data-stores"`:
```ts
  "llm-options": {
    title: "Choosing the model — and why the demo is LLM-agnostic",
    subtitle: "Frontier, cheap, and local models behind one provider seam. The moat is the tools and the orchestration, not the model vendor.",
    body: `
<p>This demo drives a full agent loop, but the model behind it is swappable. Everything the agent does — the tool catalog, the trip state, the record/replay honesty layer — sits behind a single provider interface, so the driving LLM is a configuration choice, not a rewrite.</p>

<h2>The seam</h2>
<p>One TypeScript interface, <code>LLMProvider.stream(messages, tools, opts)</code>, yields a normalized event stream (text deltas, tool calls, token usage). Anthropic's Claude is one implementation; a <code>DeepSeekProvider</code> over the OpenAI-compatible API is another; an <code>OllamaProvider</code> for local models is a third. The agent loop consumes the normalized events and never knows which vendor produced them. Adding a provider is implementing one interface plus a pricing row.</p>

<h2>Frontier vs cheap vs local</h2>
<ul>
  <li><strong>Frontier (Anthropic Claude).</strong> Strongest reasoning and tool-use reliability; the default for the demo's discovery phase. Anthropic-specific prompt-cache breakpoints make a long agent loop affordable — cache reads bill at ~0.1× fresh input.</li>
  <li><strong>Cheap (DeepSeek).</strong> An OpenAI-compatible, very-low-cost model — the same family this project's own bulk-I/O tooling routes to. It does <em>automatic</em> prefix caching (no manual breakpoints) and reports cache hits directly. Great for the recipe-driven enrichment phase where the reasoning bar is lower. The "optimize for cost" preset routes here.</li>
  <li><strong>Local (Ollama).</strong> A model on your own machine — zero per-token cost, full data residency, offline-capable. In this demo it is shown but <strong>grayed out</strong>: this UI is served from a Cloudflare edge Worker, which cannot reach a model listening on your <span class="mono">localhost</span>. The provider exists in code; it only lights up in a local-dev deployment where <span class="mono">OLLAMA_BASE_URL</span> is reachable.</li>
</ul>

<h2>Speed vs cost vs capability</h2>
<p>The Tweaks panel exposes three presets. <strong>Speed</strong> favors the fastest small model; <strong>Cost</strong> routes to the cheapest enabled provider; <strong>Capability</strong> puts the strongest model on the reasoning-heavy phase. "Smart" routing can even split phases across vendors — frontier discovery, cheap enrichment — because the seam makes per-turn provider choice free.</p>

<h2>Honesty survives the swap</h2>
<p>For the featured trips, the replay layer intercepts <em>tool results</em>, not the model — so swapping providers can't let any model fabricate travel data. A weaker model that picks a nonexistent option id simply gets rejected. The model-agnostic seam and the fabrication guard are orthogonal, by design.</p>

<h2>When local actually wins</h2>
<p>Grayed here doesn't mean useless. Local models win when data must never leave the building (regulated/PII workloads), when token cost at scale dominates (high-volume batch classification), or when the deployment must run offline. The right architecture is the one that lets you make that call per-workload — which is exactly what the provider seam buys.</p>
<span class="artifact">sources: worker/llm/provider.ts (the seam) · worker/llm/deepseek.ts · worker/llm/ollama.ts · ~/dev/llm-tools (the project's real cheap-router) · ADR-0004 (model-swappable host)</span>
<p><a class="cta" href="/">tweak the model on a live trip →</a></p>`,
  },
```

- [ ] **Step 5: Register both in the nav**

In `worker/info/layout.ts`, add to the `INFO_NAV` array (after the `production-system` entry, before `resume`):
```ts
  { slug: "data-stores",       title: "KV, D1, and a SQL brain",            nav: "data stores" },
  { slug: "llm-options",       title: "Choosing the model",                 nav: "llm options" },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run worker/info/pages.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add worker/info/pages.ts worker/info/layout.ts worker/info/pages.test.ts
git commit -m "feat(demo/info): add data-stores + llm-options deep-dive pages"
```

### Task C2: Surface the new pages in the Inspector's info links

**Files:**
- Modify: `web/src/Inspector.tsx:11-17` (`INFO_LINKS`)

- [ ] **Step 1: Add two link entries**

In `web/src/Inspector.tsx`, extend the `INFO_LINKS` array with:
```ts
  { slug: "llm-options", label: "Choosing the model", blurb: "LLM-agnostic seam: frontier, cheap DeepSeek, local Ollama" },
  { slug: "data-stores", label: "KV, D1, and a SQL brain", blurb: "the hybrid storage model and the relational-DBA unlearning" },
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build:web`
Expected: PASS (no type errors; SPA builds).

- [ ] **Step 3: Commit**

```bash
git add web/src/Inspector.tsx
git commit -m "feat(demo/inspector): link the two new deep-dive pages"
```

---

# Slice B — KV/D1 data-store-ops widget

No API keys. The widget maps each tool call to the production KV/D1 ops it *would* trigger — labeled "projected," never "measured." Decide the Inspector layout now (this widget sits in the live body, above "Across all sessions") so it doesn't fight the Tweaks panel later.

### Task B1: The `storeOpsForTool` pure mapper

**Files:**
- Create: `worker/storeops.ts`
- Test: `worker/storeops.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/storeops.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { storeOpsForTool } from "./storeops";

describe("storeOpsForTool", () => {
  it("maps save_trip to a KV put + a D1 index upsert", () => {
    const ops = storeOpsForTool("save_trip");
    expect(ops).toContainEqual({ store: "KV", op: "put", note: "write the trip blob" });
    expect(ops.some((o) => o.store === "D1" && o.op === "query")).toBe(true);
  });
  it("maps read_trip to a single KV get", () => {
    expect(storeOpsForTool("read_trip")).toEqual([{ store: "KV", op: "get", note: "read the trip blob" }]);
  });
  it("maps patch_trip to a KV read-modify-write", () => {
    const ops = storeOpsForTool("patch_trip");
    expect(ops).toEqual([
      { store: "KV", op: "get", note: "load current trip blob" },
      { store: "KV", op: "put", note: "write the patched trip blob" },
    ]);
  });
  it("maps find_trips to a D1 query", () => {
    expect(storeOpsForTool("find_trips")).toEqual([{ store: "D1", op: "query", note: "query the trip index" }]);
  });
  it("returns no ops for a pure search tool (no trip-state write)", () => {
    expect(storeOpsForTool("flight_search")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/storeops.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapper**

Create `worker/storeops.ts`:
```ts
// Maps a Voygent MCP tool call to the production-store ops it WOULD trigger.
// This is a PROJECTION for the demo's data-store widget: the demo itself runs on
// Durable Object SQLite and binds no KV/D1. Grounded in Voygent's hybrid model —
// trip blob in KV, queryable index/FTS5 in D1 (see /info/data-stores). Pure +
// testable; name-keyed (args reserved for finer grain later). Tools with no
// trip-state side effect return [] (search/list/distill read candidate stores,
// not the trip store — we don't claim ops we can't ground).
export type StoreId = "KV" | "D1";
export interface StoreOp {
  store: StoreId;
  op: "get" | "put" | "list" | "query" | "delete";
  note: string;
}

export function storeOpsForTool(name: string, _args?: Record<string, unknown>): StoreOp[] {
  switch (name) {
    case "save_trip":
      return [
        { store: "KV", op: "put", note: "write the trip blob" },
        { store: "D1", op: "query", note: "upsert the trip index row" },
      ];
    case "read_trip":
    case "read_trip_section":
      return [{ store: "KV", op: "get", note: "read the trip blob" }];
    case "patch_trip":
    case "promote_flights":
    case "promote_hotels_to_lodging":
    case "confirm_lodging":
      return [
        { store: "KV", op: "get", note: "load current trip blob" },
        { store: "KV", op: "put", note: "write the patched trip blob" },
      ];
    case "find_trips":
    case "list_trips":
      return [{ store: "D1", op: "query", note: "query the trip index" }];
    case "search_trip_content":
      return [{ store: "D1", op: "query", note: "FTS5 full-text search over trip content" }];
    case "delete_trip":
      return [
        { store: "KV", op: "delete", note: "remove the trip blob" },
        { store: "D1", op: "query", note: "delete the trip index row" },
      ];
    default:
      return [];
  }
}
```
> Note: `patch_trip` is intentionally read-modify-write (KV has no partial update). The widget header must read "projected production data-store ops," never "measured" (R6).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/storeops.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/storeops.ts worker/storeops.test.ts
git commit -m "feat(demo): storeOpsForTool — project tool calls to KV/D1 ops"
```

### Task B2: Add the `kind:"store"` inspector event

**Files:**
- Modify: `shared/events.ts:50-68` (`InspectorEvent` union)

- [ ] **Step 1: Extend the union**

In `shared/events.ts`, add this variant to the `InspectorEvent` union (after the `kind:"overhead"` variant, before `kind:"summary"`):
```ts
  | { type: "inspector"; kind: "store"; exchangeId: string; turn: number;
      tool: string; ops: import("../worker/storeops").StoreOp[] }
```
> The `import(...)` type-only reference keeps `shared/` from depending on `worker/` at runtime (it's erased at compile time). If the repo's lint forbids cross-dir type imports, instead inline the shape: `ops: Array<{ store: "KV"|"D1"; op: "get"|"put"|"list"|"query"|"delete"; note: string }>`.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add shared/events.ts
git commit -m "feat(demo): add kind:'store' inspector event"
```

### Task B3: Emit `kind:"store"` per tool call from the DO

**Files:**
- Modify: `worker/session-do.ts:313-326` (the `emit` wrapper)

- [ ] **Step 1: Import the mapper**

In `worker/session-do.ts`, add to the import block (near line 12):
```ts
import { storeOpsForTool } from "./storeops";
```

- [ ] **Step 2: Emit a derived store event when a tool inspector event fires**

In the `emit` function (currently lines 313–326), inside the `if (ev.type === "inspector")` block, after the existing `if (ev.kind === "turn") ... else if (ev.kind === "tool") toolCallCount++;` chain, add a sibling block that sends the projected store ops directly through `mux.send` (NOT through `emit` — avoid recursion and don't tax `instrumentationBytes`, since this is derived metadata, not model-facing cost):
```ts
      if (ev.kind === "tool") {
        const ops = storeOpsForTool(ev.name);
        if (ops.length) mux.send({ type: "inspector", kind: "store", exchangeId, turn: ev.turn, tool: ev.name, ops });
      }
```
> Place this AFTER `toolCallCount++` and BEFORE the `instrumentationBytes` accumulation line, so the store event is not itself counted as instrumentation.

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add worker/session-do.ts
git commit -m "feat(demo): emit projected KV/D1 store ops per tool call"
```

### Task B4: The `StoreOpsWidget` component

**Files:**
- Create: `web/src/StoreOpsWidget.tsx`

- [ ] **Step 1: Implement the widget**

Create `web/src/StoreOpsWidget.tsx`:
```tsx
import type { StoreOp } from "../../worker/storeops";

export interface InsStore {
  type: "inspector"; kind: "store"; exchangeId: string; turn: number;
  tool: string; ops: StoreOp[];
}

// Live tally of the production KV/D1 ops this session WOULD trigger (projected
// from tool calls — the demo runs on DO SQLite and binds no KV/D1). Honest by
// label: "projected," never "measured." Bytes are deliberately absent (tool-
// payload bytes are not KV blob / D1 row bytes; see /info/data-stores).
export function StoreOpsWidget({ stores }: { stores: InsStore[] }) {
  if (stores.length === 0) return null;
  const all = stores.flatMap((s) => s.ops);
  const kv = all.filter((o) => o.store === "KV");
  const d1 = all.filter((o) => o.store === "D1");
  const byOp = (ops: StoreOp[]) => {
    const m: Record<string, number> = {};
    for (const o of ops) m[o.op] = (m[o.op] ?? 0) + 1;
    return Object.entries(m).map(([op, n]) => `${n} ${op}`).join(" · ");
  };
  return (
    <section className="ins-region ins-store">
      <h3>Data-store ops <span className="ins-proj">projected (production KV/D1)</span></h3>
      <div className="ins-store-rows">
        <div className="ins-store-row">
          <b>KV</b> <span className="ins-store-count">{kv.length}</span>
          <span className="ins-store-detail">{byOp(kv) || "—"}</span>
        </div>
        <div className="ins-store-row">
          <b>D1</b> <span className="ins-store-count">{d1.length}</span>
          <span className="ins-store-detail">{byOp(d1) || "—"}</span>
        </div>
      </div>
      <p className="ins-note">
        Projected from this session's tool calls — the live demo runs on a Durable Object, not KV/D1.{" "}
        <a href="/info/data-stores" target="_blank" rel="noreferrer">why KV vs D1 →</a>
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/StoreOpsWidget.tsx
git commit -m "feat(demo/inspector): StoreOpsWidget (projected KV/D1 ops)"
```

### Task B5: Wire the widget into App + Inspector

**Files:**
- Modify: `web/src/App.tsx:54-58` (state), `:191-197` (reducer), `:279-282` (Inspector props)
- Modify: `web/src/Inspector.tsx:83-92` (props), body (render)

- [ ] **Step 1: Add store state + reducer case in App**

In `web/src/App.tsx`, import the type (near line 7):
```ts
import { StoreOpsWidget, type InsStore } from "./StoreOpsWidget";
```
Add state alongside the other `ins*` states (near line 58):
```ts
  const [insStores, setInsStores] = useState<InsStore[]>([]);
```
In `applyEvent`, inside the `e.type === "inspector"` branch (lines 191–197), add a case:
```ts
      else if (e.kind === "store") setInsStores((s) => [...s, e]);
```
Pass it to `<Inspector ...>` (near line 279), adding the prop:
```tsx
            stores={insStores}
```

- [ ] **Step 2: Accept + render in Inspector**

In `web/src/Inspector.tsx`, import the widget (top of file):
```ts
import { StoreOpsWidget, type InsStore } from "./StoreOpsWidget";
```
Add `stores` to the destructured props and the prop type (lines 83–92):
```ts
  { state, onToggleCollapse, tools, turns, summaries, savings, overhead, headExtra, routing, stats, stores }:
  { state: EngState; onToggleCollapse: () => void; tools: InsTool[]; turns: InsTurn[]; summaries: InsSummary[]; savings: InsSavings[]; overhead: InsOverhead[];
    headExtra?: ReactNode; routing?: ModelRoutingUi; stats?: StatsResponse | null; stores?: InsStore[] },
```
Render the widget in the live body, immediately after the `<section className="ins-region"><h3>Live this session</h3> ... </section>` block (i.e. right after the scoreboard/cost sections, before the "Across all sessions" stats section):
```tsx
      <StoreOpsWidget stores={stores ?? []} />
```

- [ ] **Step 3: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build:web`
Expected: PASS.

- [ ] **Step 4: Manual verify**

Run the demo locally (`npx wrangler dev` per the demo's README), plan a featured trip, open the Engineering tab. Expected: a "Data-store ops — projected (production KV/D1)" section appears once tools fire, with KV and D1 counts that grow as `save_trip`/`patch_trip`/`promote_*` run, and a "why KV vs D1 →" link to `/info/data-stores`.

- [ ] **Step 5: Commit**

```bash
git add web/src/App.tsx web/src/Inspector.tsx
git commit -m "feat(demo/inspector): wire StoreOpsWidget into the engineering tab"
```

---

# Slice A1 — Provider registry + cost + stats compatibility (Claude unchanged)

No new provider executes yet. Claude behavior must stay byte-identical. Keep existing Claude model ids verbatim (R4).

### Task A1.1: Provider-aware model registry

**Files:**
- Modify: `shared/models.ts`
- Test: `shared/models.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `shared/models.test.ts`:
```ts
import { MODEL_REGISTRY, modelEntry, providerOf, OPTIMIZE_PRESETS } from "./models";

describe("model registry", () => {
  it("keeps the three Claude ids verbatim and tags their provider", () => {
    expect(modelEntry("claude-sonnet-4-6")?.provider).toBe("anthropic");
    expect(providerOf("claude-haiku-4-5")).toBe("anthropic");
  });
  it("includes a DeepSeek entry and a grayed Ollama entry", () => {
    expect(modelEntry("deepseek-chat")?.provider).toBe("deepseek");
    const ollama = MODEL_REGISTRY.find((m) => m.provider === "ollama");
    expect(ollama).toBeTruthy();
    expect(ollama!.available).toBe(false);
  });
  it("providerOf falls back to anthropic for unknown ids", () => {
    expect(providerOf("totally-unknown")).toBe("anthropic");
  });
});

describe("OPTIMIZE_PRESETS", () => {
  it("resolves every preset to an enabled model only", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    for (const key of ["speed", "cost", "capability"] as const) {
      const r = OPTIMIZE_PRESETS[key](enabled);
      const ids = r.mode === "single" ? [r.model] : [r.map.discovery, r.map.enrichment];
      for (const id of ids) expect(enabled).toContain(id);
    }
  });
  it("cost preset prefers DeepSeek when enabled", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    const r = OPTIMIZE_PRESETS.cost(enabled);
    expect(r.mode === "single" ? r.model : r.map.enrichment).toBe("deepseek-chat");
  });
});
```
> Note: the existing `enabledModels(false)` call signature is widened in Step 3 to accept a flags object. Update the three existing `enabledModels(false)`/`enabledModels(true)` calls in this test file to `enabledModels({ opus: false })` / `enabledModels({ opus: true })`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/models.test.ts`
Expected: FAIL — `MODEL_REGISTRY`/`modelEntry`/`providerOf`/`OPTIMIZE_PRESETS` undefined; `enabledModels` signature mismatch.

- [ ] **Step 3: Extend `shared/models.ts`**

Add near the top of `shared/models.ts` (after the existing `MODEL_LABELS`):
```ts
export type ProviderId = "anthropic" | "deepseek" | "ollama";

export interface ModelEntry {
  id: string;
  provider: ProviderId;
  label: string;
  available: boolean;            // false ⇒ rendered grayed, never executed
  reason?: string;               // why unavailable (tooltip)
  hints: { speed: 1 | 2 | 3; cost: 1 | 2 | 3; capability: 1 | 2 | 3 }; // 3 = best on that axis
}

// Claude ids stay VERBATIM (persisted in SessRecord.routing + localStorage). New
// providers ADD ids; they never rename the Claude trio (R4).
export const MODEL_REGISTRY: ModelEntry[] = [
  { id: "claude-haiku-4-5",  provider: "anthropic", label: "Haiku",  available: true,  hints: { speed: 3, cost: 3, capability: 1 } },
  { id: "claude-sonnet-4-6", provider: "anthropic", label: "Sonnet", available: true,  hints: { speed: 2, cost: 2, capability: 2 } },
  { id: "claude-opus-4-8",   provider: "anthropic", label: "Opus",   available: true,  hints: { speed: 1, cost: 1, capability: 3 } },
  { id: "deepseek-chat",     provider: "deepseek",  label: "DeepSeek V4", available: true, hints: { speed: 3, cost: 3, capability: 2 } },
  { id: "llama3.1:8b",       provider: "ollama",    label: "Llama 3.1 8B (local)", available: false,
    reason: "Runs on your machine — unreachable from this edge Worker.", hints: { speed: 2, cost: 3, capability: 1 } },
];

export function modelEntry(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}
export function providerOf(id: string): ProviderId {
  return modelEntry(id)?.provider ?? "anthropic";
}
```
Replace the existing `enabledModels` function with the flags-object form (keeps Opus gate, adds DeepSeek + Ollama gates):
```ts
export interface EnabledFlags { opus?: boolean; deepseek?: boolean; ollama?: boolean }

/** The model ids the demo will accept/offer, given per-provider gates. */
export function enabledModels(flags: EnabledFlags | boolean): ModelId[] {
  // Back-compat: a bare boolean is the old opus flag.
  const f: EnabledFlags = typeof flags === "boolean" ? { opus: flags } : flags;
  return MODEL_REGISTRY.filter((m) => {
    if (m.provider === "anthropic") return m.id === "claude-opus-4-8" ? !!f.opus : true;
    if (m.provider === "deepseek") return !!f.deepseek;
    if (m.provider === "ollama") return !!f.ollama; // never set from the edge Worker
    return false;
  }).map((m) => m.id as ModelId);
}
```
Widen the `ModelId` type so non-Claude ids are legal:
```ts
export type ModelId = string;  // was the Claude union; now any registry id (coerceModel still gates execution)
```
Add the optimize presets at the end of the file:
```ts
function cheapest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.cost ?? 0) - (modelEntry(a)?.hints.cost ?? 0))[0];
}
function fastest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.speed ?? 0) - (modelEntry(a)?.hints.speed ?? 0))[0];
}
function strongest(enabled: ModelId[]): ModelId {
  return [...enabled].sort((a, b) => (modelEntry(b)?.hints.capability ?? 0) - (modelEntry(a)?.hints.capability ?? 0))[0];
}

export type OptimizeKey = "speed" | "cost" | "capability";
export const OPTIMIZE_PRESETS: Record<OptimizeKey, (enabled: ModelId[]) => ModelRouting> = {
  speed: (enabled) => ({ mode: "single", model: fastest(enabled), map: { ...DEFAULT_SMART_MAP } }),
  cost: (enabled) => ({ mode: "single", model: cheapest(enabled), map: { ...DEFAULT_SMART_MAP } }),
  capability: (enabled) => ({
    mode: "smart", model: strongest(enabled),
    map: { discovery: strongest(enabled), enrichment: cheapest(enabled) },
  }),
};
```

- [ ] **Step 4: Update the existing `enabledModels(false)` call sites**

Update `shared/models.test.ts` existing calls (lines 5–8, 12, 24, 45, 50) from `enabledModels(false)`/`enabledModels(true)` to `enabledModels({ opus: false })`/`enabledModels({ opus: true })`.
Update `worker/session-do.ts:272` from `enabledModels(!!this.env.DEMO_OPUS_ENABLED)` to:
```ts
    const enabled = enabledModels({ opus: !!this.env.DEMO_OPUS_ENABLED, deepseek: deepseekEnabled(this.env) });
```
(`deepseekEnabled` is defined in Task A2.3; for A1, temporarily use `{ opus: !!this.env.DEMO_OPUS_ENABLED }` and add the deepseek flag in A2.3.)
Update `worker/index.ts:44` from `enabledModels(!!env.DEMO_OPUS_ENABLED)` to `enabledModels({ opus: !!env.DEMO_OPUS_ENABLED })` (DeepSeek flag added in A2.5).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run shared/models.test.ts && npx tsc --noEmit`
Expected: PASS (existing + new tests; types clean).

- [ ] **Step 6: Commit**

```bash
git add shared/models.ts shared/models.test.ts worker/session-do.ts worker/index.ts
git commit -m "feat(demo): provider-aware model registry + optimize presets (Claude unchanged)"
```

### Task A1.2: DeepSeek pricing + provider-aware caching

**Files:**
- Modify: `worker/llm/cost.ts:5-9` (`PRICING`)
- Test: `worker/llm/cost.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `worker/llm/cost.test.ts`:
```ts
import { estimateCostUsd } from "./cost";

describe("DeepSeek pricing", () => {
  it("prices deepseek-chat with a cache-read discount and no write premium", () => {
    // DeepSeek does automatic prefix caching: cacheCreationTokens is always 0 for it.
    const c = estimateCostUsd("deepseek-chat", {
      inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    });
    expect(c).toBeGreaterThan(0);
    // A 1M cache-read costs strictly less than 1M fresh input.
    const fresh = estimateCostUsd("deepseek-chat", { inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 });
    const cached = estimateCostUsd("deepseek-chat", { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 1_000_000 });
    expect(cached).toBeLessThan(fresh);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/llm/cost.test.ts`
Expected: FAIL — `deepseek-chat` falls back to Sonnet rates (no cache-read discount asserted may still pass by luck; if so, the failure is the assertion that cached<fresh under Sonnet rates still holds — keep the test, it pins DeepSeek rates explicitly once added).

- [ ] **Step 3: Add DeepSeek rates**

In `worker/llm/cost.ts`, add to the `PRICING` map (per-million USD; DeepSeek published rates — verify current numbers against api-docs.deepseek.com at implementation time and update the comment):
```ts
  // DeepSeek V4 (deepseek-chat) — automatic prefix caching: there is no cache-WRITE
  // concept, so cacheWrite is set equal to `in` (it should never be exercised; the
  // DeepSeekProvider always emits cacheCreationTokens=0). cacheRead = cache-hit rate.
  "deepseek-chat": { in: 0.27, out: 1.10, cacheWrite: 0.27, cacheRead: 0.027 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/llm/cost.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/llm/cost.ts worker/llm/cost.test.ts
git commit -m "feat(demo): DeepSeek pricing (automatic-prefix-cache semantics)"
```

### Task A1.3: `/stats` honesty — derive an "other" (non-Claude) bucket without a D1 migration

**Files:**
- Modify: `shared/events.ts:77-85` (`StatsResponse`)
- Modify: `worker/stats.ts:113-124` (`shapeStats`)
- Test: `worker/stats.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `worker/stats.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shapeStats } from "./stats";

describe("shapeStats other-bucket", () => {
  it("derives byModel.other from total minus the Claude trio", () => {
    const s = shapeStats({
      sessions: 1, exchanges: 1, trips: 1,
      totalActualCostUsd: 1.00, totalSavedTokens: 0, totalTokens: 0,
      actualHaiku: 0.20, actualSonnet: 0.30, actualOpus: 0.00,
    });
    expect(s.byModel.other).toBeCloseTo(0.50, 6); // 1.00 - 0.20 - 0.30 - 0.00
  });
  it("never goes negative when rounding makes the trio exceed the total", () => {
    const s = shapeStats({ totalActualCostUsd: 0.40, actualHaiku: 0.25, actualSonnet: 0.20, actualOpus: 0 });
    expect(s.byModel.other).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/stats.test.ts`
Expected: FAIL — `byModel.other` does not exist.

- [ ] **Step 3: Widen the public shape + derive `other`**

In `shared/events.ts`, change `StatsResponse.byModel` (line ~84) to:
```ts
  byModel: { haiku: number; sonnet: number; opus: number; other: number };  // 'other' = non-Claude routed spend
```
In `worker/stats.ts`, update `shapeStats` (lines 113–124) so the return's `byModel` includes `other`:
```ts
  const haiku = n(row?.actualHaiku), sonnet = n(row?.actualSonnet), opus = n(row?.actualOpus);
  const total = n(row?.totalActualCostUsd);
  return {
    sessions: n(row?.sessions),
    exchanges: n(row?.exchanges),
    trips: n(row?.trips),
    totalActualCostUsd: total,
    totalSavedTokens: n(row?.totalSavedTokens),
    totalTokens: n(row?.totalTokens),
    byModel: { haiku, sonnet, opus, other: Math.max(0, total - haiku - sonnet - opus) },
  };
```
> This needs NO D1 schema change: `actualCostUsd` already sums ALL routed spend (incl. DeepSeek); the Claude trio columns capture only Claude; `other` is the remainder.

- [ ] **Step 4: Fix the two web consumers of `byModel`**

`web/src/App.tsx:72` sets a default `enabledModels` state — unaffected. The `byModel` type widened, so update any Inspector "Across all sessions" render that destructures `byModel` (search `Inspector.tsx` for `byModel`) to also show `other` when `> 0`:
```tsx
{stats.byModel.other > 0 && <span> · {usd(stats.byModel.other)} other</span>}
```
(If `Inspector.tsx` does not yet render `byModel`, skip — the type change alone compiles.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run worker/stats.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/events.ts worker/stats.ts worker/stats.test.ts web/src/Inspector.tsx
git commit -m "feat(demo/stats): derive non-Claude 'other' cost bucket (no D1 migration)"
```

---

# Slice A2 — DeepSeek provider (dark, gated, tested)

The provider is fully built and unit-tested but never executes until A4 flips `DEMO_DEEPSEEK_ENABLED`. R1 (usage opt-in) and the R7 correctness checklist live here.

### Task A2.1: `parseOpenAiStream` + message/tool translators

**Files:**
- Create: `worker/llm/deepseek.ts`
- Test: `worker/llm/deepseek.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/llm/deepseek.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseOpenAiStream, toOpenAiMessages, toOpenAiTools } from "./deepseek";
import type { ProviderEvent } from "./provider";

function sse(frames: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close(); } });
}

describe("parseOpenAiStream", () => {
  it("assembles text + a tool call across chunks and reports usage", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "flight_search", arguments: '{"trip' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '_id":"t1"}' } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 } })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    const evs: ProviderEvent[] = [];
    for await (const e of parseOpenAiStream(sse(frames))) evs.push(e);
    expect(evs.find((e) => e.type === "text-delta")).toEqual({ type: "text-delta", delta: "Hi" });
    const call = evs.find((e) => e.type === "tool-call") as any;
    expect(call.name).toBe("flight_search");
    expect(call.input).toEqual({ trip_id: "t1" });
    const usage = evs.find((e) => e.type === "usage") as any;
    expect(usage.usage.cacheReadTokens).toBe(80);
    expect(usage.usage.inputTokens).toBe(20);   // miss tokens = fresh input
    expect(usage.usage.cacheCreationTokens).toBe(0);  // DeepSeek has no write concept
    expect(evs[evs.length - 1].type).toBe("turn-complete");
  });

  it("throws on invalid final tool-call JSON (never silently {})", async () => {
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "x", arguments: "{bad" } }] } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      `data: [DONE]\n\n`,
    ];
    await expect(async () => { for await (const _ of parseOpenAiStream(sse(frames))) { /* drain */ } })
      .rejects.toThrow();
  });
});

describe("toOpenAiMessages", () => {
  it("turns an assistant tool_use + a user tool_result bundle into OpenAI shape, nudge text as a trailing user message", () => {
    const out = toOpenAiMessages([
      { role: "user", content: "plan it" },
      { role: "assistant", content: [{ type: "tool_use", id: "tu1", name: "flight_search", input: { a: 1 } }] },
      { role: "user", content: [
        { type: "tool_result", tool_use_id: "tu1", content: "RESULT" },
        { type: "text", text: "[host reminder] do X" },
      ] },
    ]);
    expect(out[0]).toEqual({ role: "user", content: "plan it" });
    expect(out[1]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "tu1", type: "function", function: { name: "flight_search", arguments: JSON.stringify({ a: 1 }) } }] });
    expect(out[2]).toEqual({ role: "tool", tool_call_id: "tu1", content: "RESULT" });
    expect(out[3]).toEqual({ role: "user", content: "[host reminder] do X" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/llm/deepseek.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `worker/llm/deepseek.ts`**

```ts
import type {
  LLMProvider, ProviderEvent, ConversationMessage, ToolSchema, AssistantMessage, TokenUsage,
} from "./provider";

// --- Anthropic-shaped transcript -> OpenAI chat messages ---------------------
// Our canonical conversation uses Anthropic block shapes (tool_use / tool_result
// + a trailing {type:"text"} host-nudge note). OpenAI needs: assistant messages
// carrying tool_calls[], separate role:"tool" results, and any nudge as a LATER
// role:"user" message (R7). One Anthropic user tool_result bundle can fan out to
// several OpenAI messages.
interface OpenAiMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export function toOpenAiMessages(messages: ConversationMessage[]): OpenAiMsg[] {
  const out: OpenAiMsg[] = [];
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("");
      const calls = m.content.filter((b) => b.type === "tool_use").map((b) => {
        const tu = b as Extract<AssistantMessage["content"][number], { type: "tool_use" }>;
        return { id: tu.id, type: "function" as const, function: { name: tu.name, arguments: JSON.stringify(tu.input) } };
      });
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      // user tool_result bundle: each tool_result -> role:"tool"; trailing text -> role:"user"
      for (const b of m.content) {
        if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
        else if (b.type === "text") out.push({ role: "user", content: b.text });
      }
    }
  }
  return out;
}

export function toOpenAiTools(tools: ToolSchema[]): unknown[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

// --- OpenAI SSE stream -> ProviderEvent --------------------------------------
export async function* parseOpenAiStream(body: ReadableStream<Uint8Array>): AsyncIterable<ProviderEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const calls: Record<number, { id: string; name: string; args: string }> = {};
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 };
  let sawUsage = false;
  const assistant: AssistantMessage = { role: "assistant", content: [] };
  let textBuf = "";

  const finalize = function* (): Iterable<ProviderEvent> {
    if (textBuf) assistant.content.push({ type: "text", text: textBuf });
    for (const idx of Object.keys(calls).map(Number).sort((a, b) => a - b)) {
      const c = calls[idx];
      let input: Record<string, unknown>;
      try { input = c.args ? JSON.parse(c.args) : {}; }
      catch { throw new Error(`DeepSeek tool_call '${c.name}' returned invalid JSON arguments: ${c.args}`); }
      assistant.content.push({ type: "tool_use", id: c.id, name: c.name, input });
      // tool-call events are emitted at finalize (after finish_reason:"tool_calls"), never partial.
    }
  };

  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      const ev = JSON.parse(payload);
      if (ev.usage) {
        usage.inputTokens = ev.usage.prompt_cache_miss_tokens ?? ev.usage.prompt_tokens ?? 0;
        usage.cacheReadTokens = ev.usage.prompt_cache_hit_tokens ?? 0;
        usage.cacheCreationTokens = 0;  // DeepSeek: no cache-write concept (R2)
        usage.outputTokens = ev.usage.completion_tokens ?? 0;
        sawUsage = true;
      }
      const choice = ev.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string" && delta.content) { textBuf += delta.content; yield { type: "text-delta", delta: delta.content }; }
      // delta.reasoning_content is intentionally ignored (not streamed into chat).
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const i = tc.index ?? 0;
          const cur = calls[i] ?? (calls[i] = { id: "", name: "", args: "" });
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
        }
      }
      if (choice.finish_reason && !finished) {
        finished = true;
        for (const e of finalize()) yield e;
        for (const b of assistant.content) if (b.type === "tool_use") yield { type: "tool-call", id: b.id, name: b.name, input: b.input };
      }
    }
  }
  if (!finished) { for (const e of finalize()) yield e; for (const b of assistant.content) if (b.type === "tool_use") yield { type: "tool-call", id: b.id, name: b.name, input: b.input }; }
  if (sawUsage) yield { type: "usage", usage };
  yield { type: "turn-complete", assistant };
}

export class DeepSeekProvider implements LLMProvider {
  constructor(private apiKey: string, private baseUrl = "https://api.deepseek.com", private model = "deepseek-chat") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);  // R8: every provider fetch has a timeout
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "authorization": `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: opts?.model ?? this.model,
          stream: true,
          stream_options: { include_usage: true },   // R1: without this DeepSeek streams NO usage → $0 ledger
          max_tokens: 4096,
          n: 1,
          tools: toOpenAiTools(tools),
          messages: toOpenAiMessages(messages),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`);
      let any = false;
      for await (const ev of parseOpenAiStream(res.body)) {
        if (ev.type === "usage") any = true;
        yield ev;
      }
      // R1: a paid provider that returns no usage is an error, never a silent $0.
      if (!any) throw new Error("DeepSeek returned no usage block (stream_options.include_usage missing or upstream omitted it)");
    } finally { clearTimeout(timeout); }
  }
}
```
> The `if (!any) throw` after the loop guards the budget ledger. Because `stream()` is a generator, the throw surfaces to the agent loop's try/catch and the exchange records an error rather than silent free spend.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run worker/llm/deepseek.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/llm/deepseek.ts worker/llm/deepseek.test.ts
git commit -m "feat(demo): DeepSeekProvider — OpenAI-compat stream, usage opt-in, R7 correctness"
```

### Task A2.2: Minimal local-dev Ollama provider

**Files:**
- Create: `worker/llm/ollama.ts`

- [ ] **Step 1: Implement (reuse the OpenAI stream parser)**

Create `worker/llm/ollama.ts`:
```ts
import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema } from "./provider";
import { parseOpenAiStream, toOpenAiMessages, toOpenAiTools } from "./deepseek";

// Minimal, LOCAL-DEV-ONLY provider. Never reachable from the deployed edge Worker
// (a Worker can't hit your localhost) — its registry entry is available:false, so
// coerceModel never lets it execute in prod. Present so the cross-LLM seam is
// provably N-way (see /info/llm-options). Ollama's /v1/chat/completions endpoint
// is OpenAI-compatible, so it reuses the DeepSeek stream parser/translators.
export class OllamaProvider implements LLMProvider {
  constructor(private baseUrl: string, private model = "llama3.1:8b") {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts?.model ?? this.model, stream: true, stream_options: { include_usage: true },
          n: 1, tools: toOpenAiTools(tools), messages: toOpenAiMessages(messages),
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
      yield* parseOpenAiStream(res.body);  // local: missing-usage is tolerated (no paid ledger)
    } finally { clearTimeout(timeout); }
  }
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add worker/llm/ollama.ts
git commit -m "feat(demo): minimal local-dev OllamaProvider (grayed in prod)"
```

### Task A2.3: Env additions + the provider factory + gates

**Files:**
- Create: `worker/llm/index.ts`
- Modify: `worker/session-do.ts:18-28` (`Env`)

- [ ] **Step 1: Extend the DO `Env`**

In `worker/session-do.ts`, add to the `Env` interface (after `STATS_DB`):
```ts
  DEEPSEEK_API_KEY?: string;              // when set + DEMO_DEEPSEEK_ENABLED, DeepSeek is live
  DEEPSEEK_BASE_URL?: string;             // default https://api.deepseek.com (host-allowlisted)
  DEMO_DEEPSEEK_ENABLED?: string;         // dual gate with the key
  OLLAMA_BASE_URL?: string;               // local-dev only; never set in the deployed Worker
  DEMO_OLLAMA_URL?: string;               // alias gate for local Ollama (host-allowlisted)
```

- [ ] **Step 2: Implement the factory with gates + SSRF allowlist**

Create `worker/llm/index.ts`:
```ts
import type { LLMProvider } from "./provider";
import { ClaudeProvider } from "./claude";
import { DeepSeekProvider } from "./deepseek";
import { OllamaProvider } from "./ollama";
import { providerOf } from "../../shared/models";

export interface ProviderEnv {
  ANTHROPIC_API_KEY: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEMO_DEEPSEEK_ENABLED?: string;
  OLLAMA_BASE_URL?: string;
  DEMO_OLLAMA_URL?: string;
}

/** DeepSeek is live only when BOTH the key and the flag are present (R8). */
export function deepseekEnabled(env: ProviderEnv): boolean {
  return !!env.DEEPSEEK_API_KEY && !!env.DEMO_DEEPSEEK_ENABLED;
}
export function ollamaEnabled(env: ProviderEnv): boolean {
  return !!(env.OLLAMA_BASE_URL || env.DEMO_OLLAMA_URL);
}

// R8: never let a configurable base URL become a Worker-side fetch proxy. Allow
// only https (or http for localhost dev) and a known host suffix.
function safeBaseUrl(raw: string | undefined, fallback: string, allowHosts: string[]): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    const okScheme = u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    const okHost = allowHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) || u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (okScheme && okHost) return u.origin;
  } catch { /* fall through */ }
  return fallback;
}

/** Build the concrete provider for a model id. Falls back to Claude. */
export function providerFor(modelId: string, env: ProviderEnv): LLMProvider {
  const provider = providerOf(modelId);
  if (provider === "deepseek" && deepseekEnabled(env)) {
    const base = safeBaseUrl(env.DEEPSEEK_BASE_URL, "https://api.deepseek.com", ["deepseek.com"]);
    return new DeepSeekProvider(env.DEEPSEEK_API_KEY!, base, modelId);
  }
  if (provider === "ollama" && ollamaEnabled(env)) {
    const base = safeBaseUrl(env.OLLAMA_BASE_URL || env.DEMO_OLLAMA_URL, "http://localhost:11434", ["localhost"]);
    return new OllamaProvider(base, modelId);
  }
  return new ClaudeProvider(env.ANTHROPIC_API_KEY, modelId);
}
```

- [ ] **Step 3: Wire the deepseek flag into `enabledModels` at session-do:272**

Update `worker/session-do.ts:272` (placeholder from A1.1) to its final form:
```ts
    const enabled = enabledModels({ opus: !!this.env.DEMO_OPUS_ENABLED, deepseek: deepseekEnabled(this.env), ollama: ollamaEnabled(this.env) });
```
Add `import { providerFor, deepseekEnabled, ollamaEnabled } from "./llm/index";` to the session-do imports.

- [ ] **Step 4: Verify typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (DeepSeek still never constructed — `DEMO_DEEPSEEK_ENABLED` unset in dev).

- [ ] **Step 5: Commit**

```bash
git add worker/llm/index.ts worker/session-do.ts
git commit -m "feat(demo): providerFor factory + dual DeepSeek gate + base-URL allowlist"
```

### Task A2.4: Document the new secrets

**Files:**
- Modify: `wrangler.toml:27-31` (secrets comment)

- [ ] **Step 1: Extend the secrets note**

In `wrangler.toml`, update the secrets comment block to add:
```
#   DEEPSEEK_API_KEY (+ DEMO_DEEPSEEK_ENABLED=1 to go live), optional DEEPSEEK_BASE_URL.
#   OLLAMA_BASE_URL / DEMO_OLLAMA_URL are local-dev only (a deployed Worker can't reach localhost).
```

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "docs(demo): document DeepSeek/Ollama secrets"
```

### Task A2.5: `/presets` advertises the enabled (gated) model set

**Files:**
- Modify: `worker/index.ts:6` (top-level `Env`), `:39-47` (`/presets`)

- [ ] **Step 1: Extend the worker Env + presets gate**

In `worker/index.ts`, extend the `Env` interface (line 6) to add `DEEPSEEK_API_KEY?: string; DEMO_DEEPSEEK_ENABLED?: string;`. Import the gate:
```ts
import { deepseekEnabled } from "./llm/index";
```
Update the `/presets` response (line 44) so `enabledModels` reflects the DeepSeek gate:
```ts
        { ...buildPresets(req), enabledModels: enabledModels({ opus: !!env.DEMO_OPUS_ENABLED, deepseek: deepseekEnabled(env as any) }), smartMap: DEFAULT_SMART_MAP },
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add worker/index.ts
git commit -m "feat(demo): /presets advertises DeepSeek only when gated on"
```

---

# Slice A3 — Per-turn provider routing cutover

The agent loop already resolves a per-turn `nextModel()`. The only change is making the single `provider` it receives dispatch on `opts.model`. A `DispatchProvider` does this with zero loop change.

### Task A3.1: `DispatchProvider`

**Files:**
- Create: `worker/llm/dispatch.ts`
- Test: `worker/llm/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/llm/dispatch.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DispatchProvider } from "./dispatch";
import type { LLMProvider, ProviderEvent } from "./provider";

function fake(tag: string): LLMProvider {
  return { async *stream() { yield { type: "text-delta", delta: tag } as ProviderEvent; yield { type: "turn-complete", assistant: { role: "assistant", content: [] } } as ProviderEvent; } };
}

describe("DispatchProvider", () => {
  it("routes per call by the opts.model's provider", async () => {
    const seen: string[] = [];
    const d = new DispatchProvider((id) => { seen.push(id); return id.startsWith("deepseek") ? fake("DS") : fake("CL"); }, "claude-sonnet-4-6");
    const out1: string[] = [];
    for await (const e of d.stream([], [], { model: "deepseek-chat" })) if (e.type === "text-delta") out1.push(e.delta);
    const out2: string[] = [];
    for await (const e of d.stream([], [], { model: "claude-haiku-4-5" })) if (e.type === "text-delta") out2.push(e.delta);
    expect(out1).toEqual(["DS"]);
    expect(out2).toEqual(["CL"]);
    expect(seen).toEqual(["deepseek-chat", "claude-haiku-4-5"]);
  });
  it("uses the default model id when opts.model is absent", async () => {
    const seen: string[] = [];
    const d = new DispatchProvider((id) => { seen.push(id); return fake("X"); }, "claude-sonnet-4-6");
    for await (const _ of d.stream([], [])) { /* drain */ }
    expect(seen).toEqual(["claude-sonnet-4-6"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run worker/llm/dispatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `worker/llm/dispatch.ts`:
```ts
import type { LLMProvider, ProviderEvent, ConversationMessage, ToolSchema } from "./provider";

// One LLMProvider that picks a concrete provider PER CALL from opts.model. The
// agent loop already resolves a per-turn model (loop.ts nextModel) and passes it
// as opts.model; this makes per-turn provider selection require NO loop change.
// `resolve` is injected (the worker passes providerFor bound to env) so this stays
// env-free and unit-testable.
export class DispatchProvider implements LLMProvider {
  constructor(private resolve: (modelId: string) => LLMProvider, private defaultModel: string) {}
  async *stream(messages: ConversationMessage[], tools: ToolSchema[], opts?: { model?: string }): AsyncIterable<ProviderEvent> {
    const modelId = opts?.model || this.defaultModel;
    const concrete = this.resolve(modelId);
    // Always pass the resolved model downstream so the concrete provider sends the right id.
    yield* concrete.stream(messages, tools, { model: modelId });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run worker/llm/dispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/llm/dispatch.ts worker/llm/dispatch.test.ts
git commit -m "feat(demo): DispatchProvider — per-turn provider routing on opts.model"
```

### Task A3.2: Swap the DO's single provider for the dispatcher

**Files:**
- Modify: `worker/session-do.ts:275`

- [ ] **Step 1: Replace the provider construction**

In `worker/session-do.ts`, replace line 275:
```ts
    const provider = new ClaudeProvider(this.env.ANTHROPIC_API_KEY, model);
```
with:
```ts
    const provider = new DispatchProvider((id) => providerFor(id, this.env), model);
```
Add `import { DispatchProvider } from "./llm/dispatch";` to the imports. The `ClaudeProvider` import (line 10) may now be unused in session-do — remove it if `npx tsc --noEmit` flags it (it's still used inside `providerFor`).

- [ ] **Step 2: Verify typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. With DeepSeek gated off, `providerFor` returns `ClaudeProvider` for every id, so behavior is byte-identical to before.

- [ ] **Step 3: Manual verify (Claude still works end-to-end)**

Run the demo locally, plan a featured trip with smart routing. Expected: identical behavior to pre-cutover (Sonnet discovery, Haiku enrichment), cost panel unchanged.

- [ ] **Step 4: Commit**

```bash
git add worker/session-do.ts
git commit -m "feat(demo): route turns through DispatchProvider (Claude path unchanged)"
```

---

# Slice A4 — Tweaks panel UI + optimize presets + grayed Ollama

The compact `ModelSwitch` stays; a "Tweaks" affordance opens the fuller panel. After this lands and DeepSeek is verified, flip `DEMO_DEEPSEEK_ENABLED=1`.

### Task A4.1: Browser-side provider/preset resolution

**Files:**
- Modify: `web/src/lib/model.ts`
- Test: `web/src/lib/model.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/model.test.ts`:
```ts
import { applyOptimize, modelsByProvider } from "./model";
import { enabledModels } from "../../../shared/models";

describe("applyOptimize", () => {
  it("returns a routing whose models are all enabled", () => {
    const enabled = enabledModels({ opus: false, deepseek: true });
    const r = applyOptimize("cost", enabled);
    const ids = r.mode === "single" ? [r.model] : Object.values(r.map);
    for (const id of ids) expect(enabled).toContain(id);
  });
});

describe("modelsByProvider", () => {
  it("groups enabled + grayed models by provider with Ollama present but unavailable", () => {
    const groups = modelsByProvider(enabledModels({ opus: false, deepseek: true }));
    const ollama = groups.find((g) => g.provider === "ollama");
    expect(ollama).toBeTruthy();
    expect(ollama!.models.every((m) => !m.available)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/lib/model.test.ts`
Expected: FAIL — `applyOptimize`/`modelsByProvider` undefined.

- [ ] **Step 3: Implement**

Append to `web/src/lib/model.ts`:
```ts
import { OPTIMIZE_PRESETS, MODEL_REGISTRY, type OptimizeKey, type ModelEntry, type ProviderId } from "../../../shared/models";
export type { OptimizeKey };

export function applyOptimize(key: OptimizeKey, enabled: ModelId[]): ModelRouting {
  return OPTIMIZE_PRESETS[key](enabled);
}

export interface ProviderGroup { provider: ProviderId; label: string; models: (ModelEntry & { enabledNow: boolean })[] }
const PROVIDER_LABELS: Record<ProviderId, string> = { anthropic: "Anthropic (Claude)", deepseek: "DeepSeek", ollama: "Local (Ollama)" };

/** All registry models grouped by provider, each flagged whether it's executable now. */
export function modelsByProvider(enabled: ModelId[]): ProviderGroup[] {
  const order: ProviderId[] = ["anthropic", "deepseek", "ollama"];
  return order.map((provider) => ({
    provider, label: PROVIDER_LABELS[provider],
    models: MODEL_REGISTRY.filter((m) => m.provider === provider)
      .map((m) => ({ ...m, enabledNow: (enabled as string[]).includes(m.id) })),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/lib/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/model.ts web/src/lib/model.test.ts
git commit -m "feat(demo): browser optimize-preset + provider-grouping helpers"
```

### Task A4.2: The `TweaksPanel` component

**Files:**
- Create: `web/src/TweaksPanel.tsx`

- [ ] **Step 1: Implement**

Create `web/src/TweaksPanel.tsx`:
```tsx
import { modelsByProvider, applyOptimize, type OptimizeKey } from "./lib/model";
import type { SelectorMode } from "./lib/model";
import type { ModelId, ModelRouting } from "../../shared/models";

// The fuller "Tweaks" surface: optimize-for presets + per-provider model groups
// (Local/Ollama shown grayed, never selectable). Compact ModelSwitch stays the
// quick switch; this is the expanded control. Stateless — App owns selection.
export function TweaksPanel(
  { open, onClose, enabled, mode, onMode, onRouting }:
  { open: boolean; onClose: () => void; enabled: ModelId[];
    mode: SelectorMode; onMode: (m: SelectorMode) => void;
    onRouting: (r: ModelRouting) => void },
) {
  if (!open) return null;
  const groups = modelsByProvider(enabled);
  const presets: { key: OptimizeKey; label: string; hint: string }[] = [
    { key: "speed", label: "Speed", hint: "fastest small model" },
    { key: "cost", label: "Cost", hint: "cheapest provider" },
    { key: "capability", label: "Capability", hint: "strongest on reasoning" },
  ];
  return (
    <div className="tweaks-panel" role="dialog" aria-label="Model tweaks">
      <div className="tweaks-head">
        <strong>Tweaks</strong>
        <button className="tweaks-close" onClick={onClose} aria-label="Close tweaks">✕</button>
      </div>

      <section className="tweaks-optimize">
        <span className="lab">optimize for</span>
        <div className="seg">
          {presets.map((p) => (
            <button key={p.key} type="button" title={p.hint}
              onClick={() => { const r = applyOptimize(p.key, enabled); onRouting(r); onMode(r.mode === "single" ? (r.model as SelectorMode) : "smart"); }}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tweaks-providers">
        {groups.map((g) => (
          <div key={g.provider} className={`tweaks-group ${g.models.some((m) => m.enabledNow) ? "" : "is-disabled"}`}>
            <div className="tweaks-group-head">{g.label}</div>
            <div className="seg">
              {g.models.map((m) => (
                <button key={m.id} type="button"
                  disabled={!m.enabledNow}
                  aria-pressed={mode === m.id}
                  title={m.enabledNow ? `Drive the session with ${m.label}` : (m.reason ?? "Unavailable")}
                  onClick={() => m.enabledNow && onMode(m.id as SelectorMode)}>
                  {m.label}{!m.enabledNow ? " ·" : ""}
                </button>
              ))}
            </div>
            {g.provider === "ollama" && (
              <p className="tweaks-note">Local models can't run from this edge Worker.{" "}
                <a href="/info/llm-options" target="_blank" rel="noreferrer">why →</a></p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styles**

In `web/src/styles.css` (or `skin-claude.css` — match where `.model-switch` is styled), add a grayed-group rule so the disabled provider reads as intentionally off:
```css
.tweaks-group.is-disabled { opacity: .5; }
.tweaks-group.is-disabled button[disabled] { cursor: not-allowed; }
.tweaks-note { font: 500 .75rem/1.5 ui-monospace, monospace; color: var(--muted); margin: 4px 0 0; }
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build:web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/TweaksPanel.tsx web/src/styles.css
git commit -m "feat(demo): TweaksPanel — optimize presets + provider groups + grayed Ollama"
```

### Task A4.3: Mount the Tweaks affordance

**Files:**
- Modify: `web/src/ModelSwitch.tsx` (add a ⚙ button)
- Modify: `web/src/App.tsx` (panel state + onRouting → smartMap/mode)

- [ ] **Step 1: Add a Tweaks button to ModelSwitch**

In `web/src/ModelSwitch.tsx`, extend the props with an optional `onTweaks?: () => void` and render a trailing button inside the `.model-switch` group:
```tsx
      {onTweaks && (
        <button type="button" className="model-tweaks" title="More model options" onClick={onTweaks} aria-label="Open model tweaks">⚙</button>
      )}
```
Update the signature:
```tsx
  { mode, enabled, onPick, onTweaks }:
  { mode: SelectorMode; enabled: ModelId[]; onPick: (m: SelectorMode) => void; onTweaks?: () => void },
```

- [ ] **Step 2: Wire panel state in App**

In `web/src/App.tsx`, import the panel + a routing applier (near line 13):
```ts
import { TweaksPanel } from "./TweaksPanel";
import type { ModelRouting } from "../../shared/models";
```
Add state (near line 75):
```ts
  const [tweaksOpen, setTweaksOpen] = useState(false);
```
Add a handler that maps a chosen `ModelRouting` onto the existing `modelMode` + `smartMap` state:
```ts
  function applyRouting(r: ModelRouting) {
    setSmartMap(r.map);
    setModelMode(r.mode === "single" ? (r.model as SelectorMode) : "smart");
  }
```
Pass `onTweaks={() => setTweaksOpen(true)}` to BOTH `<ModelSwitch .../>` usages (lines 248 and inside `headExtra` at 281). Render the panel once, near the end of the returned tree (before the closing `</div>` of `.app`, ~line 289):
```tsx
      <TweaksPanel
        open={tweaksOpen} onClose={() => setTweaksOpen(false)}
        enabled={enabledModels} mode={modelMode} onMode={setModelMode} onRouting={applyRouting}
      />
```

- [ ] **Step 3: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run build:web`
Expected: PASS.

- [ ] **Step 4: Manual verify**

Run the demo locally. Open the Engineering tab → click ⚙ beside the model switch. Expected: the Tweaks panel opens with Speed/Cost/Capability presets and three provider groups; the **Local (Ollama)** group is grayed and unclickable with a "why →" link; picking an optimize preset updates the active model/smart-map (visible in the smart-map editor + cost panel). DeepSeek appears as a real option only if `DEMO_DEEPSEEK_ENABLED` + key are set.

- [ ] **Step 5: Commit**

```bash
git add web/src/ModelSwitch.tsx web/src/App.tsx
git commit -m "feat(demo): mount Tweaks panel from the model switch"
```

### Task A4.4: Live DeepSeek smoke (gated flip)

**Files:** none (ops verification)

- [ ] **Step 1: Set the secrets (staging/local first)**

```bash
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put DEMO_DEEPSEEK_ENABLED   # value: 1
```

- [ ] **Step 2: Smoke a DeepSeek-routed exchange**

Plan a featured trip with the Tweaks "Cost" preset (routes to `deepseek-chat`). Verify in `wrangler tail`:
- The `[cost]` log line shows a non-zero `usd=` (R1 — usage arrived; ledger charged).
- The Inspector cost panel shows actual spend attributed to `deepseek-chat`, and "Across all sessions" shows the `other` bucket once the stats row lands.
- The folio renders only tool-sourced data (no fabrication) even on the weaker model.

Expected: all three hold. If `usd=0.0000` appears, `stream_options.include_usage` or the `!any` guard regressed — STOP and fix before deploying.

- [ ] **Step 3: Commit (none) / record outcome**

Record the smoke result in the session handoff. Flip `DEMO_DEEPSEEK_ENABLED` on prod only after staging smoke passes.

---

## Self-Review

**Spec coverage:**
- Workstream 1 (cross-LLM): A1 (registry/cost/stats), A2 (DeepSeek provider, gates, factory, presets advert), A3 (dispatch cutover), A4 (Tweaks UI, Ollama, live flip) ✓
- Workstream 2 (store widget): B1–B5 ✓
- Workstream 3 (deep dives): C1–C2 ✓
- R1 usage opt-in → A2.1 (`stream_options.include_usage` + `!any` throw) ✓
- R2 caching split → A2.1 (`cacheCreationTokens=0`) + A1.2 (DeepSeek rates comment) ✓
- R3 stats honesty → A1.3 (`byModel.other`, no migration) ✓
- R4 keep Claude ids → A1.1 (registry verbatim) ✓
- R5 provider cutover → A3 (DispatchProvider) ✓
- R6 store-ops honesty → B1 (no bytes; "projected" label) + B4 ✓
- R7 correctness checklist → A2.1 (index assembly, [DONE], invalid-JSON throw, reasoning_content ignored, nudge→trailing user, n:1; Ollama id reuse A2.2) ✓
- R8 security → A2.3 (dual gate + `safeBaseUrl` allowlist + fetch timeout in A2.1/A2.2) ✓
- R9 Ollama minimal → A2.2 + A4.2 grayed ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The only deferred numeric is the DeepSeek published price (A1.2) — flagged to verify against live docs at implementation, with a concrete starting value.

**Type consistency:** `StoreOp`/`InsStore` shared between `worker/storeops.ts`, `shared/events.ts`, `web/src/StoreOpsWidget.tsx`; `enabledModels(EnabledFlags|boolean)` back-compat checked at all call sites (models.test, session-do:272, index:44); `ModelRouting`/`OptimizeKey`/`SelectorMode` consistent across `shared/models.ts`, `web/src/lib/model.ts`, `TweaksPanel.tsx`; `providerFor`/`deepseekEnabled`/`ollamaEnabled` defined in `worker/llm/index.ts` and imported where used; `DispatchProvider(resolve, defaultModel)` signature matches its test and the session-do swap.

**Risk note:** A1.1 widens `ModelId` from a union to `string`, loosening type-checking on model ids repo-wide. This is intentional (provider ids are open-ended) and execution is still gated by `coerceModel`. If the repo prefers a closed union, the alternative is a discriminated `ModelId = ClaudeModelId | DeepSeekModelId | OllamaModelId` — more churn, deferred unless review asks.
