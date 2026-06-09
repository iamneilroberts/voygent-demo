// D1 override layer for /info deep-dive pages. The render path prefers a row
// here over the hardcoded PAGES seed in pages.ts; Revert deletes the row and
// the page falls back to source. Pure D1 access — no rendering, no auth.
import type { Db } from "../access/db";

export interface PageOverride {
  slug: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  updated_at: number;
}

export interface OverrideFields {
  title: string | null;
  subtitle: string | null;
  body: string | null;
}

/**
 * Read an override. Swallows DB errors (missing table / unbound binding) and
 * returns null so the render path degrades gracefully to the source default.
 */
export async function getOverride(db: Db, slug: string): Promise<PageOverride | null> {
  try {
    return await db.first<PageOverride>(
      "SELECT slug, title, subtitle, body, updated_at FROM info_page_overrides WHERE slug = ?",
      [slug],
    );
  } catch {
    return null;
  }
}

/** Upsert an override. Write errors propagate so the caller can surface a real failure. */
export async function putOverride(db: Db, slug: string, fields: OverrideFields, nowMs: number): Promise<void> {
  await db.run(
    `INSERT INTO info_page_overrides (slug, title, subtitle, body, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       subtitle = excluded.subtitle,
       body = excluded.body,
       updated_at = excluded.updated_at`,
    [slug, fields.title, fields.subtitle, fields.body, nowMs],
  );
}

/** Delete an override (Revert to source default). No-op if absent. */
export async function deleteOverride(db: Db, slug: string): Promise<void> {
  await db.run("DELETE FROM info_page_overrides WHERE slug = ?", [slug]);
}
