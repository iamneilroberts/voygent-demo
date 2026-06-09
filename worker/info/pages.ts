// Info/brag page content (task 7). Blog-style narratives grounded in real
// artifacts from the production Voygent repos — every claim names its source.
// The live numbers live in the demo's Engineering tab; these pages carry the
// stories that used to crowd it (task 6c moved the tier table / BTS cards /
// business case here).
import { renderInfoPage } from "./layout";
import { RESUME_BODY } from "./resume";

interface InfoPage { title: string; subtitle?: string; body: string }

const PAGES: Record<string, InfoPage> = {
  "bot-defeat": {
    title: "The bot-defeat saga",
    subtitle: "Getting real supplier data without a browser farm — and knowing, with evidence, when you can't.",
    body: `
<p>Travel supplier portals sit behind some of the most aggressive anti-bot stacks on the public internet — Akamai Bot Manager Premier, DataDome, TLS fingerprinting. The industry default is a Playwright browser farm on VMs. Voygent's discipline is the opposite: <strong>probe first, and only pay for a browser where the evidence says you must.</strong></p>

<h2>The probe ladder</h2>
<p>Every supplier goes through the same escalation: <code>curl-impersonate</code> locally → a disposable Cloudflare Worker probing from CF egress → Playwright last. Each probe leaves a falsifiable artifact (<span class="mono">docs/probes/*.md</span> plus a runnable probe Worker), so a verdict is never a vibe — it can be re-run and overturned.</p>
<p>And verdicts <em>do</em> get overturned, in both directions:</p>
<ul>
  <li>A 2026-04-29 re-probe flipped three excursion providers (Tours by Locals, Shore Excursions Group, GetYourGuide) from "browser-required, abandoned" to <span class="stat">worker-viable with no credentials</span> — the old verdicts predated the curl-impersonate discipline.</li>
  <li>CPMaxx — long framed as browser-gated — turned out to be <strong>plain nginx from a Worker</strong>. The whole CPMaxx suite (hotels, cruise, air, cars, tours, transfers) now runs as native Worker <code>fetch()</code> adapters, with the old browser path demoted to fallback. The misclassification itself is documented and corrected in the repo's history.</li>
  <li>The reverse, too: AA Vacations looked worker-viable from a warm browser, but a byte-certified CF-egress probe showed the login POST 403s while the GET passes — the "worker-viable" read was falsified and recorded as such.</li>
</ul>

<h2>The Carnival forensics</h2>
<p>The deepest investigation characterized a modern Akamai BMP deployment end-to-end. Eight Playwright configurations, two residential proxy vendors, byte-level diffing of <span class="stat">491,810 sensor reads</span> — byte-identical across an AT&amp;T Mobility and a Comcast residential path. Conclusion: the gate isn't the JS sensor surface at all; it's <strong>connection-layer (L4) proxy-indirection detection</strong>. No amount of browser-fingerprint work fixes that, and a Workers <code>fetch()</code> trips the same gate.</p>
<p>That result is codified as an architecture decision (<span class="mono">voygent-lite docs/adr/0003</span>) with explicit re-open triggers — so nobody burns a week re-testing Carnival-class suppliers without new evidence. Knowing where the wall is, with receipts, is as valuable as the wins.</p>
<blockquote>The catalog today: ~23 suppliers classified, ~30 adapters running on Workers <code>fetch()</code> — TLS/JA3-sensitive integrations from a serverless edge runtime, where the industry default is a VM farm.</blockquote>
<span class="artifact">sources: docs/probes/* · docs/adr/0003-no-worker-port-for-carnival-class-bmp.md · voygent-desktop bmp-tracer handoffs · PR #151 (CPMaxx native Worker adapters)</span>
<p><a class="cta" href="/">see the live searches it powers →</a></p>`,
  },

  "context-economics": {
    title: "Context economics",
    subtitle: "An agent's real budget isn't dollars — it's the model's context window. Voygent engineers that budget deliberately.",
    body: `
<p>Every tool schema, every raw search payload, every rendered document the model sees costs context — and context costs latency, money, and reasoning quality. Voygent treats the context window as a metered resource with explicit engineering around what enters it.</p>

<h2>Router consolidation: ~70 tools → ~35</h2>
<p>Per-supplier tools don't scale: ChatGPT caps connectors around 35 tools, and every schema rides in every request. The fix is per-domain <em>router</em> tools — <code>cruise_search(line)</code>, <code>flight_search(source)</code>, <code>hotel_search(source)</code> — with the supplier as an argument. Fewer names, smaller catalog, same coverage; downstream adapters keep stable <code>name</code> + <code>inputSchema</code> contracts so the router calls them unchanged.</p>
<p>This lands as a <strong>risk-sequenced migration, not a big-bang rename</strong> — and the sequencing is the point. A <strong>cruise pilot shipped first</strong> (<code>cruise_search</code> + <code>cruise_detail</code> replacing ~18 standalones — <span class="stat">−17 catalog names</span>, live in production), proving the router-over-adapter pattern before it scaled. A <strong>five-domain fan-out follows</strong> (flight / hotel / package / car / excursion). Crucially, the old per-supplier tools are retired only <em>after</em> their router is verified equivalent against the live adapters — the deletion is gated on a passing parity check, never on faith. You can watch the count fall as each wave lands: the <strong>"MCP tools exposed"</strong> stat in this demo's Engineering panel <em>is</em> the size of that catalog.</p>

<h2>Search → distill → stage by id</h2>
<p>Raw supplier responses are huge (a single flight search can be hundreds of KB). They never enter the model. Searches write to a server-side candidate store; the model reads a <em>distilled</em> list (<code>flight_list</code>) and stages a pick by <strong>candidate id</strong> — the server joins the id back to the full data. The model carries a pointer, not the payload. This demo's Engineering tab shows the per-call savings live.</p>

<h2>Documents render out-of-context</h2>
<p>The client-facing trip document (the "folio") is a deterministic template render on the server — the model never generates or even sees the HTML. A document the model would have burned tens of thousands of output tokens writing (badly, with hallucination risk) is produced from structured trip state for zero model tokens. The model patches structured fields; the renderer does the rest.</p>

<h2>Patches, not rewrites</h2>
<p>Trip state mutates through <code>patch_trip</code> — field-level updates against server-held state — rather than round-tripping the whole trip JSON through the model each turn. The demo's "context kept out of the model" panel is measuring exactly this.</p>

<h2>Schemas are context too</h2>
<p>Consolidation shrinks the <em>number</em> of tools; the next lever is the <em>weight of each schema</em>. A measured proposal (<span class="mono">voygent-lite ADR-0007</span>, characterized on a schema-eval harness — <strong>not yet in <code>src</code></strong>) replaces a literal <code>source</code> enum with a smaller semantic discriminator — the model says what it <em>needs</em>, and a server-side <code>INTENT_MAP</code> resolves that to the supplier. Across five models (Haiku, Sonnet, Opus, and two OpenAI models) it held ~90% dispatch accuracy while cutting per-tool schema tokens <span class="stat">~54%</span>. Fewer tools <em>and</em> leaner schemas per tool — the two compound. It's filed as a proposal precisely because the demo's honesty rule is to call shipped "shipped" and a finding "a finding."</p>
<span class="artifact">sources: voygent-lite router consolidation (cruise pilot PR #167 · M1 fan-out PR #170) · ADR-0007 (intent-routed schema discriminators, proposed) · src/folio-renderer/* · flight_list/hotel_list distill tools · ADR-0004 (catalog locked per session)</span>
<p><a class="cta" href="/">watch the savings accrue live →</a></p>`,
  },

  "record-replay": {
    title: "Record/replay engineering",
    subtitle: "How a public demo shows real data deterministically — with fabrication made structurally impossible.",
    body: `
<p>A public LLM demo has a credibility problem: if the model can write travel data into the page, it <em>will</em> eventually invent a flight. This demo's first build did exactly that — the folio looked perfect and was hallucinated. The fix wasn't a sterner prompt. It was structural.</p>

<h2>Capture once, replay byte-for-byte</h2>
<p>For the five featured trips, a capture script runs the <em>real</em> production pipeline once — real searches, real candidate lists, and crucially the real <em>promoted</em> trip objects keyed by candidate id. The demo's replay layer intercepts the search tools and serves those captures. When the model picks a hotel, the server writes <strong>the captured object for that candidate id</strong> — the model authors only the id, never the data. An id with no fixture match is rejected. There is no code path by which model-invented data reaches the folio.</p>

<h2>Live trips are the opposite — faithfully</h2>
<p>Ask for a destination outside the featured five and the session latches into live mode: every tool call passes through to the production Voygent MCP, the full tool catalog is exposed, and the folio renders exactly what <code>read_trip</code> returns. Featured trips are the rehearsed "gif"; live trips are the real product, unsanitized.</p>

<h2>The harness tests itself the same way</h2>
<p>The same recording format drives the autoplay demo, and a headless smoke harness drives the full SSE pipeline — scripted board picks, sequencing assertions ("no hotel board before a flight is picked"), and an enrichment verdict — against local or production. Sessions survive Durable Object eviction by persisting conversation + replay state, so an idle reader doesn't orphan their trip.</p>
<blockquote>Demo honesty is an engineering property, not a policy: the rejected-id test and the client-data allowlist are unit-tested invariants.</blockquote>
<span class="artifact">sources: worker/mcp/replay.ts · scripts/capture-fixtures.mjs · scripts/smoke-enriched-run.mjs · worker/session-store.ts (DO-eviction persistence)</span>
<p><a class="cta" href="/">run the real thing →</a></p>`,
  },

  "cost-engineering": {
    title: "Cost engineering",
    subtitle: "What an agent session actually costs, why caching changes the math, and why MCP's economics favor the product.",
    body: `
<p>This demo runs a full agent loop — Anthropic Messages API, streaming, the production tool catalog — on a public URL. That only works if cost is engineered, not hoped about.</p>

<h2>Prompt caching does the heavy lifting</h2>
<p>An agent loop re-sends its whole history every turn. Uncached, that re-bills the full conversation as fresh input each time. The demo places cache breakpoints on the three expensive prefixes — the tool catalog, the long static seed prompt, and a <em>moving</em> breakpoint on the final message so the whole growing conversation is a cache hit next turn. Cache reads bill at ~0.1× fresh input; writes at ~1.25×. The Engineering tab reports the session's <strong>cache hit rate</strong> and a <strong>cost-weighted token figure</strong> (reads at 0.1×, writes at 1.25×) — the honest number to compare against a subscription window, where the raw sum would read 5–10× too pessimistic.</p>

<h2>Defense in depth on a public endpoint</h2>
<ul>
  <li>Per-conversation caps (turns + tool calls), enforced server-side.</li>
  <li>A global daily spend ledger in a reserved Durable Object — the endpoint pauses itself at the cap.</li>
  <li>An instant kill switch (<code>DEMO_DISABLED</code> secret — no redeploy).</li>
  <li>A destructive-tool denylist: the public catalog withholds deletes, client-facing publishes, and CRM writes.</li>
</ul>

<h2>The MCP business case</h2>
<p>The structural point: under the MCP model, the product's <strong>marginal inference cost is $0</strong> — the user's own Claude subscription pays for the tokens, and these sessions fit comfortably inside a plan's 5-hour window (the demo's plan table computes your session's exact share, cost-weighted). A standalone app must meter API tokens, mark them up, and carry billing/abuse/infra liability that compounds with volume and model tier. An MCP product ships frontier-model reasoning at flat rate, and its costs don't scale with its users' usage.</p>
<span class="artifact">sources: worker/llm/claude.ts (cache breakpoints) · web/src/lib/usage.ts (cost weighting) · worker/index.ts (budget gate + kill switch) · Anthropic prompt-caching pricing</span>
<p><a class="cta" href="/">check your session's hit rate live →</a></p>`,
  },

  "production-system": {
    title: "The system behind the demo",
    subtitle: "This demo fronts a production MCP product. These are capabilities of that system — the demo's live panel shows only what your session actually did.",
    body: `
<h2>Scale, on the edge</h2>
<p><span class="stat">119 tool registrations, ~30 supplier adapters</span> across cruise / flight / hotel / package / car / excursion — all on Cloudflare Workers <code>fetch()</code>, no browser and no VM for anything that probes worker-viable. One MCP server drives both Claude and ChatGPT (OAuth 2.1 + Dynamic Client Registration, per-user URL+token auth, a tier-gated catalog locked per session).</p>

<h2>The commission firewall</h2>
<p>Advisors earn commission; clients must never see it. That separation is a codified law, not a convention: the client render path runs an explicit field <em>allowlist</em> plus <code>assertNoAdvisorKeys</code>, and economics are served separately behind bearer auth with <code>no-store</code>. The invariant has a grep-verify and lives in a six-law <span class="mono">LAWS.md</span> enforced by a read-only "curator" verification agent whose cardinal rule is <em>no evidence → no verdict</em>. (This demo's advisor toggle is the inverse, deliberately: demo boards are the <em>advisor</em> view, so commission is a feature.)</p>

<h2>AI evaluates the AI</h2>
<p>A persona/judge evaluation harness exercises the real product: <span class="stat">13 advisor personas × 22 scenarios</span> make live MCP calls, and a higher-grade judge model scores each run on four weighted dimensions — task completion, UX, data quality, error handling. Regressions auto-file issues with generated fix prompts. Eval-driven development in production, not in a notebook.</p>

<h2>Vendor onboarding as a pipeline</h2>
<p>Adding a supplier is one command: probe (the ladder from the <a href="/info/bot-defeat">bot-defeat saga</a>) → classify → scaffold from a category-matched template → wire into the router and tier catalog → generate tests → staged commit. An audit mode re-runs a shipped adapter against captured baselines and files an issue when it drifts.</p>

<h2>Telemetry that can't hurt the hot path</h2>
<p>One non-blocking Analytics Engine data point per tool call at the tier-gate chokepoint — no-ops when the binding is absent, and unit-tested to never throw even if the telemetry write itself throws. Fire-and-forget by construction.</p>
<span class="artifact">sources: src/mcp/tools/* · src/mcp/oauth.ts + docs/adr/0004 · src/folio-board/allowlist.ts + LAWS.md · voygent-desktop/src/testing/ + docs/QA-TESTING-SYSTEM.md · .claude/skills/onboard/SKILL.md · src/telemetry/index.ts</span>
<p><a class="cta" href="/">back to the live demo →</a></p>`,
  },

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

  "phase-machine": {
    title: "Keeping the model on track",
    subtitle: "A server-side phase machine drives the build and hands the model one small instruction at a time — which is exactly what lets a cheaper model do the job reliably.",
    body: `
<p>An open-ended agent loop asks a lot of the model: hold the whole multi-step plan in its head, decide what's next, and never drift. A frontier model mostly manages it. A cheaper, smaller model mostly doesn't — it <strong>stops early</strong> (declares a trip "done" before enrichment), <strong>presents instead of acting</strong> (asks "shall I add restaurants?" instead of calling the tool), or <strong>narrates from memory</strong> (names a plausible-sounding restaurant no tool ever returned). Those aren't reasoning failures — the small model is smart enough for each step. They're <em>discipline</em> failures across a long sequence.</p>

<h2>Move the sequencing into the server</h2>
<p>The phase machine takes the trip build off the model's shoulders. A pure, unit-tested reducer (<span class="mono">worker/agent/phases.ts</span>) owns a small state machine — <code>INTAKE → FLIGHT_PICK → HOTEL_SEARCH → HOTEL_PICK → ENRICH_EXCURSIONS → APPLY_PICKS → ENRICH_DINING → SUMMARY</code> — and the worker, not the model, decides what happens next. Before each turn the model is handed <strong>one</strong> small directive: the current phase's instruction, and nothing else.</p>

<h2>Advance by observation, never by trust</h2>
<p>The machine only moves forward when it <em>observes</em> the right tool actually succeed. <code>advancePhase(phase, toolName, input, result)</code> watches the real tool-result stream: a successful <code>flight_search</code> moves <code>INTAKE → FLIGHT_PICK</code>; a successful <code>promote_hotels_to_lodging</code> moves <code>HOTEL_PICK → ENRICH_EXCURSIONS</code>. A failed or unrelated call doesn't advance. The model can't talk its way forward — it has to <em>do</em> the thing.</p>

<h2>If it stops mid-build, re-prompt it</h2>
<p>When the model ends its turn without a tool call — the classic "I'll stop here" — a capped auto-continuation re-issues the current phase's directive and keeps going. The build can't quietly wedge half-finished. And there's an escape hatch: after a few re-prompts the machine forces the <code>SUMMARY</code> step, so a trip always gets a clean closing message rather than trailing off. (In the board-pick phases it does the opposite on purpose: a stop there is the model <em>correctly</em> waiting for you, so it doesn't auto-continue.)</p>

<h2>Why this is the cheap-model unlock</h2>
<p>Reliability now comes from the <em>structure</em>, not from the model's stamina — so you can run the whole build on a much cheaper model. The acceptance bar for this work: with <span class="stat">Claude Haiku</span> driving, <strong>10 out of 10</strong> scripted Dublin builds produced a complete folio — 3+ day-by-day days, at least one free and one paid activity, 4+ dining picks, and <span class="stat">zero fabricated names</span>. Before the phase machine, Haiku routinely stalled before enrichment. Same model; the difference is who holds the plan.</p>

<h2>It pairs with model routing</h2>
<p>That dovetails with the <a href="/info/llm-options">model-agnostic provider seam</a>: once the structure carries correctness, you can route the reasoning-light phases to the cheapest capable model and reserve a stronger model only for the parts that need it — or run the entire build on the cheap model and let the harness keep it honest. The phase machine is what makes "offload to a cheaper model" a safe default instead of a gamble.</p>

<h2>Shipped the careful way</h2>
<p>The whole machine is gated behind a single environment flag (<code>DEMO_PHASE_MACHINE</code>). Flag off, the behavior is byte-identical to the previous open-loop path; flag on, the worker drives. It shipped dormant, was canaried on production, and rolls back instantly by deleting one secret — no redeploy. You can watch it step live in this demo's Engineering panel: the <strong>"Workflow engine"</strong> trail shows each phase the server advanced through as your trip is built.</p>

<blockquote>The general lesson for agent products: don't ask a cheap model to be disciplined for twenty turns — make the discipline a property of the system, and let the model do the one small thing in front of it. The same orchestration discipline is what would let the production MCP make cheaper <em>host</em> models viable, too.</blockquote>
<span class="artifact">sources: worker/agent/phases.ts (TripPhase reducer + per-phase directives) · worker/agent/loop.ts (afterToolBatch + capped continueDirective) · worker/session-do.ts (flag-gated wiring) · scripts/smoke-enriched-run.mjs (10/10 haiku acceptance) · docs/summaries/handoff-2026-06-08-phase-machine.md</span>
<p><a class="cta" href="/">watch the workflow engine step live →</a></p>`,
  },

  "trip-integrity": {
    title: "Trip integrity: the data is the product",
    subtitle: "A weak model will ship a blank or fabricated proposal unless the server won't let it. Voygent owns data quality end-to-end.",
    body: `
<p>The validation panel in this demo's Engineering tab — the <strong>"validation N/N"</strong> stat and the <strong>Trip integrity ✓ / ↻ / ✗</strong> checks — isn't cosmetic. It's the visible edge of a production stance: the trip data <em>is</em> the deliverable, so its correctness is enforced by the server, not hoped for from the model. This is a different concern from <a href="/info/record-replay">record/replay</a> (that's about the public demo never showing invented data); this is about the live product refusing to emit a bad proposal in the first place.</p>

<h2>Lite owns it end-to-end</h2>
<p>An earlier architecture split the work — one service wrote raw trip JSON, another "reconciled" it later. Voygent collapsed that: data-quality findings (duplicate booking shapes, a missing <code>amount</code>, a double-encoded HTML entity, a price that doesn't sum) are bugs fixed <em>at the source</em>, on write, in one place. The decision is codified (<span class="mono">voygent-lite ADR-0006</span>) so the ownership can't quietly drift back apart.</p>

<h2>Guard, don't hope</h2>
<p>The strongest guards are the ones a model literally cannot talk past. <code>preview_folio_board</code> carries an <strong>empty-decisions guard</strong> — it will not render a client proposal with no choices in it, which is exactly the failure mode a rushed or cheap model produces. A decisions <em>builder</em> assembles pickable options from trip state, and a <code>completenessHint</code> rides back in tool metadata to nudge the model toward the gaps. On the write path, <code>validateAndCleanTripData</code> normalizes shapes and <code>reconcilePricing</code> makes the numbers add up before anything is shown to a client.</p>

<h2>Advisory vs. blocking — on purpose</h2>
<p>Not every warning should stop the world. <code>patch_trip</code> returns <code>consistencyWarnings[]</code> — amber, non-blocking signals ("this hotel's dates don't overlap the trip", "this leg has no price") that surface to the advisor without halting the build. The hard guards block a publish; the advisories inform a human. The split is deliberate: over-blocking trains people to bypass the guard.</p>

<h2>Self-heal — the "↻ repaired" checks</h2>
<p>Some problems are better fixed than flagged. When a published proposal URL once resolved to <span class="mono">/proposal/unknown</span> (a missing trip id), the fix wasn't a louder error — the builder now stamps <code>meta.tripId</code> at save time and the render path self-heals the link. Duplicate-booking shapes get normalized; double-encoded entities get decoded. Those are the runs that show as <strong>↻ repaired</strong> in the panel above: the server caught a flaw and corrected it, rather than passing it to a client.</p>

<blockquote>Demo honesty (replay) and product integrity (these guards) are two different invariants, both structural. One stops the <em>demo</em> from lying; the other stops the <em>product</em> from shipping a blank or broken proposal — even when a cheap model is driving.</blockquote>
<span class="artifact">sources: voygent-lite docs/adr/0006-lite-owns-data-integrity-end-to-end.md · validateAndCleanTripData / reconcilePricing · preview_folio_board empty-decisions guard + completenessHint _meta · patch_trip consistencyWarnings · /proposal/&lt;tripId&gt; meta.tripId self-heal</span>
<p><a class="cta" href="/">watch the integrity checks run live →</a></p>`,
  },

  "subagents": {
    title: "Subagents for the drudge work",
    subtitle: "Routine inbox-and-offers toil, handled by an agent that proposes and never disposes — the advisor stays in the loop by construction.",
    body: `
<p>A travel advisor's day is full of necessary tedium: triaging a flooded inbox, pulling promo codes out of supplier blasts, matching a booking confirmation to the right active trip. It's exactly the work an agent should absorb — <em>and</em> exactly the work where a wrong autonomous action (a deleted email, a message sent to the wrong client) does real damage. Voygent's answer is a subagent that does the reading and the drafting but holds no authority to act. <strong>It proposes; the human disposes.</strong></p>

<h2>The shipped one: the offers inbox</h2>
<p>This isn't hypothetical — it runs today against a real advisor mailbox. An <strong>IMAP IDLE watcher</strong> (a systemd service) reacts to mail as it arrives. A <strong>Haiku-4.5 classifier</strong> sorts each message into one of 13 categories (promo blast, booking confirmation, client-active, supplier doc, junk…), and anything it isn't sure about — confidence under 0.6 — is parked as <code>UNCERTAIN</code> rather than guessed. A <strong>second pass</strong> pulls structured offers (code, type, dates) out of the promo blasts and <strong>posts them straight into Voygent's shared offers index</strong>, where they become searchable inventory for trip-building. A trip-linker matches operational mail to the advisor's live trips. Every morning a <strong>deterministic 06:00 digest</strong> — pure SQL→markdown, <em>zero</em> LLM calls, so it can't hallucinate — lands as the advisor's triage queue. To date: <span class="stat">~3,700</span> messages ingested, <span class="stat">~2,300</span> classified, for about <span class="stat">$4.50</span> of model spend.</p>

<h2>Propose, never dispose</h2>
<p>The safety model is structural, not a promise. The watcher opens the mailbox <strong>read-only</strong> — IMAP <code>EXAMINE</code>, never <code>SELECT</code> for write — so a code path that calls <code>STORE</code>, <code>MOVE</code>, <code>EXPUNGE</code>, or <code>APPEND</code> is treated as a <em>bug</em>, not a feature. <code>DRY_RUN</code> is the default and the only permitted value in this phase: actions the agent recommends are written to an <code>actions</code> table with <code>executed_at</code> left <code>NULL</code> — a log of <em>proposed</em> moves, nothing performed. The advisor works the digest (or a mobile triage view) and decides. The codified rule, in priority order: <em>mailbox safety &gt; classification correctness &gt; feature completeness &gt; speed.</em> When two goals collide, the human's data wins.</p>

<h2>Coming soon — the rest of the fleet</h2>
<p>The offers agent is the first of a pattern, and the pattern generalizes to other advisor drudge work — each piece <strong>coming soon</strong>, each built the same propose-don't-dispose way:</p>
<ul>
  <li><strong>Offers into the trip.</strong> Today the agent files offers into the index; next it surfaces the relevant ones <em>inside</em> the build — "three of your suppliers are running Greece promos this week" — as suggestions the advisor accepts, never auto-applied.</li>
  <li><strong>An adapter-audit watchdog.</strong> The same onboarding pipeline that ships a supplier adapter has an <code>--audit</code> mode that re-runs it against captured baselines. Run on a schedule as a subagent, it files an issue when a supplier site drifts — catching a broken integration before an advisor hits it live.</li>
  <li><strong>A trip-integrity sweeper.</strong> A background pass over trips that flags the <a href="/info/trip-integrity">data-quality</a> issues the live guards would catch — stale prices, dangling bookings — and proposes the fix for review.</li>
</ul>

<blockquote>The principle that makes this safe to ship is the same one behind the <a href="/info/phase-machine">phase machine</a>: don't ask the model for judgment it shouldn't hold. An agent can read a thousand emails and draft every action — and still touch nothing until a human says go. Keeping the advisor in the loop isn't a limitation bolted on; it's the architecture.</blockquote>
<span class="artifact">sources: voygent-mailagent — deploy/voygent-mailagent-watcher.service (IMAP IDLE, EXAMINE-only) · classification/ (Haiku 4.5, 13 categories) · extraction/promo.py → voygent-lite offers index · digest/generator.py (deterministic, no LLM) · DRY_RUN actions table + constraint hierarchy · .claude/skills/onboard (--audit mode)</span>
<p><a class="cta" href="/">back to the live demo →</a></p>`,
  },

  "resume": {
    title: "Neil Roberts",
    subtitle: "Forward Deployed / Applied AI Engineer — this demo is the portfolio piece; here's the rest.",
    body: RESUME_BODY,
  },
};

export function infoPageHtml(slug: string): string | null {
  const page = PAGES[slug];
  if (!page) return null;
  return renderInfoPage({ title: page.title, subtitle: page.subtitle }, page.body, slug);
}
