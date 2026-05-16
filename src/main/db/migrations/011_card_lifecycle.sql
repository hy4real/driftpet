ALTER TABLE cards
ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'cooling'
CHECK (lifecycle_status IN ('hot', 'waiting', 'cooling', 'archived', 'dropped'));

ALTER TABLE cards
ADD COLUMN ttl_at INTEGER;

ALTER TABLE cards
ADD COLUMN recover_until INTEGER;

ALTER TABLE cards
ADD COLUMN thread_id TEXT;

ALTER TABLE cards
ADD COLUMN last_touched_at INTEGER;

ALTER TABLE cards
ADD COLUMN tomorrow_float_at INTEGER;

ALTER TABLE cards
ADD COLUMN tomorrow_floated_at INTEGER;

UPDATE cards
SET
  lifecycle_status = COALESCE(lifecycle_status, 'cooling'),
  ttl_at = COALESCE(ttl_at, ((strftime('%s', 'now', 'localtime', 'start of day', '+1 day') * 1000) - 1)),
  last_touched_at = COALESCE(last_touched_at, created_at);

CREATE INDEX IF NOT EXISTS idx_cards_lifecycle_ttl
ON cards(lifecycle_status, ttl_at);

CREATE INDEX IF NOT EXISTS idx_cards_recover_until
ON cards(recover_until);

CREATE INDEX IF NOT EXISTS idx_cards_thread_id
ON cards(thread_id);
