import type { Db } from "./db";

export interface CodeRow {
  id: string; label: string; view: string;
  daily_micros: number; total_micros: number;
  day_date: string | null; day_spent: number; lifetime_spent: number;
  expires_at: string | null; revoked: number; created_at: string;
}
export interface SpendEvent {
  exchange_id: string; ts: string; est_micros: number; actual_micros: number;
  model: string | null; input_tokens: number | null; output_tokens: number | null;
}
export type AdmissionReason = "ok" | "revoked" | "expired" | "daily" | "lifetime";

const enc = new TextEncoder();

export async function hashCode(plaintext: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(plaintext));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Crockford base32 alphabet (no I, L, O, U — unambiguous).
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** 16 base32 chars × 5 bits = 80 bits of entropy, grouped 4-4-4-4 (e.g. k7m2-9x4p-w3rq-h8tn). */
export function generateCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] & 31];
  return out.replace(/(.{4})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4");
}

export interface NewCode {
  id: string; label: string; view: string;
  dailyMicros: number; totalMicros: number; expiresAt: string | null;
}

export async function createCode(
  db: Db, input: NewCode, hashKey: string, nowIso: string,
): Promise<{ code: string }> {
  const code = generateCode();
  const code_hash = await hashCode(code, hashKey);
  await db.run(
    `INSERT INTO codes (id, code_hash, label, view, daily_micros, total_micros, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [input.id, code_hash, input.label, input.view, input.dailyMicros, input.totalMicros, nowIso],
  );
  if (input.expiresAt) {
    await db.run("UPDATE codes SET expires_at=? WHERE id=?", [input.expiresAt, input.id]);
  }
  return { code };
}

export async function revokeCode(db: Db, id: string): Promise<void> {
  await db.run("UPDATE codes SET revoked=1 WHERE id=?", [id]);
}

/** Admin list — deliberately omits code_hash so the secret material never leaves the store. */
export async function listCodes(db: Db): Promise<CodeRow[]> {
  return db.all<CodeRow>(
    `SELECT id, label, view, daily_micros, total_micros, day_date, day_spent,
            lifetime_spent, expires_at, revoked, created_at FROM codes ORDER BY created_at DESC`,
  );
}

export async function usageForCode(db: Db, id: string, sinceTs: string): Promise<SpendEvent[]> {
  return db.all<SpendEvent>(
    `SELECT exchange_id, ts, est_micros, actual_micros, model, input_tokens, output_tokens
     FROM spend_events WHERE code_id=? AND ts>=? ORDER BY ts DESC`,
    [id, sinceTs],
  );
}

/** /auth lookup: live (not revoked, not expired) code by plaintext. */
export async function lookupByCode(
  db: Db, plaintext: string, hashKey: string, nowIso: string,
): Promise<{ id: string; view: string } | null> {
  const code_hash = await hashCode(plaintext, hashKey);
  return db.first<{ id: string; view: string }>(
    `SELECT id, view FROM codes
      WHERE code_hash=? AND revoked=0 AND (expires_at IS NULL OR expires_at > ?)`,
    [code_hash, nowIso],
  );
}

/**
 * Reserve budget for one exchange. A single conditional UPDATE (always routed to
 * D1's primary) atomically verifies live+budget and books `estMicros`. SQLite/D1
 * evaluate SET/WHERE against the PRE-update row, so the CASE correctly resets the
 * daily window when day_date is stale. Returns true iff exactly one row changed.
 *
 * Caps are inclusive — a code may be admitted to land exactly on its cap.
 * On a crash after admit() but before reconcile, the estimate stays booked (conservative).
 * Daily over-counts self-heal at the next UTC day rollover; lifetime over-counts do NOT
 * self-heal and require reconcile (Task 7) or admin correction.
 */
export async function admit(
  db: Db, codeId: string, estMicros: number, nowIso: string, today: string,
): Promise<boolean> {
  const est = estMicros < 0 ? 0 : estMicros; // never let a bad estimate refund budget
  const r = await db.run(
    `UPDATE codes
        SET day_spent      = (CASE WHEN day_date = ? THEN day_spent ELSE 0 END) + ?,
            day_date       = ?,
            lifetime_spent = lifetime_spent + ?
      WHERE id = ?
        AND revoked = 0
        AND (expires_at IS NULL OR expires_at > ?)
        AND (CASE WHEN day_date = ? THEN day_spent ELSE 0 END) + ? <= daily_micros
        AND lifetime_spent + ? <= total_micros`,
    [today, est, today, est, codeId, nowIso, today, est, est],
  );
  return r.changes === 1;
}

export interface ReconcileArgs {
  codeId: string; exchangeId: string; estMicros: number; actualMicros: number;
  model: string | null; inputTokens: number | null; outputTokens: number | null; ts: string;
}

/**
 * Replace the reserved estimate with the real cost AND record history in one
 * atomic batch(). The plain INSERT (no OR IGNORE) on a UNIQUE exchange_id means a
 * duplicate reconcile throws → the whole batch rolls back → the UPDATE can't
 * double-apply. We swallow that specific case so retries are safe no-ops.
 */
export async function reconcile(db: Db, a: ReconcileArgs): Promise<void> {
  try {
    await db.batch([
      {
        sql: `UPDATE codes SET day_spent = day_spent - ? + ?, lifetime_spent = lifetime_spent - ? + ? WHERE id = ?`,
        params: [a.estMicros, a.actualMicros, a.estMicros, a.actualMicros, a.codeId],
      },
      {
        sql: `INSERT INTO spend_events (code_id, exchange_id, ts, est_micros, actual_micros, model, input_tokens, output_tokens)
              VALUES (?,?,?,?,?,?,?,?)`,
        params: [a.codeId, a.exchangeId, a.ts, a.estMicros, a.actualMicros, a.model, a.inputTokens, a.outputTokens],
      },
    ]);
  } catch (e) {
    // UNIQUE(exchange_id) violation = already reconciled. Any other error rethrows.
    if (!String((e as Error)?.message ?? "").toUpperCase().includes("UNIQUE")) throw e;
  }
}

/** Only called after admit() returns false — classifies the 503 message. */
export async function admissionReason(
  db: Db, codeId: string, estMicros: number, nowIso: string, today: string,
): Promise<AdmissionReason> {
  const est = estMicros < 0 ? 0 : estMicros; // mirror admit()'s clamp so classifier agrees
  const row = await db.first<CodeRow>("SELECT * FROM codes WHERE id=?", [codeId]);
  if (!row) return "revoked";
  if (row.revoked) return "revoked";
  if (row.expires_at && row.expires_at <= nowIso) return "expired";
  const dayBase = row.day_date === today ? row.day_spent : 0;
  if (dayBase + est > row.daily_micros) return "daily";
  if (row.lifetime_spent + est > row.total_micros) return "lifetime";
  return "ok";
}
