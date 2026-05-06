import type { CardRecord, RelatedCardRef } from "../types/card";
import { getDatabase } from "./client";

type CardRow = {
  id: number;
  item_id: number;
  title: string;
  use_for: string;
  knowledge_tag: string;
  summary_for_retrieval: string;
  related_card_ids: string | null;
  pet_remark: string;
  created_at: number;
};

const parseRelated = (value: string | null): RelatedCardRef[] => {
  if (value === null || value.length === 0) {
    return [];
  }

  try {
    return JSON.parse(value) as RelatedCardRef[];
  } catch {
    return [];
  }
};

const mapCardRow = (row: CardRow): CardRecord => {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    useFor: row.use_for,
    knowledgeTag: row.knowledge_tag,
    summaryForRetrieval: row.summary_for_retrieval,
    related: parseRelated(row.related_card_ids),
    petRemark: row.pet_remark,
    createdAt: row.created_at
  };
};

export const getRecentCards = (): CardRecord[] => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      id,
      item_id,
      title,
      use_for,
      knowledge_tag,
      summary_for_retrieval,
      related_card_ids,
      pet_remark,
      created_at
    FROM cards
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as CardRow[];

  return rows.map(mapCardRow);
};
