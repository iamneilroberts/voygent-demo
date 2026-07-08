export interface RawEntry {
  date?: unknown;
  text?: unknown;
}

export interface BuildLogEntry {
  date: string; // YYYY-MM-DD
  text: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the committed build-log source (changelog.json) into clean, sorted entries.
 * This is the ONLY input to the build-log. Malformed rows are dropped (defensive).
 */
export function parseBuildLog(raw: RawEntry[]): BuildLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BuildLogEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const date = (row as RawEntry).date;
    const text = (row as RawEntry).text;
    if (typeof date !== "string" || !DATE_RE.test(date)) continue;
    if (typeof text !== "string" || text.trim() === "") continue;
    out.push({ date, text: text.trim() });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
