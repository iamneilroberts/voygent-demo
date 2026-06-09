// Mode axis — orthogonal to skin (lib/skin.ts) and theme (lib/theme.ts).
// "live" is the normal interactive chat; "auto" plays a committed golden
// recording ("▶ Watch the demo"). Resolution: ?mode= URL param (wins +
// persists) → localStorage → default.
// Default is "auto": first-time visitors land on the autoplay golden run.
// Clicking "build your own" persists "live" so returning visitors stay live.
export const MODE_IDS = ["live", "auto"] as const;
export type ModeId = (typeof MODE_IDS)[number];
export const DEFAULT_MODE: ModeId = "auto";
export const MODE_STORAGE_KEY = "voygent-demo-mode";

export function normalizeMode(raw: string | null | undefined): ModeId {
  return (MODE_IDS as readonly string[]).includes(raw ?? "") ? (raw as ModeId) : DEFAULT_MODE;
}

export function resolveMode(param: string | null | undefined, stored: string | null | undefined): ModeId {
  if (param && (MODE_IDS as readonly string[]).includes(param)) return param as ModeId;
  return normalizeMode(stored);
}

export function persistMode(id: ModeId): void {
  try { localStorage.setItem(MODE_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

export function resolveInitialMode(): ModeId {
  let param: string | null = null;
  let stored: string | null = null;
  try { param = new URLSearchParams(window.location.search).get("mode"); } catch { /* default */ }
  try { stored = localStorage.getItem(MODE_STORAGE_KEY); } catch { /* ignore */ }
  return resolveMode(param, stored);
}
