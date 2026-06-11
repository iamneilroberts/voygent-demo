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

export interface LiveGateEnv extends BearerEnv {
  /** When unset, public-tier LIVE sessions are refused (fail closed). */
  DEMO_PUBLIC_LIVE_ENABLED?: string;
}

export type LiveBearer =
  | { ok: true; bearer: string }
  | { ok: false; message: string };

/**
 * Resolve the Voygent MCP bearer for a LIVE session, applying both fail-closed gates:
 * - public: requires DEMO_PUBLIC_LIVE_ENABLED to be set, so the public live path stays
 *   dark until a credential-free public bearer is confirmed (the credential-isolation
 *   guarantee). Without this, an open reel could reach live tools on whatever identity
 *   VOYGENT_MCP_BEARER happens to be.
 * - pro: requires a configured VOYGENT_MCP_BEARER_PRO (via pickBearer), else refuse —
 *   never silently falls back to the public bearer.
 * The reel (mode=auto) makes no MCP calls, so this only gates real live sessions.
 */
export function resolveLiveBearer(tier: Tier, env: LiveGateEnv): LiveBearer {
  if (tier === "public" && !env.DEMO_PUBLIC_LIVE_ENABLED) {
    return { ok: false, message: "The live demo isn't open to the public yet — request access to try it." };
  }
  const bearer = pickBearer(tier, env);
  if (!bearer) {
    return { ok: false, message: "Pro access isn't enabled yet — contact Neil." };
  }
  return { ok: true, bearer };
}
