-- 0006_showcase_comments.sql
-- Public showcase moderated comments. Apply with:
--   wrangler d1 migrations apply voygent-demo --remote
-- (or: wrangler d1 execute voygent-demo --remote --file migrations/0006_showcase_comments.sql)
CREATE TABLE IF NOT EXISTS showcase_comments (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,          -- epoch ms
  author_name   TEXT NOT NULL CHECK (length(author_name) <= 80),
  body          TEXT NOT NULL CHECK (length(body) <= 2000),
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  ip_hash       TEXT NOT NULL,             -- HMAC-SHA256(COMMENT_IP_SALT, normalized_ip)
  section_ref   TEXT,                      -- validated against known section ids, else NULL
  moderated_at  INTEGER,                   -- epoch ms, set on approve/reject
  moderated_by  TEXT                       -- moderator identity, set on approve/reject
);
CREATE INDEX IF NOT EXISTS idx_showcase_comments_status_created
  ON showcase_comments (status, created_at);
CREATE INDEX IF NOT EXISTS idx_showcase_comments_iphash_created
  ON showcase_comments (ip_hash, created_at);
