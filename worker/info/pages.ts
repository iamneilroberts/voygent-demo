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
<p>Per-supplier tools don't scale: ChatGPT caps connectors around 35 tools, and every schema rides in every request. Voygent collapsed ~70 per-supplier tools into per-domain routers — <code>cruise_search(line)</code>, <code>flight_search(source)</code>, <code>hotel_search(source)</code> — with the supplier as an argument. Fewer names, smaller catalog, same coverage; downstream adapters keep stable contracts so the router calls them unchanged.</p>

<h2>Search → distill → stage by id</h2>
<p>Raw supplier responses are huge (a single flight search can be hundreds of KB). They never enter the model. Searches write to a server-side candidate store; the model reads a <em>distilled</em> list (<code>flight_list</code>) and stages a pick by <strong>candidate id</strong> — the server joins the id back to the full data. The model carries a pointer, not the payload. This demo's Engineering tab shows the per-call savings live.</p>

<h2>Documents render out-of-context</h2>
<p>The client-facing trip document (the "folio") is a deterministic template render on the server — the model never generates or even sees the HTML. A document the model would have burned tens of thousands of output tokens writing (badly, with hallucination risk) is produced from structured trip state for zero model tokens. The model patches structured fields; the renderer does the rest.</p>

<h2>Patches, not rewrites</h2>
<p>Trip state mutates through <code>patch_trip</code> — field-level updates against server-held state — rather than round-tripping the whole trip JSON through the model each turn. The demo's "context kept out of the model" panel is measuring exactly this.</p>
<span class="artifact">sources: voygent-lite router consolidation (cruise pilot PR #167, M1 fan-out) · src/folio-renderer/* · flight_list/hotel_list distill tools · ADR-0004 (catalog locked per session)</span>
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
