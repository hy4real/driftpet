import type { CardRecord, RelatedCardRef, ThreadCache } from "../types/card";
import { getClaudeDispatchPrefKey, parseClaudeDispatchMeta } from "../claude/dispatch";
import { getDatabase } from "./client";
import { getPref } from "./prefs";

type CardRow = {
  id: number;
  item_id: number;
  title: string;
  use_for: string;
  knowledge_tag: string;
  summary_for_retrieval: string;
  thread_cache_json: string | null;
  related_card_ids: string | null;
  pet_remark: string;
  created_at: number;
};

export type { CardRow };

export const parseRelated = (value: string | null): RelatedCardRef[] => {
  if (value === null || value.length === 0) {
    return [];
  }

  try {
    return JSON.parse(value) as RelatedCardRef[];
  } catch {
    return [];
  }
};

const coerceText = (value: unknown): string | null => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

export const parseThreadCache = (value: string | null): ThreadCache | null => {
  if (value === null || value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const chasing = coerceText(parsed.chasing);
    const nextMove = coerceText(parsed.nextMove);
    if (chasing === null || nextMove === null) {
      return null;
    }

    return {
      chasing,
      workingJudgment: coerceText(parsed.workingJudgment),
      ruledOut: coerceText(parsed.ruledOut),
      nextMove,
      sideThread: coerceText(parsed.sideThread),
      expiresWhen: coerceText(parsed.expiresWhen)
    };
  } catch {
    return null;
  }
};

const getLatestClaudeDispatch = (cardId: number) => {
  return parseClaudeDispatchMeta(getPref(getClaudeDispatchPrefKey(cardId)));
};

export const mapCardRow = (row: CardRow): CardRecord => {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    useFor: row.use_for,
    knowledgeTag: row.knowledge_tag,
    summaryForRetrieval: row.summary_for_retrieval,
    threadCache: parseThreadCache(row.thread_cache_json),
    related: parseRelated(row.related_card_ids),
    petRemark: row.pet_remark,
    createdAt: row.created_at,
    latestClaudeDispatch: getLatestClaudeDispatch(row.id)
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
      thread_cache_json,
      related_card_ids,
      pet_remark,
      created_at
    FROM cards
    ORDER BY created_at DESC
    LIMIT 20
  `).all() as CardRow[];

  return rows.map(mapCardRow);
};

export const deleteCardById = (cardId: number): boolean => {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT id, item_id
    FROM cards
    WHERE id = ?
    LIMIT 1
  `).get(cardId) as { id: number; item_id: number } | undefined;

  if (row === undefined) {
    return false;
  }

  const deleteTransaction = db.transaction((targetCardId: number, targetItemId: number) => {
    db.prepare(`DELETE FROM card_embeddings WHERE card_id = ?`).run(targetCardId);
    db.prepare(`DELETE FROM cards WHERE id = ?`).run(targetCardId);
    db.prepare(`DELETE FROM items WHERE id = ?`).run(targetItemId);
  });

  deleteTransaction(row.id, row.item_id);
  return true;
};
