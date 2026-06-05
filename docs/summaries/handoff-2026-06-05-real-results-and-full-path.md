# Session Handoff: voygent-demo — Make It Real, Then Make It Impressive

**Date:** 2026-06-05
**Repo:** `/home/neil/dev/voygent-demo` (branch `main`, ~16 commits, clean, no remote)
**Live URL:** **https://voygent-demo.somotravel.workers.dev** (fully public, single Worker serves SPA + `/chat`)
**Prior handoffs:** the build plan is `~/dev/voygent-lite/docs/superpowers/plans/2026-06-05-voygent-demo-skeleton.md`; the full vision is `~/dev/voygent-lite/docs/strategy/2026-06-05-voygent-demo-site-plan.md`; the feature inventory for the "wow" is `~/dev/voygent-lite/docs/strategy/2026-06-05-demo-feature-discovery-findings.md`.

---

## TL;DR — read this first

Slice 1 (the walking skeleton) is **built, tested (19 vitest green), code-reviewed twice, deployed, and browser-verified.** Chat → hand-rolled MCP agent host → live folio works end-to-end. **BUT it has one fatal flaw and several polish gaps, and it is a long way from the desired outcome.**

**THE #1 ISSUE — the demo fabricates travel data instead of using real Voygent results.** The agent calls `flight_search`/`hotel_search`, but the MCP instance it points at (**staging**) has **no supplier credentials** (SerpAPI/GMT/TAAP), so those tools return nothing usable. The agent then **invents plausible flights, hotels, and prices from its own knowledge** and writes them into the folio. The folio *looks* populated and real, but it's hallucinated.

> Evidence (Neil's 2026-06-05 screenshot, "Mobile AL → Dublin"): the assistant said in chat: *"No SerpAPI key configured — let me try GMT... No supplier credentials are configured on this instance, so I'll work from my own knowledge to build realistic options"* and a note *"prices above are realistic estimates based on historical data... not live fares."* The folio's Aer Lingus/Delta fares and "The Shelbourne $295/night" were all model-invented.

**Honesty correction for the next session:** the earlier Cancún and Lisbon smokes in this session ALSO ran against credential-less staging — their "real-looking" results (Delta $778, Hyatt Ziva, etc.) were almost certainly fabricated too. **A populated folio is NOT proof of real data.** Do not trust the UI; verify against the raw MCP tool result.

**Where to start:** Phase 1 below — make every folio item a real MCP result (or honestly "no results"), and make fabrication impossible. Everything else is downstream of that.

---

## Current state — what's true right now

**Architecture (single Worker + DO + static SPA):**
- `worker/index.ts` — entry; routes `POST /chat` → `SessionDO`; serves the SPA via Workers Static Assets (`[assets] directory=./dist-web`, SPA fallback). Has a `DEMO_DISABLED` kill-switch.
- `worker/session-do.ts` — the `SessionDO` Durable Object: holds conversation + a per-session `tripId` (`demo-xxxx`), runs the agent loop fire-and-forget, streams SSE. **Contains the `SYSTEM_HINT` that drives the agent — this is where the anti-fabrication fix goes.**
- `worker/agent/loop.ts` — pure tool-use reducer (fully tested). After each trip-mutating tool it calls `onFolio` → `read_trip` → pushes a folio snapshot.
- `worker/agent/folio-sync.ts` — `isTripMutating()` allowlist + `tripToFolio()` mapper (maps the real `read_trip` envelope; see "verified MCP facts" below).
- `worker/mcp/client.ts` — hand-rolled JSON-RPC-over-HTTP MCP client (JSON + SSE framing). **Workers gotcha already fixed:** global `fetch` must be called via a local binding, never `this.f(...)` (else "Illegal invocation").
- `worker/llm/claude.ts` — Anthropic Messages API streaming via raw `fetch` (model `claude-sonnet-4-6`, `anthropic-version: 2023-06-01`).
- `web/src/*` — React (Vite): `App.tsx` (state + `streamChat`), `ChatView.tsx` (bubbles + tool chips), `FolioPanel.tsx` (live folio), `sse-client.ts`, `styles.css`. Professional header shipped this session.

**Deploy:**
- Live at `https://voygent-demo.somotravel.workers.dev` (account `5c2997e723bf93da998a627e799cd443`, workers.dev subdomain `somotravel` — same account as the `voygent.ai` zone).
- Secrets set: `ANTHROPIC_API_KEY` (Neil's, from `voygent-lite/.env`), `VOYGENT_MCP_URL` (= **staging**), `VOYGENT_MCP_BEARER` (= staging bearer). Kept as *secrets* (not vars) so the MCP target flips with one `wrangler secret put` and no redeploy.
- `DEMO_DISABLED` kill-switch: `npx wrangler secret put DEMO_DISABLED` (enter `1`) to pause; `npx wrangler secret delete DEMO_DISABLED` to resume.
- `demo.voygent.ai` is NOT attached — the `voygent.ai` zone has a `*.voygent.ai` wildcard (dashboard-configured) that routes every subdomain to the prod `voygent` Worker; it shadowed the custom domain AND regressed the workers.dev route, so it was reverted. Neil chose "stay on workers.dev for now." **Prod/Kim were never affected** (verified `kimstravel.voygent.ai/proposal/ryan-greece-honeymoon-sep-2026` → 200).

**Verified MCP facts (live, 2026-06-05) — reuse, don't re-derive:**
- Live prod MCP = `https://voygent.somotravel.workers.dev/mcp` (the old `voygent-lite.somotravel.workers.dev` 404s — Worker renamed; CLAUDE.md corrected this session).
- `read_trip` returns an envelope `{status, tripId, data:{meta, flights, lodging,...}}` (trip under `data`) and takes arg **`tripId`** (camelCase).
- `flight_search`/`hotel_search` take **`trip_id`** (snake_case) and write to a per-trip **candidate store** (read by `flight_list`/`hotel_list`) — NOT `trip.flights[]`/`trip.lodging[]`. The folio (which reads `read_trip`'s `flights[]`/`lodging[]`) only fills after the agent commits picks via `patch_trip` (full array; indexed dot-paths like `flights.0.x` silently no-op) or `promote_flights`/`promote_hotels_to_lodging`.
- `save_trip(tripId, data)` must run FIRST (patch_trip/read_trip 404 until the trip exists).
- MCP is stateless StreamableHTTP (no `initialize` handshake; responses may be `application/json` OR `text/event-stream`).
- Staging bearer's tier exposes 79 tools incl. `flight_search`/`hotel_search`/`patch_trip`/`promote_*` — but **no supplier creds behind them.**

---

## THE FULL PATH TO THE DESIRED OUTCOME

**Desired outcome:** a polished, credible, claude.ai-quality portfolio demo that *proves Neil built a real, sophisticated MCP-powered agentic travel system* — used as his résumé to land a great engineering job. A visitor builds a **real** trip end-to-end, watches it assemble live, and (via an "Engineering Inspector") sees the actual engineering behind it. Safe to leave public.

Sequenced so credibility comes before polish before flex. **Do Phase 1 first — without it the demo is a confident liar.**

### Phase 1 — REAL RESULTS + ZERO FABRICATION  ← START HERE (the blocker)
Goal: every flight/hotel/price/schedule in the folio is a **real Voygent MCP search result**, or the demo **honestly says "no results."** No hallucinated travel data, ever.

**1a. Decide the data source (needs Neil's input):**
- **(A) Live prod creds** — point at `https://voygent.somotravel.workers.dev/mcp` with a prod bearer (Kim's GMT/TAAP/SerpAPI creds → real fares). Two commands, no redeploy:
  ```
  printf '%s' 'https://voygent.somotravel.workers.dev/mcp' | npx wrangler secret put VOYGENT_MCP_URL
  npx wrangler secret put VOYGENT_MCP_BEARER   # interactive; paste Neil's prod AUTH_KEYS bearer
  ```
  ⚠️ Real, but **every public visitor spends real money** (SerpAPI ~$0.01–0.02/call) and hits Kim's supplier accounts + writes `demo-*` trips into **prod** KV + invites abuse/rate-limiting. Good for Neil's *private* testing; risky for a *public* URL.
- **(B) Fixtured/cached real results (RECOMMENDED for the public demo)** — run real prod searches ONCE for a curated set of demo routes/cities, save the **raw MCP responses** as fixtures, and have the demo's search tools replay them deterministically. Real data, **zero per-visit cost, fast, repeatable, no abuse surface, no live-supplier dependency.** This is the parent plan's "demo-safety layer: fixtures for bannable suppliers." The agent still does the real orchestration (save_trip → search → commit → folio); only the supplier round-trip is replayed.
- **(C) Golden pre-built real trips** — a few fully-built real trips to explore (least "live" feel; weakest demo).

> Recommendation: **B for public + A behind a gate for Neil's testing.** Get Neil's decision before building.

**1b. Make fabrication impossible (do this regardless of data source):**
- Rewrite `SYSTEM_HINT` in `worker/session-do.ts`: *"Use ONLY data returned by tool calls. NEVER invent flights, hotels, prices, schedules, or availability, and never 'estimate from your own knowledge.' If a search returns no results or errors, tell the user plainly ('I couldn't pull live results for that') and offer to adjust the search — do not fabricate. Never mention credentials, API keys, or internal tooling in chat."*
- **Stronger (enforce in code, don't just ask the model):** build the folio from the **real tool results**, not from model-authored `patch_trip` free-text. Best path: drive the real pipeline `flight_search → flight_list → promote_flights` and `hotel_search → hotel_list → promote_hotels_to_lodging`, so `read_trip`'s `flights[]`/`lodging[]` contain exactly what the tools returned. This removes the model's ability to invent folio contents. (Tradeoff: more orchestration steps; tune in the SYSTEM_HINT + verify live.)
- **Verification gate (required before claiming Phase 1 done):** call a search on the chosen source and inspect the **raw** tool result — confirm it has real fares; confirm the folio matches the result item-for-item (no extra invented entries); run a deliberately-empty query (e.g. obscure route) → the demo must say "no results," not fabricate. Capture one transcript as proof.

### Phase 2 — Honest, polished agent UX
- **No plumbing leaks:** the agent must never say things like "No SerpAPI key configured / I'll work from my own knowledge" (Phase 1b prompt kills most; verify).
- **Chat rendering:** currently raw markdown (`###`, `|`-tables, `**`) renders as literal text — looks unpolished. Pick one: (a) render markdown (react-markdown) so tables/headings look right, OR (b) **instruct the agent to keep chat prose-only** and put ALL structured data in the folio (recommended — the folio is the structured surface; chat stays conversational). Light bold/lists only.
- **Folio richness:** flight cards currently show no price (the model put prices in a chat table, not in the patched flight objects). Ensure price/airline/route/times land on the card. Confirm `tripToFolio` field map matches whatever the Phase-1b pipeline writes.

### Phase 2b — Onboarding / first-run experience (Neil's explicit ask, 2026-06-05)
A cold chat box is intimidating and (today) invites the free-form prompts that expose the fabrication gap. Guide the visitor into a real, well-formed trip:
- **Preset trip starters.** Show a set of typical trips as clickable chips/cards on first load (e.g. "Cancún beach week," "Dublin in October," "Tokyo cherry-blossom season," "Rome + Amalfi," "NYC long weekend"). Clicking one seeds a complete, known-good prompt. **Pair this with Phase 1-B fixtures:** the presets should map to routes/cities we have **real cached results** for, so a one-click start always shows real data (and never the fabrication path). This is the safest, most impressive default entry point.
- **Detect origin automatically.** The Worker gets free IP-geo with **no browser permission prompt**: Cloudflare exposes `request.cf` (`city`, `region`, `country`, lat/lon) and the `CF-IPCountry` header. Use it to prefill "from `<their city / nearest major airport>`." (Browser `navigator.geolocation` is an option but adds a permission prompt — prefer CF IP-geo for frictionless detection; fall back to geolocation only if you want street-level accuracy.)
- **Graceful fallback when origin is unknown.** If geo is unavailable/ambiguous, either (a) offer a short list of sample "from → to" starters, or (b) ask the user where they're departing from — don't silently guess an origin.
- **Interview-first flow (ideal).** Start with a brief interview that establishes the essentials before building: **where from, where to, when, how many travelers, vibe/budget.** Voygent's MCP already has a `start_trip_interview` tool — either drive it, or replicate a lightweight 3–4 question interview in the agent's opening turn. The agent should *ask* before it *builds*, so it never has to invent missing trip parameters. This also showcases the agent doing real elicitation, which reads as product-grade.

> Sequencing note: build the presets/interview on top of Phase 1 (real results) so every guided path lands on real data. Presets + fixtures together give a bulletproof first-run: one click → real trip assembles live, zero fabrication, zero per-visit cost.

### Phase 3 — The Engineering Inspector (the actual résumé payload)
The flex that makes a hiring manager think "this person can build." A drawer/panel showing, per turn, the **real engineering** (all telemetry already flows through Neil's hand-rolled host — that was the whole point of not using Anthropic's `mcp_servers` connector):
- Every MCP tool call: name, args, raw result, latency, success/error.
- The agent loop: turns, tool round-trips, tokens, context saved vs a naive approach.
- The orchestration graph (save_trip → search → promote → folio).
- The deeper flexes from `…/2026-06-05-demo-feature-discovery-findings.md`: the bot-defeat probe ladder (curl-impersonate → Worker `fetch` → Playwright), anti-Akamai/BMP work, multi-persona QA+Judge self-loop, Telemetry P1, the `/onboard` pipeline, cross-LLM routing.

### Phase 4 — Demo-safety layer (required to keep it public)
- **Budget caps:** per-session + a GLOBAL daily ceiling (Anthropic $ and tool calls). Per-conversation caps exist (12 turns / 24 tools in `loop.ts`); add a global/daily guard.
- **Abuse:** per-IP rate limit, input-length caps, basic bot protection.
- **Commission firewall:** when real lodging (with advisor commission) reaches the folio, reuse voygent-lite's `src/folio-board` projector + `assertNoAdvisorKeys` so no advisor economics leak to a public view.
- **Fixtures** (overlaps Phase 1b-B).
- Kill switch: DONE (`DEMO_DISABLED`).

### Phase 5 — Portfolio framing (Option B)
- Landing/story: "I'm Neil Roberts. I built Voygent — a production MCP travel platform. Here's a live piece of it." What it is, the engineering, links (GitHub, résumé, LinkedIn). Convert a visitor into "we should talk to this person." Later pivot to a product/affiliate front door.

### Phase 6 — Domain + final polish
- `demo.voygent.ai`: blocked by the `*.voygent.ai` wildcard → prod Worker. Needs the wildcard coordinated in the Cloudflare dashboard (carve out `demo.voygent.ai`, or add it as a higher-precedence custom domain on `voygent-demo`). Neil deferred this ("stay on workers.dev for now").
- Mobile, loading/empty/error states, accessibility.

---

## Immediate next steps for the new session

1. **Read** this handoff + the parent vision (`…/2026-06-05-voygent-demo-site-plan.md`) + the feature inventory (`…/2026-06-05-demo-feature-discovery-findings.md`).
2. **Ask Neil the Phase-1a decision:** live prod creds (A) vs fixtured real results (B) vs golden trips (C) for the public demo. (Recommend B public + A for his testing.)
3. **Execute Phase 1** — real data + anti-fabrication SYSTEM_HINT + (ideally) the real promote pipeline so the folio is tool-truth, not model-truth. **Verify against raw tool results + an empty-query honesty test.**
4. **Then Phase 2** (prose-only chat or markdown rendering; folio prices). Redeploy and re-screenshot.
5. Keep using `superpowers:subagent-driven-development` for build tasks and `/codex-review` at integration points — it worked well this session.

**Build/deploy commands (from `/home/neil/dev/voygent-demo`):**
```
npm run test            # 19 vitest, keep green
npm run typecheck
VITE_API_BASE="" npm run build:web   # same-origin build → dist-web (rm -rf dist-web first; vite won't empty it)
npx wrangler deploy     # deploys Worker + dist-web assets
```
Local dev: `npm run dev:worker` (8787) + `VITE_API_BASE=http://localhost:8787 npm run dev:web` (5173). Headless screenshot recipe: `node /tmp/voygent-demo-shot.cjs` (uses voygent-desktop's Playwright; drives the page, waits for the live run, screenshots — adapt the URL to the deployed one to capture a deployed shot).

---

## What's DONE — do not rebuild

- The entire Slice-1 architecture (chat + hand-rolled MCP host + agent loop + live folio + SSE multiplexer + Anthropic streaming parser). 19 tests green, typecheck clean.
- Two Codex review passes addressed: onFolio-resilience, SSE close-guard, SSE-frame parse, stream-EOF finalize, tool cap; frontend always-clear-busy + no-double-error-bubble + robust SSE parse + viewport meta.
- The Workers `fetch` illegal-invocation fix (McpClient).
- Deploy pipeline: single-origin static-assets serving, secrets, kill-switch, deployed to workers.dev. **Prod-zone-safe** (custom-domain experiment reverted; Kim untouched).
- Professional header.
- `voygent-lite/CLAUDE.md` prod-URL correction (committed on branch `voygent-demo-plan`).

## Open decisions for Neil
- [ ] Phase 1a: live prod creds vs fixtured real results vs golden trips for the **public** demo.
- [ ] Phase 2 chat: render markdown vs force prose-only chat.
- [ ] Onboarding (Phase 2b): which preset trips to feature, and interview-first vs preset-first as the default first-run (recommend offering both — presets for one-click, interview for "help me decide").
- [ ] When to do `demo.voygent.ai` (needs the `*.voygent.ai` wildcard handled in the CF dashboard).
- [ ] Public exposure posture once it's real + spending money (caps now, or gate-then-public).

## Don't
- Don't trust a populated folio as proof of real data — verify against the raw MCP tool result.
- Don't point the public demo at live prod creds without budget caps + abuse protection (Phase 4) — it spends real money per visit.
- Don't re-experiment with `demo.voygent.ai` on the prod zone unsupervised (wildcard collision regressed the workers.dev route once).
- Don't modify `voygent-lite` code for the demo (docs/handoffs are fine; the demo is its own repo).
