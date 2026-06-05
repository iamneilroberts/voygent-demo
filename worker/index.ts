export { SessionDO } from "./session-do";

interface Env { SESSION: DurableObjectNamespace; DEMO_DISABLED?: string; }

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
