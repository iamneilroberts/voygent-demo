/** Read `#code=...` from the URL, then immediately strip it from the address bar. */
export function readCodeFromHash(
  loc: Pick<Location, "hash" | "pathname" | "search">,
  hist: Pick<History, "replaceState">,
): string | null {
  const m = loc.hash.match(/[#&]code=([^&]+)/);
  if (!m) return null;
  const code = decodeURIComponent(m[1]);
  hist.replaceState(null, "", `${loc.pathname}${loc.search}`); // drop the secret from history/screenshots
  return code;
}

import type { Tier } from "./access";

export async function authenticate(apiBase: string, code: string): Promise<{ ok: boolean; tier: Tier | null }> {
  const res = await fetch(`${apiBase}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { ok: false, tier: null };
  const b = await res.json<{ tier?: Tier }>().catch(() => ({} as { tier?: Tier }));
  return { ok: true, tier: b.tier ?? "public" };
}

export async function sessionInfo(apiBase: string): Promise<{ ok: boolean; tier: Tier | null }> {
  try {
    const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    if (!res.ok) return { ok: false, tier: null };
    const b = await res.json<{ tier?: Tier }>().catch(() => ({} as { tier?: Tier }));
    return { ok: true, tier: b.tier ?? "public" };
  } catch { return { ok: false, tier: null }; }
}

/** Thin boolean wrapper for call sites that only need presence. */
export async function hasSession(apiBase: string): Promise<boolean> {
  return (await sessionInfo(apiBase)).ok;
}
