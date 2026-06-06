// Skin axis — orthogonal to the data-theme palette axis (lib/theme.ts).
// A skin is a structural identity: "board" is the amber departure-board default;
// "claude" is the claude.ai-lookalike split screen. A future "chatgpt" skin
// extends SKIN_IDS. Resolution: ?skin= URL param (wins + persists) → localStorage
// → default. Set via <html data-skin="…"> AND React state (component trees differ
// per skin, so CSS alone can't switch).
export const SKIN_IDS = ["board", "claude"] as const;
export type SkinId = (typeof SKIN_IDS)[number];
export const DEFAULT_SKIN: SkinId = "board";
export const SKIN_STORAGE_KEY = "voygent-demo-skin";

// Coerce any stored/unknown string to a valid SkinId, defaulting to board.
export function normalizeSkin(raw: string | null | undefined): SkinId {
  return (SKIN_IDS as readonly string[]).includes(raw ?? "") ? (raw as SkinId) : DEFAULT_SKIN;
}

// Pure precedence logic (unit-tested): an explicit, KNOWN ?skin= param wins;
// an unknown/absent param falls back to the stored value, then the default.
export function resolveSkin(param: string | null | undefined, stored: string | null | undefined): SkinId {
  if (param && (SKIN_IDS as readonly string[]).includes(param)) return param as SkinId;
  return normalizeSkin(stored);
}

// Apply a skin to the document and persist it. Thin DOM/storage wrapper (not
// unit-tested — the logic under test is resolveSkin/normalizeSkin). Guards
// storage so a blocked localStorage (private mode) never throws.
export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id;
  try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

// Resolve the initial skin from the URL + storage (?skin=claude is sticky:
// it persists via the applySkin the caller performs on mount).
export function resolveInitialSkin(): SkinId {
  let param: string | null = null;
  let stored: string | null = null;
  try { param = new URLSearchParams(window.location.search).get("skin"); } catch { /* no window/URL — default */ }
  try { stored = localStorage.getItem(SKIN_STORAGE_KEY); } catch { /* storage blocked — ignore */ }
  return resolveSkin(param, stored);
}
