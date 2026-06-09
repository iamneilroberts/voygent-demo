import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { createCode, listCodes, revokeCode, usageForCode } from "./codes";
import { usdToMicros } from "./money";
import { ADMIN_HTML } from "./admin-page";

export interface AdminEnv {
  CODE_HASH_KEY: string;
  APP_ORIGIN: string;
  ADMIN_TOKEN?: string;
}

/**
 * Cloudflare Access is the preferred gate (configured on the /admin* route at the
 * edge). As defense-in-depth / local fallback we also accept a Bearer ADMIN_TOKEN.
 * If neither an Access JWT nor a correct token is present, 401.
 */
export function adminAuthed(req: Request, env: AdminEnv): boolean {
  if (req.headers.get("cf-access-jwt-assertion")) return true; // Access already vouched
  const tok = env.ADMIN_TOKEN;
  if (!tok) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${tok}`;
}

export async function handleAdmin(req: Request, env: AdminEnv, db: Db): Promise<Response> {
  const url = new URL(req.url);

  if (!adminAuthed(req, env)) return text("unauthorized", 401);

  // Admin UI page.
  if (url.pathname === "/admin" && req.method === "GET") {
    return new Response(ADMIN_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  }

  // List codes.
  if (url.pathname === "/admin/codes" && req.method === "GET") {
    return json({ codes: await listCodes(db) });
  }

  // Create code.
  if (url.pathname === "/admin/codes" && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    const b = await req.json<{ id: string; label: string; view?: string; dailyUsd: number; totalUsd: number; expiresAt?: string }>();
    const { code } = await createCode(db, {
      id: b.id, label: b.label, view: b.view ?? "default",
      dailyMicros: usdToMicros(b.dailyUsd), totalMicros: usdToMicros(b.totalUsd),
      expiresAt: b.expiresAt ?? null,
    }, env.CODE_HASH_KEY, new Date().toISOString());
    const link = `${env.APP_ORIGIN}/#code=${code}`;
    return json({ ok: true, code, link });
  }

  // Revoke code.
  const rev = url.pathname.match(/^\/admin\/codes\/([^/]+)\/revoke$/);
  if (rev && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
    await revokeCode(db, decodeURIComponent(rev[1]));
    return json({ ok: true });
  }

  // Per-code usage.
  const use = url.pathname.match(/^\/admin\/codes\/([^/]+)\/usage$/);
  if (use && req.method === "GET") {
    const since = url.searchParams.get("since") ?? "1970-01-01T00:00:00Z";
    return json({ events: await usageForCode(db, decodeURIComponent(use[1]), since) });
  }

  return text("not found", 404);
}
