export { SessionDO } from "./session-do";

interface Env { SESSION: DurableObjectNamespace; }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors() });
    if (url.pathname === "/chat" && req.method === "POST") {
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
