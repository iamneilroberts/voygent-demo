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

export async function authenticate(apiBase: string, code: string): Promise<boolean> {
  const res = await fetch(`${apiBase}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ code }),
  });
  return res.ok;
}

export async function hasSession(apiBase: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/auth/me`, { credentials: "include" });
    return res.ok;
  } catch { return false; }
}
