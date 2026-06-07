import { describe, it, expect } from "vitest";
import { safeHttpUrl } from "./url";

describe("safeHttpUrl", () => {
  it("accepts http(s) and normalizes", () => {
    expect(safeHttpUrl("https://cpmaxx.example/sheet/1")).toBe("https://cpmaxx.example/sheet/1");
    expect(safeHttpUrl("http://x.test/a")).toBe("http://x.test/a");
  });
  it("rejects dangerous and malformed schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("/relative/path")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
  it("rejects empty/non-strings", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
  });
});
