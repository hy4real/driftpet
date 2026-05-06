CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  raw_url TEXT,
  raw_text TEXT,
  extracted_title TEXT,
  extracted_text TEXT,
  content_hash TEXT,
  tg_message_id TEXT,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_content_hash
ON items(content_hash)
WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  title TEXT,
  use_for TEXT,
  knowledge_tag TEXT,
  summary_for_retrieval TEXT,
  related_card_ids TEXT,
  pet_remark TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prefs (
  key TEXT PRIMARY KEY,
  value TEXT
);
