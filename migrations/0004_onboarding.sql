-- DEMO_DB: self-serve onboarding profile, kept separate from `codes` so PII is
-- purgeable independently and the hot codes table stays lean. 1:1 with codes.
-- Applied with: wrangler d1 execute voygent-demo --remote --file migrations/0004_onboarding.sql
CREATE TABLE code_meta (
  code_id     TEXT PRIMARY KEY REFERENCES codes(id),
  owner_name  TEXT,
  owner_email TEXT,
  role        TEXT,
  note        TEXT,
  source      TEXT NOT NULL,  -- 'self-serve' | 'pro-grant' | 'admin'
  ip_hash     TEXT,           -- HMAC(ip) for rate-limiting + attribution (never raw IP)
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_code_meta_iphash_created ON code_meta(ip_hash, created_at);
