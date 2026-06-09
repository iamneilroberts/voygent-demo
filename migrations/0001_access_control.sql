CREATE TABLE codes (
  id             TEXT PRIMARY KEY,
  code_hash      TEXT NOT NULL,
  label          TEXT NOT NULL,
  view           TEXT NOT NULL DEFAULT 'default',
  daily_micros   INTEGER NOT NULL,
  total_micros   INTEGER NOT NULL,
  day_date       TEXT,
  day_spent      INTEGER NOT NULL DEFAULT 0,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT,
  revoked        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_codes_hash ON codes(code_hash);

CREATE TABLE spend_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id       TEXT NOT NULL REFERENCES codes(id),
  exchange_id   TEXT NOT NULL UNIQUE,
  ts            TEXT NOT NULL,
  est_micros    INTEGER NOT NULL,
  actual_micros INTEGER NOT NULL,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER
);
CREATE INDEX idx_spend_code_ts ON spend_events(code_id, ts);
