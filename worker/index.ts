export { SessionDO } from "./session-do";
import { buildPresets } from "./presets";
import { infoPageHtml } from "./info/pages";
import { enabledModels, DEFAULT_SMART_MAP } from "../shared/models";
import { STATS_AGG_SQL, shapeStats, type StatsAggRow } from "./stats";

interface Env { SESSION: DurableObjectNamespace; DEMO_DISABLED?: string; DEMO_OPUS_ENABLED?: string; DEMO_TEST_TOKEN?: string; DEMO_PHASE_MACHINE?: string; STATS_DB?: D1Database; }

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
    const s = await res.json<{ over: boolean }>();
    return !!s.over;
  } catch { return false; } // never let a ledger hiccup hard-block the demo
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (url.pathname.startsWith("/info/") && req.method === "GET") {
      // Worker-served brag/info pages (standalone HTML, no SPA bundle). An
      // unknown slug falls through to the SPA so deep links never hard-404.
      const slug = url.pathname.slice("/info/".length).replace(/\/$/, "");
      const html = infoPageHtml(slug);
      if (html) {
        return new Response(html, { headers: { ...cors(), "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
      }
      // Unknown info slug → send them to the demo rather than a bare "ok".
      return Response.redirect(new URL("/", url).toString(), 302);
    }
    if (url.pathname === "/presets" && req.method === "GET") {
      // Featured trips for the first-run chips + IP-geo greeting (no permission prompt).
      // Also advertise the enabled model set (Opus gate) + default smart map so the
      // client selector renders only acceptable models.
      return Response.json(
        { ...buildPresets(req), enabledModels: enabledModels(!!env.DEMO_OPUS_ENABLED), smartMap: DEFAULT_SMART_MAP },
        { headers: cors() },
      );
    }
    if (url.pathname === "/stats" && req.method === "GET") {
      // Public cumulative engineering-stats — aggregates only, no per-exchange
      // rows. Edge-cached so D1 sees ~1 read/60s regardless of visitor volume.
      return handleStats(req, env);
    }
    if (url.pathname === "/chat" && req.method === "POST") {
      // Operational kill-switch for a public, money-spending endpoint: set the
      // DEMO_DISABLED secret to pause it instantly (no redeploy needed).
      if (env.DEMO_DISABLED) {
        return new Response("The Voygent demo is paused right now. Check back soon.", {
          status: 503,
          headers: { ...cors(), "content-type": "text/plain" },
        });
      }
      // Guardrail: pause automatically once the global daily spend cap is reached.
      // Test/smoke runs (valid x-demo-test header) skip the cap.
      if (!isTestRequest(req, env) && await dailyBudgetExceeded(env)) {
        return new Response("The Voygent demo has hit its daily limit. Check back tomorrow.", {
          status: 503,
          headers: { ...cors(), "content-type": "text/plain" },
        });
      }
      const sessionId = url.searchParams.get("session") ?? "anon";
      const id = env.SESSION.idFromName(sessionId);
      const res = await env.SESSION.get(id).fetch(req);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors())) headers.set(k, v);
      return new Response(res.body, { headers });
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
