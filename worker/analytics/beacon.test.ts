import { describe, it, expect } from "vitest";
import { BEACON_TAG, injectBeacon } from "./beacon";

describe("demo beacon", () => {
  it("is configured for demo → voygent.ai cross-origin", () => {
    expect(BEACON_TAG).toContain('SITE="demo"');
    expect(BEACON_TAG).toContain('EP="https://voygent.ai/api/pv"');
    expect(BEACON_TAG).toContain('SIB="voygent.ai"');
    expect(BEACON_TAG.startsWith("<script>")).toBe(true);
    expect(BEACON_TAG.endsWith("</script>")).toBe(true);
  });

  it("has no unescaped </script> that would break the inline tag", () => {
    const body = BEACON_TAG.slice("<script>".length, -"</script>".length);
    expect(body.toLowerCase()).not.toContain("</script>");
  });

  it("injects before </body>, idempotently", () => {
    const out = injectBeacon("<html><body><h1>hi</h1></body></html>");
    expect(out).toContain(BEACON_TAG + "</body>");
    expect(injectBeacon(out)).toBe(out); // no double-inject
  });

  it("falls back to </html> then append", () => {
    expect(injectBeacon("<html>x</html>")).toContain(BEACON_TAG + "</html>");
    expect(injectBeacon("bare")).toBe("bare" + BEACON_TAG);
  });
});
