# Session Handoff: voygent-demo — Phases 1/2/2b + cost work DONE; next is Phase 3 (Engineering Inspector)

**Date:** 2026-06-06
**Repo:** `/home/neil/dev/voygent-demo` (branch `main`, no remote, clean)
**Live URL:** **https://voygent-demo.somotravel.workers.dev** (single Worker serves SPA + `/chat` + `/presets`)
**Prior handoffs (read in order):** `handoff-2026-06-05-real-results-and-full-path.md` (the full-path vision/plan),
then `handoff-2026-06-05-phase1-shipped.md` (Phases 1/2/2b + cost detail). This file supersedes them as
the current pointer. The original build plan + vision live in `~/dev/voygent-lite/docs/strategy/2026-06-05-*`.

---

## TL;DR — what this demo is and where it stands

A polished, **honest** portfolio demo: a visitor builds a real trip end-to-end in chat and watches a folio
assemble live, proving Neil built a real MCP-powered agentic travel system. It's Neil's résumé piece.

**Shipped & live (all verified):**
- **Phase 1** — real fixtured results, **zero fabrication**. (`6629a1c`)
- **Phase 2** — polished honest UX: prose-markdown chat, rich folio cards. (`bdb317a`)
- **Cost work** — telemetry + tool-filtering + caching + cheap-mode + daily budget cap. (`f8c5fd2`)
- **Phase 2b** — onboarding: preset chips + IP-geo greeting + interview-first. (`e311958`)
- 42 vitest green, typecheck clean. Latest commit `f02556e` (docs).

**Next: Phase 3 — the Engineering Inspector** (the actual résumé payload). See "Next" below.

> **UPDATE 2026-06-06 — Phase 3 BUILT + merged to `main` (NOT deployed).** The Engineering Inspector
> shipped via subagent-driven TDD: drawer with 3 regions (Live this session / Behind the scenes / Business
> case). Spec: `docs/superpowers/specs/2026-06-06-engineering-inspector-design.md`; plan:
> `docs/superpowers/plans/2026-06-06-engineering-inspector.md`. Latest commit `fcdf143`, **58/58 vitest green,
> tsc clean, SPA builds (159 KB)**. New: `worker/inspector.ts` (pure helpers), inspector SSE events
> (`shared/events.ts`), loop emits tool/turn events, session-do emits savings(toolCatalog/patch/template/
> searchDistill)+overhead+summary, `web/src/Inspector.tsx` + `inspector-data.ts`. Codex-reviewed twice (spec +
> final) — fixed UTF-8 byte counting, searchDistill double-emit, savings-inflation math, instrumentation-timer
> gating. Honesty invariants hold: model gets unscrubbed results / inspector is a side channel (0 added model
> tokens) / estimates labeled / cost computed server-side.
> **RECAPTURE DONE (2026-06-06, commit `057e95a`).** All 5 fixtures now carry real prod `meta`
> (responseBytes / rawTokensEst / prodLatencyMs per flightSearch/flightList/hotelSearch/hotelList), so the
> **searchDistill** savings card now has live data. NOTE: magnitudes are modest and clamped ≥0 — prod's MCP
> already distills server-side before the demo captures (e.g. prod `flight_search` ≈ 1.0k tok), so the
> demo-side slim-vs-prod delta is small or 0 for some tools. Honest + non-inflating by design.
> **ONE ITEM STILL GATED ON NEIL:**
> 1. **Deploy** — `rm -rf dist-web && VITE_API_BASE="" npm run build:web && npx wrangler deploy`. Optional: flip `LLM_MODEL` to sonnet; decide `[show $]` default.

---

## How it works (architecture — reuse, don't re-derive)

Single Cloudflare Worker (`wrangler.toml`, `name=voygent-demo`) serving a React SPA (Workers Static Assets,
`dist-web`) + a Durable Object per chat session.

- `worker/index.ts` — routes: `GET /presets` (chips + IP-geo), `POST /chat` → `SessionDO`. Has `DEMO_DISABLED`
  kill switch + a **daily budget pre-check** (503s when the cap is hit).
- `worker/session-do.ts` — `SessionDO`: holds conversation + per-session `tripId` (`demo-xxxx`) + the
  `FixtureReplay`; runs the agent loop fire-and-forget over SSE. Holds the `SYSTEM_HINT` (anti-fabrication,
  prose-only, interview-first, featured trips). **Also doubles as the daily-budget ledger** via a reserved
  instance `idFromName("__budget__")` (paths `/__budget/status` and `/__budget/add`) — no extra DO migration.
  Per-session cost is logged as a `[cost] … usd=…` line and added to the ledger.
- `worker/mcp/replay.ts` — **the heart of the no-fabrication guarantee.** Intercepts `flight_search`,
  `hotel_search`, `flight_list`, `hotel_list`, `promote_flights`, `promote_hotels_to_lodging` and replays
  REAL captured results. Trip-state tools (`save_trip`/`patch_trip`/`read_trip`) run live against **staging**.
  Promote writes ONLY the prod-captured object keyed by a real candidate id; a staged `_candidateId` with no
  fixture match is rejected (flights) or dropped (hotels). `lastPromoted()` is overlaid onto the folio so it's
  tool-truth (dodges KV eventual-consistency races).
- `worker/fixtures/` — 5 captured routes (`*.json`) + typed `index.ts` (matchers, `presetRoutes()`). Each
  fixture holds candidate arrays + **per-candidate prod-promoted** `trip.flights`/`lodging` objects.
  Recapture: `scripts/capture-fixtures.mjs` (see Don'ts for the secret-safe invocation).
- `worker/presets.ts` — `GET /presets` payload: routes → cards with a complete one-click prompt + `request.cf` geo.
- `worker/llm/claude.ts` — Anthropic streaming; captures `usage` (incl. cache tokens); **prompt caching**
  (`cache_control` on the tools block + the static first user message). Model from `LLM_MODEL`.
- `worker/llm/cost.ts` — model-aware USD pricing (haiku/sonnet/opus).
- `worker/agent/loop.ts` — tool-use reducer; forwards `usage` to `onUsage` (server-side only).
- `worker/agent/folio-sync.ts` — maps the trip → `FolioData`; handles promoted `{outbound,return}` flights,
  prefers canonical `lodging[]`, filters bare `{_candidateId}` staging stubs.
- `web/src/` — `App.tsx` (fetches `/presets`), `ChatView.tsx` (Welcome chips + bubbles + tool chips),
  `prose.tsx` (safe markdown), `FolioPanel.tsx` (rich cards), `styles.css`.

**Cost guardrails (live):** `LLM_MODEL` defaults to **claude-haiku-4-5** (flip to sonnet via
`wrangler secret put LLM_MODEL`); demo restricted to 9 tools (was 79); prompt caching on; `BUDGET_DAILY_USD`
default **$5** auto-pauses `/chat`; `DEMO_DISABLED` kill switch. **Measured: ~$0.0264/full session on haiku.**

## Verified facts (reuse)
- Prod MCP capture path: `VOYGENT_MCP_URL_NEIL` in `~/dev/voygent-lite/.env` (per-user URL incl. token).
  Public demo points `VOYGENT_MCP_URL` secret at **staging** (no creds) — fixtures supply the real data.
- The 5 routes (also the preset chips): dublin-oct (MOB→DUB, Oct), cancun-beach (ATL→CUN, Mar 2027),
  tokyo-blossom (SFO→HND, Apr 2027), rome-amalfi (JFK→FCO, Sep), nyc-weekend (ORD→JFK, Feb 2027).
  SERP rejects past dates — keep future-dated.
- `promote_flights` copies from the server candidate store (fabrication-proof); `promote_hotels_to_lodging`
  does NOT (the replay enforces it). `patch_trip` indexed dot-paths (`flights.0.x`) silently no-op — use full arrays.

## Commands (from `/home/neil/dev/voygent-demo`)
```
npm run test            # 42 vitest
npx tsc --noEmit        # typecheck
rm -rf dist-web && VITE_API_BASE="" npm run build:web   # build SPA (vite won't empty dist-web itself)
npx wrangler deploy     # deploy Worker + assets
npx wrangler tail       # watch live; shows [cost] lines per session
```
Local dev: `npx wrangler dev --port 8799` (reads `.dev.vars`: ANTHROPIC_API_KEY + VOYGENT_MCP_URL=staging +
VOYGENT_MCP_BEARER). E2E harness: `DEMO_BASE=<url> node /tmp/demo-e2e.mjs <session> ["<msg>"]` (prints chat +
tool calls + final folio). Playwright screenshots: `/tmp/voygent-demo-shot2.cjs` (build), `…-welcome.cjs`,
`…-click.cjs` (use voygent-desktop's playwright).

---

## NEXT: Phase 3 — Engineering Inspector (the résumé payload)

A drawer/panel (toggle in the header) that exposes the REAL engineering per turn. Most telemetry already
exists server-side — the job is to surface it. Suggested build:
1. **Stream the data:** add a server event for tool calls + usage. The agent loop already emits `tool`
   (start/done w/ summary) and captures `usage`/cost. Extend the SSE `ServerEvent` (shared/events.ts) with an
   `inspector` event carrying: per tool-call {name, args, raw result, latency ms, ok}; per turn {tokens in/out,
   cache read/write, est cost}. Capture latency in `loop.ts` around `callTool`. **Decide:** OK to expose raw
   tool results + token/cost to the client? (Cost was deliberately kept server-only so far — Phase 3 likely
   wants at least tokens/latency shown; confirm with Neil whether to show $.)
2. **UI:** an inspector panel listing each turn → its tool round-trips (name, args, result, latency, ok/err),
   the loop stats (turns, tool count, tokens, cache hits), and the orchestration graph
   (save→search→stage→promote→folio). Make it visually "engineer-grade."
3. **Deeper flexes** (from `~/dev/voygent-lite/docs/strategy/2026-06-05-demo-feature-discovery-findings.md`):
   the probe ladder (curl-impersonate→Worker fetch→Playwright), anti-Akamai/BMP work, multi-persona QA,
   Telemetry P1, the `/onboard` pipeline, cross-LLM routing. These can be static "behind the scenes" cards.

## Then (later phases)
- **Phase 4 housekeeping:** per-IP rate limit, input-length caps, and a **TTL/cleanup sweep for `demo-*`
  trips** — every public visit writes one to **staging KV** by design; they accumulate. (Daily $ cap is done.)
- **Phase 5 portfolio framing** (Option B landing/story) · **Phase 6 domain** (`demo.voygent.ai` is blocked by
  the `*.voygent.ai` wildcard → prod Worker; needs CF-dashboard coordination; Neil deferred it).

## Open decisions for Neil
- [ ] Phase 3: show token/cost to visitors, or only tokens+latency (keep $ private)?
- [ ] Flip `LLM_MODEL` to sonnet before showing the demo to anyone important? (haiku is the cheap dev default.)
- [ ] Tune `BUDGET_DAILY_USD` (currently $5)?

## Don't
- Don't point the PUBLIC demo at live prod creds — decision B keeps it on staging + fixtures = $0/visit supplier cost.
- Don't commit `scripts/_fixtures-raw/` (gitignored; raw prod dumps).
- Recapture fixtures (secret never logged):
  `VOYGENT_CAPTURE_MCP_URL="$(grep '^VOYGENT_MCP_URL_NEIL=' /home/neil/dev/voygent-lite/.env | cut -d= -f2- | tr -d '"')" node scripts/capture-fixtures.mjs`
- Don't trust a populated folio without checking the raw tool result. Don't modify voygent-lite for the demo.
- Don't `git add -A` (matches voygent-lite hygiene; stage by name).
