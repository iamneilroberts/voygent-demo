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

/** 20 chars of base32 ≈ 100 bits printed, drawn from 160 random bits → grouped 4-4-4-4. */
export function generateCode(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] & 31];
  return out.replace(/(.{4})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4");
}
