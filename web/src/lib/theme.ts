// The five palettes defined in theme.css (data-theme variants). Amber is the
// confirmed default; the others remain available via the in-app switcher.
export const THEME_IDS = ["amber", "phosphor", "sodium", "dusk", "paper"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "amber";
export const THEME_STORAGE_KEY = "voygent-demo-theme";

// Coerce any stored/unknown string to a valid ThemeId, defaulting to amber.
export function normalizeTheme(raw: string | null | undefined): ThemeId {
  return (THEME_IDS as readonly string[]).includes(raw ?? "") ? (raw as ThemeId) : DEFAULT_THEME;
}

// Apply a theme to the document and persist it. Thin DOM/storage wrapper (not
// unit-tested — the logic under test is normalizeTheme). Guards storage so a
// blocked localStorage (private mode) never throws.
export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try { localStorage.setItem(THEME_STORAGE_KEY, id); } catch { /* storage blocked — ignore */ }
}

// Read the persisted theme (or default) without throwing if storage is blocked.
export function loadTheme(): ThemeId {
  try { return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY)); } catch { return DEFAULT_THEME; }
}
