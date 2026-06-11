import type { Db } from "./db";

export interface CodeMeta {
  codeId: string;
  ownerName: string;
  ownerEmail: string;
  role: string;
  note: string;
  source: "self-serve" | "pro-grant" | "admin";
  ipHash: string;
  createdAt: string;
}

export async function insertCodeMeta(db: Db, m: CodeMeta): Promise<void> {
  await db.run(
    `INSERT INTO code_meta (code_id, owner_name, owner_email, role, note, source, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [m.codeId, m.ownerName, m.ownerEmail, m.role, m.note, m.source, m.ipHash, m.createdAt],
  );
}

/** Count self-serve signups from one ip_hash at or after a cutoff (for rate limiting). */
export async function countSignupsByIpHashSince(db: Db, ipHash: string, sinceIso: string): Promise<number> {
  const row = await db.first<{ n: number }>(
    "SELECT COUNT(*) AS n FROM code_meta WHERE ip_hash=? AND created_at>=?",
    [ipHash, sinceIso],
  );
  return row?.n ?? 0;
}
