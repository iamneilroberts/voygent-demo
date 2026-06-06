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
