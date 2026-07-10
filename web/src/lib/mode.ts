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

export function resolveMode(param: string | null | undefined, stored: string | null | undefined, reelParam?: string | null): ModeId {
  if (param && (MODE_IDS as readonly string[]).includes(param)) return param as ModeId;
  // An explicit ?reel= link is a request to WATCH that reel — it must not be
  // silently overridden by a persisted "live" from an earlier "build your own"
  // click (shared reel links would otherwise land returning visitors on the
  // live surface with no visible way back).
  if (reelParam) return "auto";
  return normalizeMode(stored);
}

export function persistMode(id: ModeId): void {
  try { localStorage.setItem(MODE_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

export function resolveInitialMode(): ModeId {
  let param: string | null = null;
  let reel: string | null = null;
  let stored: string | null = null;
  try {
    const search = new URLSearchParams(window.location.search);
    param = search.get("mode");
    reel = search.get("reel");
  } catch { /* default */ }
  try { stored = localStorage.getItem(MODE_STORAGE_KEY); } catch { /* ignore */ }
  return resolveMode(param, stored, reel);
}
