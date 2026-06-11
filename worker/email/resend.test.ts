import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "./resend";

afterEach(() => { vi.restoreAllMocks(); });

describe("sendEmail", () => {
  it("no-ops when RESEND_API_KEY is unset", async () => {
    const r = await sendEmail({}, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it("posts to Resend with the from address and returns the id", async () => {
    let captured: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      captured = { url: _url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }));
    const r = await sendEmail({ RESEND_API_KEY: "k" }, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(captured.url).toBe("https://api.resend.com/emails");
    expect(captured.body.from).toBe("Voygent <support@voygent.ai>");
    expect(r.success).toBe(true);
    expect(r.messageId).toBe("msg_1");
  });

  it("returns an error (does not throw) on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad", name: "x" } }), { status: 422 })));
    const r = await sendEmail({ RESEND_API_KEY: "k" }, { to: "a@x.com", subject: "s", html: "<p>h</p>" });
    expect(r.success).toBe(false);
    expect(r.error).toBe("bad");
  });
});
