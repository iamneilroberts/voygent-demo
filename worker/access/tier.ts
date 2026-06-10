export type Tier = "public" | "pro";

export interface BearerEnv {
  VOYGENT_MCP_BEARER: string;
  VOYGENT_MCP_BEARER_PRO?: string;
}

/**
 * Pick the Voygent MCP bearer for a session's tier. Pro REQUIRES a configured
 * pro bearer — returns null (caller must fail closed) rather than silently
 * falling back to the public bearer, so a misconfigured pro code can never run
 * on credential-free access and a public code can never reach the pro bearer.
 */
export function pickBearer(tier: Tier, env: BearerEnv): string | null {
  if (tier === "pro") return env.VOYGENT_MCP_BEARER_PRO ?? null;
  return env.VOYGENT_MCP_BEARER;
}
