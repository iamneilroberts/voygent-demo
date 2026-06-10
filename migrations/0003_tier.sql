-- DEMO_DB: credential access tier on each code.
-- Applied with: wrangler d1 execute voygent-demo --remote --file migrations/0003_tier.sql
ALTER TABLE codes ADD COLUMN tier TEXT NOT NULL DEFAULT 'public';
