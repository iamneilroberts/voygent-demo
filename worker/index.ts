export { SessionDO } from "./session-do";
import { buildPresets } from "./presets";
import { getPageData, mergeOverride, renderInfo, isKnownSlug, PAGES } from "./info/pages";
import { getOverride, putOverride, deleteOverride } from "./info/overrides";
import { collectPosts, renderBlog } from "./blog/render";
import { enabledModels, DEFAULT_SMART_MAP } from "../shared/models";
import { STATS_AGG_SQL, shapeStats, type StatsAggRow } from "./stats";
import { deepseekEnabled } from "./llm/index";
import { D1Db, type Db } from "./access/db";
import { lookupByCode, admit, admissionReason } from "./access/codes";
import { issueCookie, verifyCookie, newSid } from "./access/session";
import { guardMutation, getCookieHeader, json, text } from "./access/http";
import { handleAdmin, adminAuthed } from "./access/admin";
import { handleOnboard } from "./access/onboard";

interface Env {
  SESSION: DurableObjectNamespace;
  DEMO_DISABLED?: string;
  // enrichment / multi-provider
  DEMO_OPUS_ENABLED?: string;
  DEMO_TEST_TOKEN?: string;
  DEMO_PHASE_MACHINE?: string;
  STATS_DB?: D1Database;
  DEEPSEEK_API_KEY?: string;
  DEMO_DEEPSEEK_ENABLED?: string;
  // access-control
  DEMO_DB: D1Database;
  CODE_HASH_KEY: string;
  SESSION_SIGN_KEY: string;
  ADMIN_TOKEN?: string;
  APP_ORIGIN: string;
  EST_EXCHANGE_MICROS?: string;
  // tier / onboarding / pro-access
  VOYGENT_MCP_BEARER_PRO?: string;
  RESEND_API_KEY?: string;
  ONBOARD_IP_DAILY_CAP?: string;
  NEIL_NOTIFY_EMAIL?: string;
  DEMO_PUBLIC_LIVE_ENABLED?: string;
  __db?: Db; // test seam: inject an in-memory Db
}

const COOKIE_TTL_SEC = 43200; // 12h
const DEFAULT_EST_MICROS = 250_000; // $0.25 conservative per-exchange reservation

function makeDb(env: Env): Db { return env.__db ?? new D1Db(env.DEMO_DB); }
function estMicros(env: Env): number { return Number(env.EST_EXCHANGE_MICROS ?? DEFAULT_EST_MICROS); }
function utcDate(): string { return new Date().toISOString().slice(0, 10); }

// Test/smoke requests (carrying the secret header) bypass the public daily
// budget so automated runs don't 503 real visitors. Returns false unless the
// token is configured AND matches — never an open bypass.
function isTestRequest(req: Request, env: Env): boolean {
  return !!env.DEMO_TEST_TOKEN && req.headers.get("x-demo-test") === env.DEMO_TEST_TOKEN;
}

async function dailyBudgetExceeded(env: Env): Promise<boolean> {
  try {
    const stub = env.SESSION.get(env.SESSION.idFromName("__budget__"));
    const res = await stub.fetch("https://do/__budget/status");
    return !!(await res.json<{ over: boolean }>()).over;
  } catch { return false; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const db = makeDb(env);
    const secure = env.APP_ORIGIN.startsWith("https://");

    // --- Public, no-auth endpoints ---
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    // In-place editor: admin-only save/revert of a deep-dive page's override.
    // Editing is client-gated in the browser (a stored ADMIN_TOKEN) but the
    // server is the real boundary — every mutation re-checks adminAuthed.
    {
      const m = url.pathname.match(/^\/info\/([^/]+)\/(save|revert)$/);
      if (m && req.method === "POST") {
        const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
        if (!adminAuthed(req, env)) return text("unauthorized", 401);
        const slug = decodeURIComponent(m[1]);
        if (!isKnownSlug(slug)) return text("unknown page", 404);
        if (m[2] === "revert") {
          await deleteOverride(db, slug);
          return json({ ok: true });
        }
        let b: { title?: string; subtitle?: string; body?: string };
        try { b = await req.json<{ title?: string; subtitle?: string; body?: string }>(); }
        catch { return text("bad json", 400); }
        await putOverride(db, slug, {
          title: b.title ?? "", subtitle: b.subtitle ?? "", body: b.body ?? "",
        }, Date.now());
        return json({ ok: true });
      }
    }
    if (url.pathname.startsWith("/info/") && req.method === "GET") {
      // Worker-served brag/info pages (standalone HTML, no SPA bundle). An
      // unknown slug falls through to the SPA so deep links never hard-404.
      // Content is the source seed (pages.ts) with any D1 override layered on;
      // the admin editor chrome is injected (inert without a stored key).
      const slug = url.pathname.slice("/info/".length).replace(/\/$/, "");
      const def = getPageData(slug);
      if (def) {
        const ov = await getOverride(db, slug);
        const html = renderInfo(slug, mergeOverride(def, ov), { withEditor: true, edited: !!ov });
        // no-store so a just-saved edit shows immediately (was public max-age=300).
        return new Response(html, { headers: { ...cors(), "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      // Unknown info slug → send them to the demo rather than a bare "ok".
      return Response.redirect(new URL("/", url).toString(), 302);
    }
    if (url.pathname === "/blog" && req.method === "GET") {
      // Blog landing: auto-indexed deep-dive posts (content.json entries flagged
      // blog:true) + an editable hero narrative (the `blog-home` entry, edited
      // in place via the same admin editor). Hero edits save through the existing
      // POST /info/blog-home/save|revert routes.
      const def = getPageData("blog-home");
      const ov = def ? await getOverride(db, "blog-home") : null;
      const hero = def ? mergeOverride(def, ov) : null;
      const html = renderBlog(hero, collectPosts(PAGES), { withEditor: true, edited: !!ov });
      return new Response(html, { headers: { ...cors(), "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/presets" && req.method === "GET") {
      // Featured trips for the first-run chips + IP-geo greeting (no permission prompt).
      // Also advertise the enabled model set (Opus gate) + default smart map so the
      // client selector renders only acceptable models.
      return Response.json(
        { ...buildPresets(req), enabledModels: enabledModels({ opus: !!env.DEMO_OPUS_ENABLED, deepseek: deepseekEnabled(env) }), smartMap: DEFAULT_SMART_MAP },
        { headers: cors() },
      );
    }
    if (url.pathname === "/stats" && req.method === "GET") {
      // Public cumulative engineering-stats — aggregates only, no per-exchange
      // rows. Edge-cached so D1 sees ~1 read/60s regardless of visitor volume.
      return handleStats(req, env);
    }

    // --- Self-serve onboarding (public tier) ---
    if (url.pathname === "/onboard" && req.method === "POST") {
      return handleOnboard(req, env, db);
    }

    // --- Auth ---
    if (url.pathname === "/auth" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      let code = "";
      try { code = (await req.json<{ code?: string }>()).code ?? ""; } catch { /* uniform 401 below */ }
      const hit = code ? await lookupByCode(db, code, env.CODE_HASH_KEY, new Date().toISOString()) : null;
      if (!hit) return text("this code isn't valid", 401); // uniform — no oracle
      const setCookie = await issueCookie({ sid: newSid(), codeId: hit.id, tier: hit.tier }, env.SESSION_SIGN_KEY, COOKIE_TTL_SEC, secure);
      return json({ ok: true, view: hit.view, tier: hit.tier }, 200, { "set-cookie": setCookie });
    }
    if (url.pathname === "/auth/me" && req.method === "GET") {
      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      return claims ? json({ ok: true, tier: claims.tier }) : text("no session", 401);
    }

    // --- Admin (Cloudflare Access in front; ADMIN_TOKEN fallback inside) ---
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(req, env, db);
    }

    // --- Chat (authed + per-code admission) ---
    if (url.pathname === "/chat" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      // Operational kill-switch for a public, money-spending endpoint.
      if (env.DEMO_DISABLED) return text("The Voygent demo is paused right now. Check back soon.", 503);

      // Auth gate: every /chat requires a valid server-issued session cookie.
      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      if (!claims) return text("unauthorized", 401);

      // Guardrail: pause once the global daily spend cap is reached.
      // Test/smoke runs (valid x-demo-test header) skip the cap.
      if (!isTestRequest(req, env) && await dailyBudgetExceeded(env)) {
        return text("The Voygent demo has hit its daily limit. Check back tomorrow.", 503);
      }

      const est = estMicros(env);
      const admitted = await admit(db, claims.codeId, est, new Date().toISOString(), utcDate());
      if (!admitted) {
        const reason = await admissionReason(db, claims.codeId, est, new Date().toISOString(), utcDate());
        const msg = reason === "lifetime"
          ? "This demo code's total budget is used up."
          : reason === "daily"
          ? "This demo code's daily limit is reached — try again tomorrow."
          : "This demo code is no longer active.";
        return text(msg, 503);
      }

      // Route to the DO keyed by the TRUSTED server-issued sid (never a client param).
      const id = env.SESSION.idFromName(claims.sid);
      const forward = new Request(req.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-code-id": claims.codeId, "x-est-micros": String(est) },
        body: req.body,
        // duplex is required in Node.js when forwarding a streaming body
        ...(req.body ? { duplex: "half" } : {}),
      } as RequestInit);
      return env.SESSION.get(id).fetch(forward);
    }

    return new Response("ok");
  },
};

// GET /stats — cumulative aggregates feeding the "Across all sessions" panel.
// Edge-cached via the Cache API (a max-age header alone protects only browsers,
// not scripted reads — Codex #4). Always 200 with a zero shape on error/unbound,
// so the panel just hides the section rather than surfacing a 500.
async function handleStats(req: Request, env: Env): Promise<Response> {
  // `caches.default` is a Workers-runtime extension (not in the DOM CacheStorage type).
  const cache = (caches as unknown as { default: Cache }).default;
  // One shared cache entry keyed on the bare path (ignore query/headers).
  const cacheKey = new Request(new URL("/stats", req.url).toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let shape = shapeStats(null);
  try {
    if (env.STATS_DB) {
      const row = await env.STATS_DB.prepare(STATS_AGG_SQL).first<StatsAggRow>();
      shape = shapeStats(row);
    }
  } catch { /* empty/zero shape on any D1 error or missing table */ }

  const res = Response.json(shape, {
    headers: { ...cors(), "cache-control": "public, max-age=60" },
  });
  try { await cache.put(cacheKey, res.clone()); } catch { /* cache write is best-effort */ }
  return res;
}

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
