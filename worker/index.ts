export { SessionDO } from "./session-do";
import { buildPresets } from "./presets";
import { infoPageHtml } from "./info/pages";
import { enabledModels, DEFAULT_SMART_MAP } from "../shared/models";

interface Env { SESSION: DurableObjectNamespace; DEMO_DISABLED?: string; DEMO_OPUS_ENABLED?: string; }

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
      if (await dailyBudgetExceeded(env)) {
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

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}
