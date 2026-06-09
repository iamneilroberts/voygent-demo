export { SessionDO } from "./session-do";
import { buildPresets } from "./presets";
import { D1Db, type Db } from "./access/db";
import { lookupByCode, admit, admissionReason } from "./access/codes";
import { issueCookie, verifyCookie, newSid } from "./access/session";
import { guardMutation, getCookieHeader, json, text } from "./access/http";
import { handleAdmin } from "./access/admin";

interface Env {
  SESSION: DurableObjectNamespace;
  DEMO_DISABLED?: string;
  DEMO_DB: D1Database;
  CODE_HASH_KEY: string;
  SESSION_SIGN_KEY: string;
  ADMIN_TOKEN?: string;
  APP_ORIGIN: string;
  EST_EXCHANGE_MICROS?: string;
  __db?: Db; // test seam: inject an in-memory Db
}

const COOKIE_TTL_SEC = 43200; // 12h
const DEFAULT_EST_MICROS = 250_000; // $0.25 conservative per-exchange reservation

function makeDb(env: Env): Db { return env.__db ?? new D1Db(env.DEMO_DB); }
function estMicros(env: Env): number { return Number(env.EST_EXCHANGE_MICROS ?? DEFAULT_EST_MICROS); }
function utcDate(): string { return new Date().toISOString().slice(0, 10); }

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

    // Public, no-auth endpoints.
    if (url.pathname === "/presets" && req.method === "GET") {
      return json(buildPresets(req));
    }

    // --- Auth ---
    if (url.pathname === "/auth" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      let code = "";
      try { code = (await req.json<{ code?: string }>()).code ?? ""; } catch { /* uniform 401 below */ }
      const hit = code ? await lookupByCode(db, code, env.CODE_HASH_KEY, new Date().toISOString()) : null;
      if (!hit) return text("this code isn't valid", 401); // uniform — no oracle
      const setCookie = await issueCookie({ sid: newSid(), codeId: hit.id }, env.SESSION_SIGN_KEY, COOKIE_TTL_SEC, secure);
      return json({ ok: true, view: hit.view }, 200, { "set-cookie": setCookie });
    }
    if (url.pathname === "/auth/me" && req.method === "GET") {
      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      return claims ? json({ ok: true }) : text("no session", 401);
    }

    // --- Admin (Cloudflare Access in front; ADMIN_TOKEN fallback inside) ---
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      return handleAdmin(req, env, db);
    }

    // --- Chat (authed + per-code admission) ---
    if (url.pathname === "/chat" && req.method === "POST") {
      const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
      if (env.DEMO_DISABLED) return text("The Voygent demo is paused right now. Check back soon.", 503);

      const claims = await verifyCookie(getCookieHeader(req), env.SESSION_SIGN_KEY);
      if (!claims) return text("unauthorized", 401);

      if (await dailyBudgetExceeded(env)) {
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
      });
      return env.SESSION.get(id).fetch(forward);
    }

    return new Response("ok");
  },
};
