-- DEMO_DB: pro-access (real-credential) requests captured for Neil to vet + grant.
-- A pending row is created by POST /pro-request; admin grant creates a pro code and
-- links granted_code_id. Applied with:
--   wrangler d1 execute voygent-demo --remote --file migrations/0005_pro_requests.sql
CREATE TABLE pro_requests (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  company         TEXT,
  role            TEXT,
  use_case        TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'granted' | 'denied'
  ip_hash         TEXT,
  created_at      TEXT NOT NULL,
  reviewed_at     TEXT,
  granted_code_id TEXT REFERENCES codes(id)
);
CREATE INDEX idx_pro_requests_status ON pro_requests(status, created_at);
