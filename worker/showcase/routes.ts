import type { Db } from "../access/db";
import { SECTIONS, KNOWN_SECTION_IDS } from "./config";
import { parseBuildLog } from "./buildlog";
import changelogRaw from "./changelog.json";
import { renderShowcasePage } from "./render";
import {
  validateComment,
  hashIp,
  withinRateLimit,
  insertPending,
  listApproved,
  pruneOld,
  normalizeSectionRef,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  COMMENT_TTL_MS,
} from "./comments";

export interface ShowcaseEnv {
  SHOWCASE_ENABLED?: string;
  COMMENT_IP_SALT?: string;
}

const MAX_BODY_BYTES = 8192;
const APPROVED_LIMIT = 50;

export const SHOWCASE_CSP =
  "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": SHOWCASE_CSP,
    },
  });
}

/** Always-neutral submit acknowledgement (no oracle for honeypot/rate-limit). */
function neutralAck(): Response {
  return htmlResponse(
    '<!doctype html><meta charset="utf-8"><title>Thanks</title>' +
      "<p>Thanks — your comment is held for review.</p>" +
      '<p><a href="/showcase">Back to the showcase</a></p>',
    200,
  );
}

/**
 * GET /showcase — inert (404) unless SHOWCASE_ENABLED. Degrades gracefully if the
 * comments table/D1 is unavailable (renders page WITHOUT comments rather than throwing).
 */
export async function handleShowcase(req: Request, env: ShowcaseEnv, db: Db): Promise<Response> {
  if (!env.SHOWCASE_ENABLED) return new Response("not found", { status: 404 });

  const now = Date.now();
  let comments: Awaited<ReturnType<typeof listApproved>> = [];
  // Fail-closed UX: if the salt is missing the POST would 503, so hide the comment form
  // here too — never render a form that cannot be submitted.
  let showComments = !!env.COMMENT_IP_SALT && !!db;
  if (showComments) {
    try {
      await pruneOld(db, now, COMMENT_TTL_MS);          // retention sweep (best-effort)
      comments = await listApproved(db, APPROVED_LIMIT);
    } catch {
      // Migration not applied / D1 unavailable -> hide comments, do not throw.
      showComments = false;
      comments = [];
    }
  }

  const buildlog = parseBuildLog(changelogRaw as any);
  const html = renderShowcasePage({ sections: SECTIONS, buildlog, comments, showComments });
  return htmlResponse(html, 200);
}

/**
 * POST /showcase/comments — public, unauthenticated, hardened fail-closed.
 * Order: inert -> preconditions(503) -> content-type(415) -> size cap(413) ->
 * parse -> honeypot/length -> hash IP -> rate limit -> insert pending -> neutral ack.
 */
export async function handleShowcaseComment(req: Request, env: ShowcaseEnv, db: Db): Promise<Response> {
  if (!env.SHOWCASE_ENABLED) return new Response("not found", { status: 404 });

  // Fail closed if the salt or D1 is missing. Never write without them.
  if (!env.COMMENT_IP_SALT || !db) {
    return new Response("comments unavailable", { status: 503 });
  }

  const ctype = req.headers.get("content-type") || "";
  if (!ctype.includes("application/x-www-form-urlencoded")) {
    return new Response("unsupported media type", { status: 415 });
  }

  // Body-size cap via Content-Length header fast-path (if present). We re-check
  // actual UTF-8 byte length after reading so a lying or absent header can't slip
  // past. A missing header is allowed — we cap via the byte-length check below.
  const lenHeader = req.headers.get("content-length");
  if (lenHeader !== null) {
    const len = Number(lenHeader);
    if (!Number.isFinite(len) || len > MAX_BODY_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
  }

  let form: URLSearchParams;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return new Response("payload too large", { status: 413 });
    }
    form = new URLSearchParams(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const validated = validateComment({
    name: form.get("name") || "",
    body: form.get("body") || "",
    website: form.get("website") || "",
  });

  // Honeypot: silently drop with the SAME neutral ack (no oracle).
  if (!validated.ok && validated.reason === "honeypot") return neutralAck();
  // Empty/over-length: legit UX, return a 400 (not an oracle for spam logic).
  if (!validated.ok) return new Response("invalid comment", { status: 400 });

  const now = Date.now();
  const ipHash = await hashIp(req.headers.get("cf-connecting-ip") || "", env.COMMENT_IP_SALT);
  const sectionRef = normalizeSectionRef(form.get("section_ref"), KNOWN_SECTION_IDS);
  const id = crypto.randomUUID();

  // Fail-closed on ANY D1 error: a missing showcase_comments table or a D1 outage makes
  // withinRateLimit/insertPending throw — that must be a controlled 503, never an
  // unhandled 500 that leaks a stack or silently writes nothing.
  try {
    const ok = await withinRateLimit(db, ipHash, now, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX);
    if (!ok) return neutralAck();
    await insertPending(db, { id, createdAt: now, name: validated.name, body: validated.body, ipHash, sectionRef });
  } catch {
    return new Response("comments unavailable", { status: 503 });
  }
  return neutralAck();
}
