// Guard for supplier/model-provided URLs before they become hrefs. The board
// detailUrl and the fixture activity/dining links come from outside our trust
// boundary; render them ONLY when they parse as http(s) — never javascript:,
// data:, or relative junk that could become an open-redirect/XSS surface
// (codex-review finding, 2026-06-07). Returns a normalized absolute URL string,
// or null to render no link.
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.toString();
}
