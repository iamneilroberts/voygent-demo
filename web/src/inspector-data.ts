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

// Supplier adapters the production router can reach. `id` matches the fanout event's
// source ids for the ones genuinely queried this session (cpmaxx, serp), so the Supplier
// Fan-Out drill lights those and dims the rest. A selection of the real catalog, not invented.
export interface SupplierAdapter { id: string; label: string; category: string; credentialed: boolean; coverage: string; }

export const SUPPLIER_CATALOG: SupplierAdapter[] = [
  { id: "cpmaxx", label: "CPMaxx", category: "Hotels · all-inclusive · cruise", credentialed: true,
    coverage: "Credentialed advisor network (VAX / CP Maxx): net rates, commission, profit and quote sheets the public can't see." },
  { id: "serp", label: "Google / serp", category: "Hotels · flights", credentialed: false,
    coverage: "Public retail metasearch — the same prices a traveler would find on Google." },
  { id: "expedia", label: "Expedia", category: "Hotels · flights", credentialed: false,
    coverage: "Expedia property and flight inventory via the partner API." },
  { id: "kiwi", label: "Kiwi.com", category: "Flights", credentialed: false,
    coverage: "Virtual-interlining flight search across low-cost and legacy carriers." },
  { id: "lastminute", label: "lastminute.com", category: "Flights · hotels · packages", credentialed: false,
    coverage: "Flight, hotel and dynamic-package search with live booking links." },
  { id: "viator", label: "Viator", category: "Tours · activities", credentialed: false,
    coverage: "Activities, excursions and skip-the-line tickets worldwide." },
  { id: "toursbylocals", label: "Tours by Locals", category: "Private guides", credentialed: false,
    coverage: "Private, locally guided tours across thousands of destinations." },
  { id: "tripadvisor", label: "TripAdvisor", category: "Places · reviews", credentialed: false,
    coverage: "Points of interest, ratings and reviews for itinerary enrichment." },
  { id: "viking", label: "Viking", category: "Cruise", credentialed: false,
    coverage: "Ocean and river cruise ship + sailing reference." },
  { id: "onesource", label: "OneSource", category: "Cruise", credentialed: true,
    coverage: "Cruise and cruise-tour quoting through the trade aggregator." },
  { id: "vacationstogo", label: "VacationsToGo", category: "Cruise", credentialed: false,
    coverage: "Cruise inventory and discount reference." },
  { id: "carrental", label: "Car rental", category: "Cars", credentialed: false,
    coverage: "Multi-supplier car-rental search across the major brands." },
];

export const SUPPLIER_DISCLAIMER =
  "A selection of the production supplier catalog (~30 adapters across hotel, flight, cruise, " +
  "package, car and activity). Lit suppliers were genuinely queried in this session; the rest " +
  "show what the production router can reach.";
