import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { createCode, hashCode, generateCode } from "./codes";
import { usdToMicros } from "./money";
import { insertCodeMeta, countSignupsByIpHashSince } from "./meta";
import { sendEmail, demoCodeEmail } from "../email/resend";

export interface OnboardEnv {
  CODE_HASH_KEY: string;
  APP_ORIGIN: string;
  RESEND_API_KEY?: string;
  ONBOARD_IP_DAILY_CAP?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = new Set(["travel-pro", "tech-reviewer", "curious", "other", ""]);

export async function handleOnboard(req: Request, env: OnboardEnv, db: Db): Promise<Response> {
  const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
  let b: { name?: string; email?: string; role?: string; note?: string };
  try { b = await req.json(); } catch { return text("bad json", 400); }

  const name = (b.name ?? "").trim();
  const email = (b.email ?? "").trim();
  const role = (b.role ?? "").trim();
  const note = (b.note ?? "").trim();
  if (!name || name.length > 120) return text("name required", 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return text("valid email required", 400);
  if (note.length > 2000) return text("note too long", 400);
  if (!ROLES.has(role)) return text("invalid role", 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await hashCode(ip, env.CODE_HASH_KEY);
  const cap = Number(env.ONBOARD_IP_DAILY_CAP ?? "3");
  const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  if (await countSignupsByIpHashSince(db, ipHash, dayStart) >= cap) {
    return text("Too many signups from your network today — try again tomorrow or ask Neil directly.", 429);
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 86400_000).toISOString();
  const id = "self-" + generateCode().replace(/-/g, "").slice(0, 12);
  const { code } = await createCode(db, {
    id, label: `${name} <${email}>`, view: "default", tier: "public",
    dailyMicros: usdToMicros(2), totalMicros: usdToMicros(20), expiresAt,
  }, env.CODE_HASH_KEY, nowIso);

  await insertCodeMeta(db, {
    codeId: id, ownerName: name, ownerEmail: email, role, note,
    source: "self-serve", ipHash, createdAt: nowIso,
  });

  // Best-effort email — never blocks issuance.
  const tpl = demoCodeEmail(code, env.APP_ORIGIN);
  await sendEmail(env, { to: email, subject: tpl.subject, html: tpl.html, text: tpl.text });

  return json({ ok: true, code });
}
