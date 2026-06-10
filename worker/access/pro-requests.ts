import type { Db } from "./db";

export interface NewProRequest {
  id: string; name: string; email: string; company: string; role: string;
  useCase: string; note: string; ipHash: string; createdAt: string;
}
export interface ProRequestRow extends NewProRequest {
  status: string; reviewed_at: string | null; granted_code_id: string | null;
}

export async function insertProRequest(db: Db, r: NewProRequest): Promise<void> {
  await db.run(
    `INSERT INTO pro_requests (id, name, email, company, role, use_case, note, ip_hash, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [r.id, r.name, r.email, r.company, r.role, r.useCase, r.note, r.ipHash, r.createdAt],
  );
}

export async function listPending(db: Db): Promise<ProRequestRow[]> {
  return db.all<ProRequestRow>(
    "SELECT * FROM pro_requests WHERE status='pending' ORDER BY created_at DESC");
}

export async function getRequest(db: Db, id: string): Promise<ProRequestRow | null> {
  return db.first<ProRequestRow>("SELECT * FROM pro_requests WHERE id=?", [id]);
}

export async function markGranted(db: Db, id: string, codeId: string, reviewedAt: string): Promise<void> {
  await db.run(
    "UPDATE pro_requests SET status='granted', granted_code_id=?, reviewed_at=? WHERE id=?",
    [codeId, reviewedAt, id]);
}

export async function markDenied(db: Db, id: string, reviewedAt: string): Promise<void> {
  await db.run("UPDATE pro_requests SET status='denied', reviewed_at=? WHERE id=?", [reviewedAt, id]);
}
