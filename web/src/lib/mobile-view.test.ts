import { describe, it, expect } from "vitest";
import { toggleMobileView, DEFAULT_MOBILE_VIEW } from "./mobile-view";

describe("mobile-view", () => {
  it("defaults to chat", () => {
    expect(DEFAULT_MOBILE_VIEW).toBe("chat");
  });
  it("opens an overlay from chat, and the same pill closes it", () => {
    expect(toggleMobileView("chat", "folio")).toBe("folio");
    expect(toggleMobileView("folio", "folio")).toBe("chat");
    expect(toggleMobileView("chat", "engineering")).toBe("engineering");
    expect(toggleMobileView("engineering", "engineering")).toBe("chat");
  });
  it("switches directly between overlays", () => {
    expect(toggleMobileView("folio", "engineering")).toBe("engineering");
  });
});
