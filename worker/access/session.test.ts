import { describe, it, expect } from "vitest";
import { issueCookie, verifyCookie, newSid, COOKIE_NAME } from "./session";

const RING = '{"1":"signing-key-one"}';

describe("session cookie", () => {
  it("round-trips claims through a valid signed cookie", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, 43200, true);
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    const claims = await verifyCookie(`${COOKIE_NAME}=${value}`, RING);
    expect(claims).toEqual({ sid: "s1", codeId: "c1" });
  });

  it("rejects tampered, wrong-key, and absent cookies", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, 43200, true);
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    expect(await verifyCookie(`${COOKIE_NAME}=${value}x`, RING)).toBeNull();          // tampered
    expect(await verifyCookie(`${COOKIE_NAME}=${value}`, '{"1":"other"}')).toBeNull(); // wrong key
    expect(await verifyCookie(null, RING)).toBeNull();                                 // absent
    expect(await verifyCookie("unrelated=1", RING)).toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const setCookie = await issueCookie({ sid: "s1", codeId: "c1" }, RING, -1, true); // already expired
    const value = setCookie.split(";")[0].split("=").slice(1).join("=");
    expect(await verifyCookie(`${COOKIE_NAME}=${value}`, RING)).toBeNull();
  });

  it("newSid yields unique 128-bit ids", () => {
    const s = new Set(Array.from({ length: 100 }, () => newSid()));
    expect(s.size).toBe(100);
    expect(newSid()).toMatch(/^[0-9a-f]{32}$/);
  });
});
