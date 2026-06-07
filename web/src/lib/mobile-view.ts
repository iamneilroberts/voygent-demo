// Mobile-only view state: which surface is showing on a phone. Chat is the base
// view; folio + engineering open as full-screen slide-up overlays. Ephemeral
// (always "chat" on load) — no URL/storage persistence by design.
export type MobileView = "chat" | "folio" | "engineering";
export const MOBILE_VIEWS: MobileView[] = ["chat", "folio", "engineering"];
export const DEFAULT_MOBILE_VIEW: MobileView = "chat";

/** Tapping a pill toggles its overlay: same target → back to chat, else open it. */
export function toggleMobileView(current: MobileView, target: Exclude<MobileView, "chat">): MobileView {
  return current === target ? "chat" : target;
}
