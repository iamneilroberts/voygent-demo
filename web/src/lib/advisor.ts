// Advisor-view axis — orthogonal to skin (lib/skin.ts), theme (lib/theme.ts)
// and mode (lib/mode.ts). Off (default) = traveler view. On = advisor view:
// commission shown per item + a trip total, from REAL supplier data only
// (cpmaxx-sourced candidates/lodging carry commission; serp ones never do —
// absent data renders nothing, never an estimate).
// Resolution mirrors lib/mode.ts: ?advisor= URL param (wins) → localStorage → off.
export const ADVISOR_STORAGE_KEY = "voygent-demo-advisor";

export function resolveAdvisor(param: string | null | undefined, stored: string | null | undefined): boolean {
  if (param === "1" || param === "on") return true;
  if (param === "0" || param === "off") return false;
  return stored === "1";
}

export function persistAdvisor(on: boolean): void {
  try { localStorage.setItem(ADVISOR_STORAGE_KEY, on ? "1" : "0"); } catch { /* storage blocked — ignore */ }
}

export function resolveInitialAdvisor(): boolean {
  let param: string | null = null;
  let stored: string | null = null;
  try { param = new URLSearchParams(window.location.search).get("advisor"); } catch { /* default */ }
  try { stored = localStorage.getItem(ADVISOR_STORAGE_KEY); } catch { /* ignore */ }
  return resolveAdvisor(param, stored);
}

export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** One commission chip's text, e.g. "+$2,437 comm (30%)". */
export function commissionLabel(commission: number, pct?: number): string {
  return `+${fmtUsd(commission)} comm${typeof pct === "number" ? ` (${pct}%)` : ""}`;
}

/** Sum the commissions that exist; null when none do (render nothing — never $0). */
export function commissionTotal(items: Array<{ commission?: number }>): number | null {
  const vals = items.map((i) => i.commission).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}
