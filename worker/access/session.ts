export const COOKIE_NAME = "__Host-demo_session";
export interface SessionClaims { sid: string; codeId: string }

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlToStr = (s: string): string =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/"));

function parseRing(ring: string): Record<string, string> {
  try { const o = JSON.parse(ring); if (o && typeof o === "object") return o; } catch { /* plain */ }
  return { "0": ring }; // a bare secret string is kid "0"
}
function activeKid(ring: Record<string, string>): string {
  return Object.keys(ring).sort().pop()!; // highest kid is current
}
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function newSid(): string {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function issueCookie(
  claims: SessionClaims, ring: string, ttlSec: number, secure: boolean, nowMs = Date.now(),
): Promise<string> {
  const r = parseRing(ring); const kid = activeKid(r);
  const exp = Math.floor(nowMs / 1000) + ttlSec;
  const payload = b64url(enc.encode(JSON.stringify({ sid: claims.sid, codeId: claims.codeId, exp, kid })));
  const sig = await hmac(r[kid], payload);
  const value = `${payload}.${sig}`;
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.max(0, ttlSec)}`];
  if (secure) attrs.push("Secure");
  return `${COOKIE_NAME}=${value}; ${attrs.join("; ")}`;
}

export async function verifyCookie(cookieHeader: string | null, ring: string, nowMs = Date.now()): Promise<SessionClaims | null> {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!m) return null;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig) return null;
  let claims: { sid: string; codeId: string; exp: number; kid: string };
  try { claims = JSON.parse(b64urlToStr(payload)); } catch { return null; }
  const r = parseRing(ring);
  const key = r[claims.kid]; if (!key) return null;
  const expected = await hmac(key, payload);
  if (!timingSafeEqual(expected, sig)) return null;
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(nowMs / 1000)) return null;
  return { sid: claims.sid, codeId: claims.codeId };
}
