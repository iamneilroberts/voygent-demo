# Session prompt (voygent-demo): wire voygent-lite's supplier-raw size telemetry into the Inspector

**Repo:** `~/dev/voygent-demo` · **Date written:** 2026-06-11 · **Origin:** cross-repo handoff from the voygent-lite session that shipped the producing side (PR #171).

---

## TL;DR / what to do

On a **live** menu demo trip, the Engineering Inspector shows **`≈0 CONTEXT KEPT OUT`** and the Token Elimination Funnel stays on its "appears once the model starts working" placeholder. Make a live trip's real `flight_search` / `hotel_search` calls populate "context kept out" from the **genuine supplier-raw → distilled byte reduction** that voygent-lite now exposes.

The producing side is DONE and verified in prod. Your job is the **consuming side** in this repo: pass `include_size_stats: true` on those MCP calls, read `_meta["voygent/sizeStats"]`, and emit a `searchDistill` savings event from it.

## Why `≈0` today (root cause — verified, don't re-derive)

The Inspector's "context kept out" = aggregate of `kind:"savings"` events. The only `searchDistill` emitter is **`worker/session-do.ts:551`**, gated by:

```ts
if (faithfulGates(faithful, this.liveMode).measureSearchDistill && this.replay.isIntercepted(name)) {
  const m = this.replay.lastMeasurement();
  const fx = this.replay.currentFixture();
  ...
  emit({ type:"inspector", kind:"savings", mechanism:"searchDistill",
         tokensSaved: saved, basis:"chars/4", scope:"aggregate",
         rawTokens: meta.rawTokensEst, slimTokens: m.modelFacingTokens, tool: m.tool, detail });
}
```

Two reasons a **live** trip shows nothing:
1. **Replay-only gate** — `this.replay.isIntercepted(name)` is false for live tools (they hit voygent-lite directly, not the replay fixtures), so no event fires.
2. **Wrong quantity even when it does fire** — it measures *fixture prod-response tokens vs slim model-facing tokens* (a small delta). The real, much larger reduction is *supplier-raw bytes → distilled bytes*, which only voygent-lite can see — and `grep -rn "include_size_stats\|sizeStats"` in this repo returns **nothing**. The consuming side was never built.

## The producing-side contract (voygent-lite, SHIPPED — prod Worker `voygent` `2807ae09`, PR #171)

- `flight_search` and `hotel_search` accept an opt-in boolean param **`include_size_stats`**.
- When `true`, the MCP tool result carries **`_meta["voygent/sizeStats"] = { rawBytes: number|null, distilledBytes: number }`**:
  - `rawBytes` = decoded supplier HTTP body bytes at the fetch boundary (pre-distill).
  - `distilledBytes` = bytes of the slim candidate list the model sees.
  - `rawBytes` is **`null`** when there was no upstream fetch (e.g. `source` with no fetch-boundary capture, or a `not_configured`/error path). **Treat null/0 raw as "no chip"** (mirrors the existing `saved > 0` guard).
- When the param is absent/false, `_meta` is **`null`** (byte-identical model-facing `content`). Verified live.
- **Verified example (prod, this is what you'll get):** `flight_search source="serp"` JFK→LIS with `include_size_stats:true` → `{ rawBytes: 20626, distilledBytes: 3102 }` (~85% cut). Reference: voygent-lite `docs/adr/0008-...` neighbours + `docs/summaries/handoff-2026-06-06-voygent-telemetry-supplier-raw.md`; `_meta` key is the literal string `voygent/sizeStats`.

## Hard constraint: the demo now runs FREE-tier (ADR-0008)

`VOYGENT_MCP_BEARER` on this worker was swapped (2026-06-11) to a **credential-free FREE-tier** bearer. Under it the only reachable searches are:
- `flight_search` with `source ∈ {serp, public}`
- `hotel_search` with `source = serp`

So: **`serp` is the one that yields real `rawBytes`** (verified 20626→3102). `public` proxies to the desktop scraper and **may return `rawBytes: null`** (no fetch-boundary byte capture on that path) — your code must handle null gracefully (no chip), not crash. cruise/car/package and any credentialed source are not reachable and are out of scope.

## Implementation (TDD, isolated worktree)

1. `/branch wire-supplierraw-telemetry` (or `git worktree add`) off `main`.
2. **Find the live MCP call site.** In `worker/session-do.ts`, locate where live (`this.liveMode`, non-intercepted) tool calls dispatch to the real voygent-lite MCP client (the `callTool`/MCP-client path, distinct from `this.replay.handle`). That's where the response — and its `_meta` — is available.
3. **Inject the param.** For `name === "flight_search" || name === "hotel_search"` on the live path, add `include_size_stats: true` to the outgoing tool arguments. Keep it invisible to the model (inject at the proxy/dispatch layer, not via the prompt — the model must not have to ask for telemetry).
4. **Read `_meta` + emit.** After the live call returns, read `result._meta?.["voygent/sizeStats"]`. If present with `rawBytes > 0 && distilledBytes >= 0 && rawBytes > distilledBytes`, emit the SAME event shape as the replay path:
   - Convert bytes → token estimate to keep the funnel's `basis:"chars/4"` math consistent: `rawTokens = Math.round(rawBytes/4)`, `slimTokens = Math.round(distilledBytes/4)`, `tokensSaved = rawTokens - slimTokens`.
   - `mechanism:"searchDistill"`, `scope:"aggregate"`, `tool: name`, and a `detail` like `` `live ${name} supplier-raw ~${rawBytes}B → model saw ~${distilledBytes}B` ``.
   - Guard `tokensSaved > 0` (same rationale as the existing comment: a near-parity payload shouldn't render a "0 saved / broken" chip). Skip silently on null/absent `_meta`.
   - The savings event type (`shared/events.ts` ~95) already has optional `rawTokens`/`slimTokens`/`tool` — reuse them; the Token Elimination Funnel (`web/src/lib/inspector-drills.tsx`, `inspector-stats.ts`) draws per-search bars from them. No event-shape change needed; this is additive.
5. **Don't double-count.** Make sure the new live emit and the existing replay emit can't both fire for the same call (replay path is `isIntercepted`; live path is not — they should be mutually exclusive, but assert it).
6. **Tests.** Add a `session-do` (or a focused unit) test: given a live `flight_search` result with `_meta["voygent/sizeStats"]={rawBytes:20626,distilledBytes:3102}`, exactly one `searchDistill` savings event is emitted with `rawTokens≈5157, slimTokens≈776, tokensSaved≈4381, tool:"flight_search"`; given `rawBytes:null`, **no** event; given absent `_meta`, no event. Extend `inspector-drills.test.ts` if the funnel rendering needs a live-sourced row.
7. **Verify live.** Deploy to the `voygent-demo` worker, run a live menu trip via `demo.voygent.ai` (free-tier bearer; ensure the model does a `flight_search`/`hotel_search` with `source=serp`), and confirm the Inspector's **"context kept out"** is now non-zero and the funnel draws a bar sourced from real supplier bytes. `serp` is your reliable path; `public` may legitimately show no chip when `rawBytes` is null.

## Watch-outs

- **`_meta` plumbing:** confirm the demo's MCP client actually surfaces `result._meta` (some MCP client wrappers drop `_meta`). If it's dropped, fixing the client to pass `_meta` through is part of this task.
- **basis honesty:** the funnel says "tokens"; you're deriving from bytes/4. Keep the real byte figures in `detail` so the drill-down is truthful. (If you'd rather show bytes natively, that's a larger funnel change — out of scope unless you choose it.)
- **Faithful/replay modes unchanged:** only add behavior on the live, non-intercepted path. Don't regress the replay `searchDistill` numbers the canned demos rely on.
- This is the "secondary payoff" the telemetry handoff named; the primary (AE doubles for the bottleneck program) is already flowing voygent-lite-side and needs nothing here.

## Done when

A **live** menu demo trip on `demo.voygent.ai` shows a real, non-zero "context kept out" in the Engineering Inspector, sourced from voygent-lite's `_meta["voygent/sizeStats"]` (not the replay fixtures), with the Token Elimination Funnel drawing a per-search bar; tests cover the present/null/absent `_meta` cases; deployed to the demo worker.
