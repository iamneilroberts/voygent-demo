import type { Db } from "../access/db";

export const NAME_MAX = 80;
export const BODY_MAX = 2000;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;     // 10 minutes
export const COMMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CommentInput {
  name: string;
  body: string;
  website: string; // honeypot — must be empty
}

export type ValidationResult =
  | { ok: true; name: string; body: string }
  | { ok: false; reason: "honeypot" | "empty" | "too_long" };

export function validateComment(input: CommentInput): ValidationResult {
  if ((input.website ?? "").trim() !== "") return { ok: false, reason: "honeypot" };
  const name = (input.name ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!name || !body) return { ok: false, reason: "empty" };
  if (name.length > NAME_MAX || body.length > BODY_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, name, body };
}

/** HMAC-SHA256(salt, normalized_ip) hex. Pseudonymous, NOT anonymized. Never store the raw IP. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  // Normalize: trim/lowercase, strip surrounding [brackets], then drop an IPv6 %zone.
  // The trailing split("]") is load-bearing for the [addr]%zone form, where the closing
  // bracket sits mid-string (not at the end) and survives the replace(/\]$/) above.
  const norm = (ip || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split("%")[0]
    .split("]")[0];
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(norm));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeSectionRef(
  ref: string | null | undefined,
  known: ReadonlySet<string>,
): string | null {
  if (!ref) return null;
  return known.has(ref) ? ref : null;
}

export interface CommentRow {
  id: string;
  created_at: number;
  author_name: string;
  body: string;
  section_ref: string | null;
}

/**
 * Best-effort rate limit (codex review noted the COUNT-then-INSERT race): can be beaten
 * by concurrent requests. Accepted for v1 because manual moderation is the real backstop.
 */
export async function withinRateLimit(
  db: Db,
  ipHash: string,
  now: number,
  windowMs: number,
  maxN: number,
): Promise<boolean> {
  const row = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM showcase_comments WHERE ip_hash = ? AND created_at > ?",
    [ipHash, now - windowMs],
  );
  return (row?.n ?? 0) < maxN;
}

export async function insertPending(
  db: Db,
  c: { id: string; createdAt: number; name: string; body: string; ipHash: string; sectionRef: string | null },
): Promise<void> {
  await db.run(
    "INSERT INTO showcase_comments (id, created_at, author_name, body, status, ip_hash, section_ref) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
    [c.id, c.createdAt, c.name, c.body, c.ipHash, c.sectionRef],
  );
}

/** Newest-first (DESC) — public display order. */
export async function listApproved(db: Db, limit: number): Promise<CommentRow[]> {
  return db.all<CommentRow>(
    "SELECT id, created_at, author_name, body, section_ref FROM showcase_comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

/** Oldest-first (ASC) — FIFO moderation queue. */
export async function listPending(db: Db, limit: number): Promise<CommentRow[]> {
  return db.all<CommentRow>(
    "SELECT id, created_at, author_name, body, section_ref FROM showcase_comments WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
    [limit],
  );
}

/**
 * Atomic transition: one conditional UPDATE guarded by status='pending', trusting
 * DbResult.changes. Avoids the SELECT-then-UPDATE race where two admins both transition
 * the same row and both see success. Returns true iff exactly this call transitioned a pending row.
 */
export async function moderate(
  db: Db,
  id: string,
  action: "approve" | "reject",
  by: string,
  now: number,
): Promise<boolean> {
  const status = action === "approve" ? "approved" : "rejected";
  const res = await db.run(
    "UPDATE showcase_comments SET status = ?, moderated_at = ?, moderated_by = ? WHERE id = ? AND status = 'pending'",
    [status, now, by, id],
  );
  return (res.changes ?? 0) > 0;
}

/** Retention sweep: drop old pending+rejected; keep approved. */
export async function pruneOld(db: Db, now: number, ttlMs: number): Promise<void> {
  await db.run(
    "DELETE FROM showcase_comments WHERE status IN ('pending','rejected') AND created_at < ?",
    [now - ttlMs],
  );
}
