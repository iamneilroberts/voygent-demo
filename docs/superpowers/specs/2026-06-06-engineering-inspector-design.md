# Design: Phase 3 — Engineering Inspector (+ cost meter, business case, context-economy, observer-effect overhead)

**Date:** 2026-06-06
**Repo:** `/home/neil/dev/voygent-demo` (branch `main`)
**Supersedes the "NEXT: Phase 3" section of** `docs/summaries/handoff-2026-06-06-phase3-next.md`.
**Source material for static cards:** `~/dev/voygent-lite/docs/strategy/2026-06-05-demo-feature-discovery-findings.md`.

---

## 1. Goal

A toggle-able **drawer** (button in the header) that makes the demo's invisible engineering visible — the
"résumé payload." It has **three regions**:

1. **Live this session** — real data streamed from the actual agent loop (orchestration graph, per-tool
   round-trips, loop scoreboard, **cost meter vs subscription tiers**, **context-saved meter**, and an
   **observer-effect/overhead** breakdown).
2. **Behind the scenes** — curated static cards about the production Voygent system, each citing a real
   source path, clearly labeled as *system capabilities* (not claims about this session).
3. **The business case** — why Voygent is an MCP server (your flat Claude subscription absorbs inference)
   rather than a standalone app billing you for API calls; parametric break-even math.

The **honest split** (live-measured vs production-cited vs clearly-labeled-estimate) is itself the
staff-engineer signal and matches the repo's "honest ledger / falsification discipline" ethos.

---

## 2. Decisions (recorded from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Cost exposure | Tokens/latency/cache always shown; **$ behind a `[show $]` toggle, default OFF**. |
| D2 | Raw tool results | **Collapsed summary line, expand-on-click** to full pretty-printed JSON. |
| D3 | Session scope | **Full Phase 3** (inspector event + UI + orchestration graph + static cards). |
| D4 | Subscription allotment numbers | **Clearly-labeled estimates** (community-observed, *not* Anthropic-published), with a "how we estimate ▸" expander + sources. |
| D5 | Business-case location | **A section in the Inspector drawer** (region 3), no new routing. |
| D6 | Voygent's own price | **Parametric** — break-even shown at **$0 / $12 / $29** price points. |
| D7 | Context-saved meter | **Hybrid** — live-measured (patch/template/tool-catalog/cache) + static cited cards (R2 offload, cross-source distillation). |
| D8 | Search raw→distilled size | **Re-capture** fixtures to record the real prod tool-response size (+latency) per route. |
| D9 | Observer-effect/overhead | Measure instrumentation overhead vs plain tool calls; show demo-harness and instrumentation overhead **separately** from real-system cost. |

---

## 3. Architecture overview

The agent loop already has, at the source, everything the live region needs: tool name, input, raw result
string, and per-turn token `usage`. What's missing is (a) **latency timing**, (b) a **client-bound event**
carrying it, (c) **savings/overhead measurement**, and (d) the **UI**. Cost pricing stays out of the
provider-agnostic loop and is injected by a thin wrapper in `session-do.ts`.

```
provider.stream ─▶ loop.ts ──emit──▶ session-do emit wrapper ──▶ SseMultiplexer ──▶ browser
                    │  (latency, tool/turn          │ (inject costUsd; emit savings/
                    │   inspector events)            │  overhead events)
                    └─ onUsage (server ledger, unchanged)
```

### 3.1 SSE event contract (`shared/events.ts`)

Add to the `ServerEvent` union (discriminated by `kind` under one `type: "inspector"`):

Every inspector event carries `exchangeId` (a per-`/chat`-call uuid, minted in the DO) so the client groups
robustly without inferring boundaries from stream timing (Codex NICE-TO-HAVE).

```ts
| { type: "inspector"; kind: "tool"; exchangeId: string; turn: number; name: string;
    args: Record<string, unknown>; result: string; latencyMs: number; ok: boolean }
| { type: "inspector"; kind: "turn"; exchangeId: string; turn: number;
    inputTokens: number; outputTokens: number;
    cacheReadTokens: number; cacheCreationTokens: number; costUsd: number }
| { type: "inspector"; kind: "savings"; exchangeId: string;
    mechanism: "patch" | "template" | "toolCatalog" | "searchDistill";
    tokensSaved: number; basis: "chars/4"; scope: "perTurn" | "perRender" | "aggregate";
    detail: string }
| { type: "inspector"; kind: "overhead"; exchangeId: string;
    instrumentationMs: number | null; instrumentationBytes: number; addedModelTokens: 0;
    folioReprojectMs?: number | null; note?: string }
| { type: "inspector"; kind: "summary"; exchangeId: string;
    turns: number; toolCalls: number; exposedToolCount: number; fullToolCount: number;
    inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number;
    costByModel: { haiku: number; sonnet: number; opus: number } }
```

- The existing `{ type: "tool"; phase; summary }` event **stays** (the ChatView chip strip uses it). The
  inspector `tool` event is the richer, persisted twin.
- `addedModelTokens` is the literal `0` — encoded in the type to make the central honesty claim
  unmissable: instrumentation streams on a side channel and never enters model context.
- `basis`/`scope` on every savings event prevent the UI from summing unlike quantities (Codex): only
  `scope:"aggregate"` and `scope:"perTurn"` are summed; `perRender` is shown as a latest/max, not added.
- **`summary` event** carries the all-three-model `costByModel` **computed server-side** (via the private
  `estimateCostUsd`/`PRICING`), so the client renders the cost meter + business case **without duplicating
  pricing** (Codex IMPORTANT). It also carries the real `exposedToolCount`/`fullToolCount` (no hardcoding).
- Timer fields are `number | null`: `null` = "below timer resolution" (Workers coarsen `Date.now()`).

### 3.2 Worker data path

**`worker/inspector.ts` (net-new, pure + unit-tested):**
- `estTokens(s: string): number` → `Math.ceil(s.length / 4)`. **Token estimate only** — labeled "approx
  (chars÷4)" everywhere. **Never** used for wire-byte accounting.
- `utf8Bytes(s: string): number` → `new TextEncoder().encode(s).length`. **Wire bytes** (UTF-8), used for
  `instrumentationBytes` and the fixture `responseBytes`. (Codex CRITICAL: JS `.length` is UTF-16 code
  units, not bytes — keep these two functions strictly separate.)
- `withInspectorCost(ev, model)` → injects `costUsd` into a zero-cost `kind:"turn"` event via
  `estimateCostUsd`; passthrough otherwise.
- `sessionCostByModel(usage)` → `{ haiku, sonnet, opus }` via `estimateCostUsd` per model — feeds the
  `summary` event so the client never needs the private `PRICING`.
- `scrubAdvisor(value: unknown, depth = 0): unknown` → defense-in-depth, applied to **both `args` and
  `result`** (Codex IMPORTANT). Recursively drops keys matching
  `/^(commission|commissionable|netRate|net_rate|markup|advisorNotes|advisor_only)/i`; **max depth 8**,
  bails to a `"[scrub: too deep]"` sentinel below that (Codex NICE-TO-HAVE: bounded recursion). String
  wrappers `scrubArgs(obj)` / `scrubResultText(raw)` parse→scrub→stringify; on parse failure return input.
- `ORCH_STAGES` + `stageForTool(name)` → tool name → orchestration stage.

**`worker/agent/loop.ts` (touched):**
- Wrap `callTool` with `Date.now()` start/end for `latencyMs`.
- After each tool call, emit `kind:"tool"` with `exchangeId`, `turn`, `args: scrubArgs(t.input)`,
  `result: scrubResultText(content)`, `latencyMs`, `ok` (ok = no thrown error / no `ERROR:` prefix).
- **Per-turn usage semantics (Codex IMPORTANT):** the provider yields `usage` near `message_stop`; the loop
  **accumulates all usage events within one `provider.stream` call** and emits **exactly one** `kind:"turn"`
  event **per provider call, including the final no-tool answer turn** (`costUsd: 0`, filled by the wrapper).
- The loop imports only pure helpers (`scrubArgs`/`scrubResultText`) — it stays pricing-agnostic.

**`worker/session-do.ts` (touched):**
- Mint `exchangeId = crypto.randomUUID()` per `/chat`; thread it into the loop so every inspector event
  carries it.
- `emit: (e) => mux.send(withInspectorCost(e, model))` — injects real cost into turn events.
- **Tool-catalog savings (Codex CRITICAL — reconcile the §3.2/§7.1 contradiction):** capture `fullTools`
  **before** `.filter(DEMO_TOOLS…)`. Emit one `savings:"toolCatalog"` with `scope:"perTurn"`,
  `tokensSaved = estTokens(JSON.stringify(full)) − estTokens(JSON.stringify(filtered))` (the **per-turn**
  schema delta) and `detail` derived from real counts. The UI multiplies by the actual turn count from the
  `summary` event; **never hardcode "70 of 79"** — `exposedToolCount`/`fullToolCount` ride the summary.
- **patch savings (Codex IMPORTANT — guardrails):** baseline = the **raw unwrapped staging trip JSON
  before any `lastPromoted` overlay**, cached on each `onFolio` read as `this.lastBaselineTripJson`. On a
  `patch_trip` call emit `savings:"patch"` `scope:"perTurn"` with
  `tokensSaved = max(0, estTokens(baseline) − estTokens(JSON.stringify(updates)))` — **emit only when a
  baseline exists** (skip the first patch before any read), and **clamp at 0** (never negative).
- **template savings (Codex CRITICAL — counterfactual, no double-count):** `onFolio` can fire after several
  mutating tools, so do **not** sum. Track `this.maxFolioTokens` per exchange and emit a single
  `savings:"template"` `scope:"perRender"` at exchange end with
  `tokensSaved = maxFolioTokens`, `detail = "deterministic render payload (chars÷4) the model never had to
  generate — not a model-measured count"`. UI shows it as a latest/max, not added to the perTurn sum.
- **searchDistill savings (Codex CRITICAL — measurable side channel):** `session-do` only sees the returned
  string, so add `FixtureReplay.lastMeasurement(): { tool, modelFacingTokens } | null` set inside
  `flightSearch`/`hotelSearch` (and the `flight_list`/`hotel_list` paths) to `estTokens(returnedText)` for
  the **exact intercepted response**. After an intercepted search returns, look up the matching fixture
  `meta[tool].rawTokensEst` (measured from `result.content[].text`, §3.3) and emit `savings:"searchDistill"`
  `scope:"aggregate"` with `tokensSaved = max(0, rawTokensEst − modelFacingTokens)`. **Emit only when the
  fixture has matching `meta`** (older fixtures → omit the card, never show a placeholder).
- **Observer-effect/overhead (Codex IMPORTANT — ordering + circularity):** accumulate `instrumentationMs`
  (best-effort timer summed over the inspector blocks; `null` if it reads 0/below-resolution) and
  `instrumentationBytes` (sum of `utf8Bytes(encodeSse(ev))` over every inspector event **emitted so far**,
  i.e. **excluding the overhead and summary events themselves** to avoid circularity). Emit the single
  aggregated `kind:"overhead"` event **before `mux.close()`** in the `finally` (the close currently precedes
  any post-loop work — the overhead + summary emits must come first). `addedModelTokens: 0`.
- **Summary:** emit `kind:"summary"` (also before `mux.close()`) with session totals + `costByModel` from
  `sessionCostByModel(usage)` + real tool counts.

### 3.3 Fixture re-capture (D8)

`scripts/capture-fixtures.mjs` (touched) records, per route + **per intercepted tool**, the **real prod
model-facing response size + latency** (Codex CRITICAL — measure the right thing, apples-to-apples):
- Measure from the **`result.content[].text`** (the exact text the model would receive), **not** the
  JSON-RPC envelope. `callTool()` already extracts that `text` — record `utf8Bytes(text)` and time the
  fetch (`Date.now()` around it). Keyed per intercepted tool so it matches what the replay later measures.
- Persist into `worker/fixtures/<routeId>.json` a new `meta` block, one entry per intercepted response:
  ```json
  "meta": {
    "flightSearch": { "rawTokensEst": 8230, "responseBytes": 32918, "prodLatencyMs": 5120 },
    "flightList":   { "rawTokensEst": 8120, "responseBytes": 32480, "prodLatencyMs": 410  },
    "hotelSearch":  { "rawTokensEst": 6410, "responseBytes": 25640, "prodLatencyMs": 3380 },
    "hotelList":    { "rawTokensEst": 6300, "responseBytes": 25200, "prodLatencyMs": 360  },
    "capturedAt": "2026-06-06"
  }
  ```
  `responseBytes = utf8Bytes(content.text)`; `rawTokensEst = estTokens(content.text)` (chars÷4 on the same
  text). Real measured prod numbers → "prod search took ~5.1 s and returned ~8.2k tok; the demo replays it
  in <1 ms and the model sees ~1.1k." The replay's `lastMeasurement()` (§3.2) measures the **same** keyed
  response so the before/after are comparable.
- `worker/fixtures/index.ts` (touched): add optional `meta?: Record<string, {rawTokensEst; responseBytes;
  prodLatencyMs}> & {capturedAt?: string}` to the `Fixture` interface; tolerate its absence (older fixtures)
  so the build never breaks before a re-capture, and the UI **omits** the search-distill card when `meta` is
  missing (Codex NICE-TO-HAVE — no placeholder).
- **This requires a capture run** with Neil's prod creds (the documented secret-safe invocation). It is an
  explicit plan step gated on Neil — it uses his per-user token and hits prod (SERP cost ~$0.01–0.02/call).

---

## 4. UI (web/src)

### 4.1 Layout (drawer, three regions)

```
┌ header ───────────────────────  Voygent · built by Neil   [🔍 Inspector] ┐
                                                  ┌────────── drawer ──────────┐
 chat              folio                          │ ▸ LIVE THIS SESSION         │
                                                  │   Orchestration             │
                                                  │   ●create→●search→●distill→ │
                                                  │   ●stage→●promote→○render   │
                                                  │   Timeline                  │
                                                  │   ▸ flight_search 412ms ✓   │  ← expand = raw JSON
                                                  │   ▸ promote_flights  88ms ✓ │
                                                  │   Scoreboard                │
                                                  │   3 turns · 6 tools ·       │
                                                  │   9 of 79 exposed · 1.2k in │
                                                  │   / 312 out · 980 cache     │
                                                  │   Cost   [ show $ ]         │
                                                  │   this trip vs Pro window…  │
                                                  │   Context kept out of model │
                                                  │   ~3.1k saved (patch/tmpl/  │
                                                  │   catalog/distill)          │
                                                  │   Observer effect           │
                                                  │   +0 model tokens · ~7KB    │
                                                  │   client · instrument <1ms  │
                                                  │ ▸ BEHIND THE SCENES         │
                                                  │ ▸ THE BUSINESS CASE         │
                                                  └─────────────────────────────┘
```

### 4.2 Components / files
- `web/src/App.tsx` (touched): header toggle button; `inspectorOpen` state; accumulate inspector events
  into `exchanges` (one per `send`, each holding tool round-trips + per-turn usage + savings + overhead).
  **Not reset per message** — the panel shows the whole session. Pass to `<Inspector>`.
- `web/src/Inspector.tsx` (net-new): renders the three regions; client-derives the orchestration graph from
  the ordered tool names; renders the cost meter, context-saved meter, overhead breakdown, static cards,
  and the business-case table.
- `web/src/inspector-data.ts` (net-new): static data — the **tier table** (§5), the **business-case
  constants** (§6), and the **behind-the-scenes cards** (§8). All sources + disclaimers live here.
- `web/src/sse-client.ts`: no change (it forwards any `ServerEvent`); `App` handles the new `inspector` type.
- `web/src/styles.css` (touched): drawer + region + card + meter styles.
- The existing ephemeral `tools` chip strip in `ChatView` stays (quick glance); the Inspector is the deep view.

---

## 5. Cost meter + subscription tiers (region 1)

### 5.1 The live numbers (real)
- Tokens in/out, cache read/write: summed from real `kind:"turn"` events.
- **Per-model cost of *this exact session*** comes from the `summary` event's `costByModel` (computed
  server-side via the private `estimateCostUsd`/`PRICING` — the client never duplicates pricing; Codex
  IMPORTANT) — e.g. "this trip = **$0.026** haiku · **$0.13** sonnet · **$0.65** opus". Shown only when
  `[show $]` is toggled on (D1).

### 5.2 Tier table (clearly-labeled estimate — D4)

| Tier | Price/mo | ~tokens / 5-hr window | ~Sonnet hrs/wk | Opus hrs/wk |
|---|---|---|---|---|
| Free | $0 | a few short chats | — | — |
| Pro | $20 | ~44,000 | 40–80 | limited |
| Max 5× | $100 | ~88,000 | 140–280 | 15–35 |
| Max 20× | $200 | ~220,000 | 240–480 | 24–40 |

- **Disclaimer (always visible):** "Estimated — Anthropic meters by rolling **5-hour windows + weekly
  caps**, not monthly token quotas; figures are community-observed and **shared across claude.ai chat +
  Claude Code**."
- **Primary meter (honest, binding unit):** this session's real cumulative tokens vs the **per-5-hour-window**
  figure → "this trip ≈ **X%** of one Pro window; ≈ **N** trips back-to-back per window, **$0 marginal**."
- **"how we estimate ▸" expander:** the monthly extrapolation (Pro ≈ 1.3M, Max 5× ≈ 2.6M, Max 20× ≈ 6.6M
  tok/mo) with its explicit assumption (`window tokens × 1 fresh window/day × 30`) + the sources:
  - Claude Help Center — *What is the Max plan?* (support.claude.com/en/articles/11049741)
  - Claude Help Center — *How usage & length limits work* (support.claude.com/en/articles/11647753)
  - IntuitionLabs — *Claude Max plan pricing & limits*
  - TokenMix — *Claude limits 2026 (5-hr / weekly)*

---

## 6. The business case (region 3, parametric — D5/D6)

**Honest core argument (no inflated claims):**
1. Under the MCP model **Voygent's marginal inference cost = $0** — your flat Claude subscription already
   paid for the tokens; you'd pay it anyway. *(unassailable)*
2. You get **frontier-model reasoning (Opus/Sonnet) at flat rate**, not metered per call.
3. A standalone app must **meter + mark up + bear billing/abuse/infra liability**; metered cost **compounds
   with trip complexity, volume, and model tier**, while the subscription stays flat-capped.

**Math (anchored on *this session's real tokens* — honest):**
- `costByModel[M]` arrives in the `summary` event (server-computed; §3.1) — the real cost of this session
  per model.
- Usage scenarios (labeled assumption: this session ≈ one typical trip):
  Light = 2 trips/mo · Medium = 8 · Heavy = 20.
- `appApiInference[M][scenario] = costByModel[M] × tripsMo`.
- Rendered table per Voygent price point ($0 / $12 / $29):

```
Per month                     Light (2)   Medium (8)   Heavy (20)
Standalone app — API billed    $A         $A           $A      (= trips × this session's $/model; + infra + margin)
Voygent MCP                    $V + $0 marginal inference (your Claude sub — likely already paid)
```

- The **decisive advantages** ($0 marginal · frontier quality · no metering/billing liability) are stated
  in prose; the table shows the raw inference figure climbing with volume + model tier (modest on
  haiku/light, material on opus/heavy) so the argument is **honest about where the dollar gap is real**.
- All assumption constants live in `inspector-data.ts` and are shown on-screen ("assumes 1 trip ≈ this
  session; + infra + margin not modeled"), never hidden.

---

## 7. Context economy + observer effect (region 1 — D7/D9)

### 7.1 Context-saved meter (hybrid)
**Live-measured (chars÷4, labeled).** Each savings event carries `scope` so the UI sums only like
quantities (Codex):
- `patch` (`perTurn`) — incremental patch vs full-trip rewrite; clamped ≥0, baseline-gated (§3.2).
- `toolCatalog` (`perTurn`) — per-turn schema delta (full − filtered); **UI multiplies by the actual turn
  count** from the `summary` event (resolves the earlier "once vs ×turns" contradiction — Codex CRITICAL).
- `searchDistill` (`aggregate`) — recorded real prod response size (§3.3) vs the slim payload the model saw.
- `cache` (`aggregate`) — derived from real `cacheReadTokens` ("reprocessed at ~10% cost").
- `template` (`perRender`) — folio rendered by code; shown as a **latest/max**, **not summed** into the
  above (counterfactual, double-count-safe; §3.2). Labeled "deterministic render payload, not a
  model-measured count."

The headline "≈N tokens kept out of the model this session" sums **only** the `perTurn` (× turns) and
`aggregate` mechanisms; `template` is displayed alongside as a separate counterfactual figure.

**Static cited cards (not exercised live):**
- **R2 offload** — `add_trip_image` / `add_trip_document` store binaries on R2; only a URL (~10 tok) enters
  context. Illustrative: a base64'd photo ≈ ~1,400 tok, a 10-page PDF ≈ ~6,000 tok — *never sent to the model*.
- **Cross-source distillation** — `public-search-merger.ts`; cited prod measurement (24% duplicate flights
  collapsed, $20–91 spread, PNS→YUL capture).

### 7.2 Observer effect — "the cost of measuring" (shown SEPARATELY)
Three honest buckets, never conflated with each other:
- **Real-system cost** — LLM turns, inherent tool work, live trip-state staging round-trips, deterministic
  rendering. (The numbers that would exist in production.)
- **Demo-harness overhead** — fixture replay matching/slimming, folio re-projection reads. Labeled "demo
  scaffolding, not the product." Note: supplier searches are **replayed from cached real results
  (near-instant; rendered as "below timer resolution" when the timer can't resolve it)** — in production
  these are live network calls (the recorded `prodLatencyMs`, §3.3); trip-state runs live against staging.
- **Instrumentation overhead** (the Inspector itself):
  - **Added model tokens: 0** (exact, headline — inspector data is a side channel, never in context).
  - **Client payload: ~N KB** (exact — sum of `utf8Bytes(encodeSse(ev))` over inspector events, UTF-8 bytes
    not UTF-16 `.length`; Codex CRITICAL).
  - **CPU: `<X ms` or "below timer resolution"** — when the timer reads `0`/`null` (Workers coarsening) the
    UI renders "below timer resolution," never `0 ms` dressed as a measurement.

**Telemetry-vs-plain measurement method + caveat:** for each intercepted tool call, record `coreMs` (the
actual `callTool`) and `instrumentationMs` (estTokens + scrub + stringify + emit) → scoreboard shows
"tool work ~X ms · instrumentation ~Y ms (Z%)". **Caveat (documented in the expander):** Workers coarsen
`Date.now()` (advances on I/O), so sub-millisecond CPU instrumentation may read `0`/below-resolution. When
**either** side is `0`/`null`, the UI **suppresses the percentage** and the `<1 ms` replay claim and shows
"below timer resolution" instead (Codex IMPORTANT — no timer-dependent load-bearing claim). **Byte counts
and added-model-tokens (0) are exact** regardless of timer granularity, so the strongest claims never depend
on the soft timer.

**Production telemetry (static card, Behind the scenes):** `src/telemetry/index.ts` emits one **non-blocking**
Analytics-Engine data point per tool call at the `tierGatedServer` chokepoint, **no-ops when `env.AE` is
unbound, and never throws** (test: "never throws if writeDataPoint itself throws"). Framed as
"fire-and-forget; negligible hot-path overhead" — cited, not given a fabricated benchmark number (that would
require benchmarking voygent-lite, out of demo scope).

---

## 8. Behind-the-scenes static cards (region 2 — D3)

Curated only from **shipped** items in the findings "honesty ledger" — no aspirational claims (no free-model
tier, no `/api/demo-trip`, no live Carnival bypass). Each card = `{title, claim, detail, source}`:

1. **Edge-native bot-defeat as a discipline** — 23-supplier anti-bot catalog; TLS/JA3 from Workers `fetch()`
   where industry uses Playwright+VM; **falsification discipline** (own verdicts overturned by byte-cert).
   Source: `docs/probes/2026-04-29-defense-bypass-catalog.md`, `docs/probes/2026-06-05-browser-locked-reexamination.md`.
2. **AI multi-persona QA + Judge** — 13 personas × 22 scenarios; Judge scores 4 weighted dims; **self-files
   issues + auto-writes cold-start fix-prompts**; synthesizes regression scenarios from issues.
   Source: `voygent-desktop/src/testing/`, `voygent-desktop/docs/QA-TESTING-SYSTEM.md`.
3. **`/onboard` pipeline** — probe → classify → scaffold (category template) → wire → test → staged commit;
   `--audit` diffs vs baselines + auto-files issues. Source: `.claude/skills/onboard/SKILL.md`.
4. **Commission firewall (LAW 1)** — client view provably free of advisor economics; enforced as a codified
   law with a grep-verify. Source: `src/folio-board/allowlist.ts`, `LAWS.md`.
5. **One server → Claude + ChatGPT** — OAuth 2.1 + DCR; per-user URL+token; tier-gated catalog locked per
   session; provider-agnostic host. Source: `src/mcp/oauth.ts`, `docs/adr/0004`.
6. **Scale** — 119 tool registrations, ~30 adapters, real suppliers across cruise/flight/hotel/package/car/
   excursion. Source: `src/mcp/tools/`, `src/adapters/`.
7. **Curator confabulation guard + LAWS** — read-only verification agent ("no evidence → no verdict");
   6 codified invariants. Source: `~/.claude/agents/curator.md`, `LAWS.md`.
8. **Production telemetry** (see §7.2) — `src/telemetry/index.ts`.

A one-line disclaimer heads region 2: *"These are capabilities of the production Voygent system this demo is
built on. The live panel above shows only what THIS session actually did."*

---

## 9. Honesty & safety rules (non-negotiable)

- Live region shows **only measured/real** data from this session. Estimates (chars÷4, tier allotments,
  business-case projections) are **labeled inline** every time.
- `scrubAdvisor` on **both `args` and `result`** of every streamed inspector tool event (defense-in-depth,
  bounded recursion; the firewall is itself a flex) — Codex IMPORTANT.
- No fabricated numbers: where a real number isn't available (production-telemetry overhead, supplier-raw
  size beyond the MCP response), present qualitatively + cited rather than invent.
- Static cards are framed as production capabilities, each citing a verifiable path; nothing aspirational.
- `[show $]` defaults OFF (D1). Caveat noted: a visitor in devtools could read `costUsd` in the SSE — accepted
  for this audience (the data is honest).
- **Do not modify voygent-lite for the demo.** The capture run reads prod via Neil's token; it does not
  change voygent-lite.

---

## 10. Testing

- `shared/events.test.ts` — encode/decode the five new inspector variants (incl. literal `addedModelTokens: 0`,
  the `summary` `costByModel` shape, `basis`/`scope`, and `exchangeId`).
- `worker/agent/loop.test.ts` — inspector `tool` events carry `exchangeId/name/args/result`, `ok===true`,
  numeric `latencyMs`; a thrown tool emits `ok===false`; **exactly one** `turn` event per provider call
  (incl. the final no-tool turn) with accumulated token fields.
- `worker/inspector.test.ts` (net-new) — `estTokens` vs `utf8Bytes` (assert they differ on a multibyte
  string); `withInspectorCost` (injects real cost only into zero-cost turn events); `sessionCostByModel`
  (three keys, sonnet fallback); `scrubAdvisor` (drops advisor-only keys in both args and result, depth-8
  bound returns the sentinel, passes through non-JSON); `stageForTool` mapping.
- `worker/inspector.test.ts` — savings math guards: patch clamps ≥0 and is baseline-gated; toolCatalog
  emits a per-turn delta; searchDistill omitted when fixture `meta` absent.
- `worker/fixtures/index` — tolerate fixtures with and without the new `meta` block.
- **UI:** verified via `rm -rf dist-web && VITE_API_BASE="" npm run build:web` + Playwright screenshot
  (web/src has no automated tests today; matches repo norm). Manual E2E via `/tmp/demo-e2e.mjs`.
- Full suite (`npm run test`, currently 42 green) + `npx tsc --noEmit` must stay green.

---

## 10b. Implementation slicing (Codex scope rec — adopt)

The full feature is too large for one clean plan; build in three shippable slices so the first is honest and
not blocked on the fixture re-capture or the trickier savings math:

- **Slice 1 — Live inspector spine:** event union (`tool`/`turn`/`summary` + `exchangeId`), loop latency +
  `tool`/`turn` emission, `scrubArgs`/`scrubResultText`, cost injection, `summary` event, drawer region 1
  (orchestration graph, timeline w/ expand, scoreboard, cost meter + tier table). Ships a complete honest
  Inspector with **no** savings/overhead and **no** recapture dependency.
- **Slice 2 — Measured savings + overhead:** `savings` + `overhead` events, the four live mechanisms
  (toolCatalog/patch/template/searchDistill) with their guards, `utf8Bytes` accounting, the capture-script
  change + **the gated recapture run**, fixture `meta` + `lastMeasurement()` side channel, context-saved
  meter + observer-effect breakdown.
- **Slice 3 — Static + business case:** Behind-the-scenes cards (`inspector-data.ts`) + the business-case
  section (parametric table off the `summary` `costByModel`).

Each slice keeps `npm run test` + `tsc` green and is independently demoable.

---

## 11. File manifest

**Net-new:** `worker/inspector.ts`, `worker/inspector.test.ts`, `web/src/Inspector.tsx`,
`web/src/inspector-data.ts`.
**Touched:** `shared/events.ts`, `shared/events.test.ts`, `worker/agent/loop.ts`, `worker/agent/loop.test.ts`,
`worker/session-do.ts`, `web/src/App.tsx`, `web/src/styles.css`, `scripts/capture-fixtures.mjs`,
`worker/fixtures/index.ts`, and the five `worker/fixtures/<route>.json` (after re-capture).

---

## 12. Out of scope / deferred

- A standalone `/about` route/page (D5 keeps everything in the drawer).
- A real cross-LLM provider toggle (findings #10; net-new abstraction) — Behind-the-scenes **card** only.
- Running the AI-QA harness live (cost/subagents) — static artifact only.
- Free/near-free model tier — not shipped; not claimed.
- JSON-patch folio diffs, per-IP rate limits, demo-trip TTL sweep (Phase 4 housekeeping in the handoff).
- Benchmarking voygent-lite's production telemetry overhead with a hard number.
