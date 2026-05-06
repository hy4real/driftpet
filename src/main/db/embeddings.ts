import { getEmbeddingRuntimeConfig } from "../llm/config";
import { getDatabase } from "./client";

type RecallCandidateRow = {
  card_id: number;
  item_id: number;
  title: string;
  summary_for_retrieval: string;
  created_at: number;
  vector_json: string | null;
};

export type RecallCandidate = {
  cardId: number;
  itemId: number;
  title: string;
  summaryForRetrieval: string;
  createdAt: number;
  embedding: number[] | null;
};

const parseVector = (value: string | null): number[] | null => {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const upsertCardEmbedding = (cardId: number, vector: number[]): void => {
  const config = getEmbeddingRuntimeConfig();
  if (config.provider === "disabled" || config.model === null) {
    return;
  }

  const db = getDatabase();
  db.prepare(`
    INSERT INTO card_embeddings (card_id, provider, model, vector_json, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(card_id) DO UPDATE SET
      provider = excluded.provider,
      model = excluded.model,
      vector_json = excluded.vector_json,
      created_at = excluded.created_at
  `).run(
    cardId,
    config.provider,
    config.model,
    JSON.stringify(vector),
    Date.now()
  );
};

export const listRecallCandidates = (excludeItemId: number, limit: number): RecallCandidate[] => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      cards.id AS card_id,
      cards.item_id AS item_id,
      cards.title AS title,
      cards.summary_for_retrieval AS summary_for_retrieval,
      cards.created_at AS created_at,
      card_embeddings.vector_json AS vector_json
    FROM cards
    LEFT JOIN card_embeddings ON card_embeddings.card_id = cards.id
    WHERE cards.item_id <> ?
    ORDER BY cards.created_at DESC
    LIMIT ?
  `).all(excludeItemId, limit) as RecallCandidateRow[];

  return rows.map((row) => ({
    cardId: row.card_id,
    itemId: row.item_id,
    title: row.title,
    summaryForRetrieval: row.summary_for_retrieval,
    createdAt: row.created_at,
    embedding: parseVector(row.vector_json)
  }));
};
