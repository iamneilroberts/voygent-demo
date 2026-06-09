-- DEMO_DB migration 0002 — in-place /info deep-dive page edits.
-- Override layer: render prefers a row here over the hardcoded pages.ts seed.
-- Applied manually (no migrations_dir; `wrangler deploy` does NOT apply schema):
--   wrangler d1 execute voygent-demo --remote --file migrations/0002_info_overrides.sql
CREATE TABLE info_page_overrides (
  slug       TEXT PRIMARY KEY,
  title      TEXT,
  subtitle   TEXT,
  body       TEXT,
  updated_at INTEGER NOT NULL
);
