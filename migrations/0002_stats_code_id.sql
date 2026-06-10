-- STATS_DB: link each engineering-stats row to the access code that ran it, so the
-- admin dashboard can group token/model/tool behavior by code (spend is already
-- linked via spend_events in DEMO_DB). Applied with:
--   wrangler d1 execute voygent-demo-stats --remote --file migrations/0002_stats_code_id.sql
ALTER TABLE session_stats ADD COLUMN code_id TEXT;
