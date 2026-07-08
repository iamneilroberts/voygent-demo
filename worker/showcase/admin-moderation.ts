import type { Db } from "../access/db";
import { json, text, guardMutation } from "../access/http";
import { listPending, moderate } from "./comments";
import { renderModerationPage } from "./render";

// Safety cap: the moderation page renders every pending row as HTML, so bound it.
const PENDING_LIMIT = 100;

/** Moderator identity for the audit columns: CF Access email if present, else admin-token. */
export function moderatorId(req: Request): string {
  return req.headers.get("cf-access-authenticated-user-email") || "admin-token";
}

/**
 * Handles /admin/comments (GET list) and /admin/comments/:id/{approve,reject} (POST).
 * Called from handleAdmin AFTER adminAuthed has already passed. CSRF defense on the
 * POSTs is guardMutation (Origin + content-type: application/json), matching the repo.
 * Returns 404 if the path is not a comments route (so handleAdmin can keep matching).
 */
export async function handleAdminComments(req: Request, env: { APP_ORIGIN: string }, db: Db): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/admin/comments" && req.method === "GET") {
    const pending = await listPending(db, PENDING_LIMIT);
    return new Response(renderModerationPage(pending), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const m = url.pathname.match(/^\/admin\/comments\/([^/]+)\/(approve|reject)$/);
  if (m && req.method === "POST") {
    const bad = guardMutation(req, env.APP_ORIGIN);
    if (bad) return bad;
    const id = decodeURIComponent(m[1]);
    const action = m[2] as "approve" | "reject";
    const changed = await moderate(db, id, action, moderatorId(req), Date.now());
    if (!changed) return json({ ok: false, error: "not_pending" }, 404);
    return json({ ok: true });
  }

  return text("not found", 404);
}
