import { describe, it, expect, vi } from "vitest";
import { readCodeFromHash } from "./gate";

describe("readCodeFromHash", () => {
  it("extracts the code and strips the fragment via replaceState", () => {
    const replaceState = vi.fn();
    const loc = { hash: "#code=k7m2-9x4p-w3rq-h8tn", pathname: "/", search: "" };
    const code = readCodeFromHash(loc as any, { replaceState } as any);
    expect(code).toBe("k7m2-9x4p-w3rq-h8tn");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });
  it("returns null when there is no code fragment", () => {
    const replaceState = vi.fn();
    expect(readCodeFromHash({ hash: "", pathname: "/", search: "" } as any, { replaceState } as any)).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
