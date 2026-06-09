export function getCookieHeader(req: Request): string | null {
  return req.headers.get("cookie");
}

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export function text(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...extra } });
}

/** Returns a 403 Response if the mutation is cross-origin or not JSON; null if OK. */
export function guardMutation(req: Request, appOrigin: string): Response | null {
  if (req.headers.get("origin") !== appOrigin) return text("bad origin", 403);
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return text("bad content-type", 403);
  return null;
}
