// Pure access/landing decisions, unit-tested without rendering React.
import type { ModeId } from "./mode";

export type Tier = "public" | "pro";

/** Unauthed visitors always land on the reel ("auto"), even if localStorage persisted "live". */
export function effectiveMode(resolved: ModeId, hasSession: boolean): ModeId {
  return hasSession ? resolved : "auto";
}

/** Crossing into live without a session triggers the onboarding form. */
export function gateOnGoLive(hasSession: boolean): boolean {
  return !hasSession;
}

/** The "results are from public sources" banner: public tier, live mode only. */
export function showPublicDisclaimer(tier: Tier | null, mode: ModeId): boolean {
  return tier === "public" && mode === "live";
}
