// Worker-native Resend sender (ported from voygent-lite/src/email/resend.ts).
// Gated on RESEND_API_KEY: no-ops when unset so the feature ships dark.
// Never throws — all failures are returned.
const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_EMAIL = "Voygent <support@voygent.ai>";

export interface ResendEnv { RESEND_API_KEY?: string }
export interface EmailOptions { to: string; subject: string; html: string; text?: string; replyTo?: string }
export interface EmailResult { success: boolean; messageId?: string; error?: string }
interface ResendResponse { id?: string; error?: { message: string; name: string } }

export async function sendEmail(env: ResendEnv, opts: EmailOptions): Promise<EmailResult> {
  if (!env.RESEND_API_KEY) return { success: false, error: "Email service not configured" };
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL, to: opts.to, subject: opts.subject,
        html: opts.html, text: opts.text, reply_to: opts.replyTo || "support@voygent.ai",
      }),
    });
    const result = (await res.json()) as ResendResponse;
    if (!res.ok || result.error) return { success: false, error: result.error?.message || `HTTP ${res.status}` };
    return { success: true, messageId: result.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// --- templates ---
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

export function demoCodeEmail(code: string, appOrigin: string): { subject: string; html: string; text: string } {
  const link = `${appOrigin}/?mode=live#code=${encodeURIComponent(code)}`;
  return {
    subject: "Your Voygent demo access code",
    html: `<p>Welcome to the Voygent demo.</p>
<p>Your access code: <strong>${esc(code)}</strong></p>
<p><a href="${link}">Open the live demo →</a></p>
<p style="color:#666;font-size:13px">This public demo searches public sources. Reply if you'd like a full credentialed walkthrough.</p>`,
    text: `Your Voygent demo access code: ${code}\nOpen: ${link}\n`,
  };
}

export function proRequestEmail(p: { name: string; email: string; company: string; role: string; useCase: string; note: string }, adminUrl: string): { subject: string; html: string; text: string } {
  return {
    subject: `Voygent pro-access request — ${p.name}`,
    html: `<p><strong>New pro-access request</strong></p>
<ul>
<li>Name: ${esc(p.name)}</li><li>Email: ${esc(p.email)}</li>
<li>Company: ${esc(p.company)}</li><li>Role: ${esc(p.role)}</li>
<li>Use case: ${esc(p.useCase)}</li><li>Note: ${esc(p.note)}</li>
</ul>
<p><a href="${adminUrl}">Review in admin →</a></p>`,
    text: `Pro-access request\nName: ${p.name}\nEmail: ${p.email}\nCompany: ${p.company}\nRole: ${p.role}\nUse case: ${p.useCase}\nNote: ${p.note}\nReview: ${adminUrl}\n`,
  };
}

export function proGrantedEmail(code: string, appOrigin: string): { subject: string; html: string; text: string } {
  const link = `${appOrigin}/?mode=live#code=${encodeURIComponent(code)}`;
  return {
    subject: "Your Voygent pro demo access is ready",
    html: `<p>Your pro-access code is ready: <strong>${esc(code)}</strong></p>
<p><a href="${link}">Open the live demo →</a></p>`,
    text: `Your Voygent pro access code: ${code}\nOpen: ${link}\n`,
  };
}
