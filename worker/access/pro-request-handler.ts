import type { Db } from "./db";
import { json, text, guardMutation } from "./http";
import { hashCode, generateCode } from "./codes";
import { insertProRequest } from "./pro-requests";
import { sendEmail, proRequestEmail } from "../email/resend";

export interface ProRequestEnv {
  CODE_HASH_KEY: string; APP_ORIGIN: string;
  RESEND_API_KEY?: string; NEIL_NOTIFY_EMAIL?: string;
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function handleProRequest(req: Request, env: ProRequestEnv, db: Db): Promise<Response> {
  const bad = guardMutation(req, env.APP_ORIGIN); if (bad) return bad;
  let b: { name?: string; email?: string; company?: string; role?: string; useCase?: string; note?: string };
  try { b = await req.json(); } catch { return text("bad json", 400); }

  const name = (b.name ?? "").trim(); const email = (b.email ?? "").trim();
  if (!name || name.length > 120) return text("name required", 400);
  if (!EMAIL_RE.test(email) || email.length > 200) return text("valid email required", 400);
  const company = (b.company ?? "").trim().slice(0, 200);
  const role = (b.role ?? "").trim().slice(0, 120);
  const useCase = (b.useCase ?? "").trim().slice(0, 2000);
  const note = (b.note ?? "").trim().slice(0, 2000);

  const ip = req.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ipHash = await hashCode(ip, env.CODE_HASH_KEY);
  const id = "pro-" + generateCode().replace(/-/g, "").slice(0, 12);
  const createdAt = new Date().toISOString();

  await insertProRequest(db, { id, name, email, company, role, useCase, note, ipHash, createdAt });

  if (env.NEIL_NOTIFY_EMAIL) {
    const tpl = proRequestEmail({ name, email, company, role, useCase, note }, `${env.APP_ORIGIN}/admin`);
    await sendEmail(env, { to: env.NEIL_NOTIFY_EMAIL, subject: tpl.subject, html: tpl.html, text: tpl.text, replyTo: email });
  }
  return json({ ok: true });
}
