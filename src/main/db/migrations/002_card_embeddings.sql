CREATE TABLE IF NOT EXISTS card_embeddings (
  card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
