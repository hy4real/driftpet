import crypto from "node:crypto";
import type { CardRecord } from "../types/card";
import { getDatabase } from "../db/client";
import { getRecentCards } from "../db/cards";
import { upsertCardEmbedding } from "../db/embeddings";
import { generateDigestDraft } from "../llm/digest-card";
import { findRelatedCards } from "../recall/related";
import type { ItemOrigin, ItemSource, UrlExtractionStage } from "../types/item";

type ExistingItemRow = {
  id: number;
};

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

const normalizeText = (rawText: string): string => {
  return rawText.trim().replace(/\s+/g, " ");
};

const buildContentHash = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

const mapCardRow = (row: CardRow): CardRecord => {
  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    useFor: row.use_for,
    knowledgeTag: row.knowledge_tag,
    summaryForRetrieval: row.summary_for_retrieval,
    related: row.related_card_ids === null ? [] : JSON.parse(row.related_card_ids),
    petRemark: row.pet_remark,
    createdAt: row.created_at
  };
};

const findCardByItemId = (itemId: number): CardRecord | null => {
  const db = getDatabase();
  const row = db.prepare(`
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
    WHERE item_id = ?
    LIMIT 1
  `).get(itemId) as CardRow | undefined;

  return row === undefined ? null : mapCardRow(row);
};

export type IngestInput = {
  source: ItemSource;
  origin?: ItemOrigin;
  rawText: string;
  rawUrl?: string | null;
  tgMessageId?: string | null;
  extractedTitle?: string | null;
  extractedText?: string | null;
  extractionStage?: UrlExtractionStage;
  extractionError?: string | null;
  lastError?: string | null;
};

const buildItemIdentity = (input: IngestInput, normalizedText: string): string => {
  return input.rawUrl !== undefined && input.rawUrl !== null && input.rawUrl.length > 0
    ? `${input.rawUrl}::${normalizedText}`
    : normalizedText;
};

const joinErrors = (...errors: Array<string | null | undefined>): string | null => {
  const values = errors
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);

  return values.length > 0 ? values.join(" | ") : null;
};

const resolveExtractionStage = (payload: IngestInput): UrlExtractionStage => {
  if (payload.rawUrl === undefined || payload.rawUrl === null || payload.rawUrl.length === 0) {
    return "not_applicable";
  }

  if (payload.extractionStage !== undefined) {
    return payload.extractionStage;
  }

  return payload.extractedText !== undefined && payload.extractedText !== null && payload.extractedText.trim().length > 0
    ? "readability"
    : "no_content";
};

type PendingItemResult = {
  itemId: number;
  existingCard: CardRecord | null;
};

const ensurePendingItem = (payload: IngestInput, normalized: string): PendingItemResult => {
  const db = getDatabase();
  const contentHash = buildContentHash(buildItemIdentity(payload, normalized));
  const existing = db.prepare(`
    SELECT id
    FROM items
    WHERE content_hash = ?
    LIMIT 1
  `).get(contentHash) as ExistingItemRow | undefined;

  if (existing !== undefined) {
    const existingCard = findCardByItemId(existing.id);
    if (existingCard !== null) {
      return {
        itemId: existing.id,
        existingCard
      };
    }

    return {
      itemId: existing.id,
      existingCard: null
    };
  }

  const itemResult = db.prepare(`
    INSERT INTO items (
      source,
      origin,
      raw_url,
      raw_text,
      content_hash,
      tg_message_id,
      received_at,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.source,
    payload.origin ?? "real",
    payload.rawUrl ?? null,
    normalized,
    contentHash,
    payload.tgMessageId ?? null,
    Date.now(),
    "pending"
  );

  return {
    itemId: Number(itemResult.lastInsertRowid),
    existingCard: null
  };
};

const finalizeCard = (
  itemId: number,
  payload: IngestInput,
  digest: Awaited<ReturnType<typeof generateDigestDraft>>["digest"],
  combinedError: string | null,
  related: CardRecord["related"],
  queryEmbedding: number[] | null
): CardRecord => {
  const db = getDatabase();
  const extractionStage = resolveExtractionStage(payload);
  const createCard = db.transaction(() => {
    const createdAt = Date.now();
    const cardResult = db.prepare(`
      INSERT INTO cards (
        item_id,
        title,
        use_for,
        knowledge_tag,
        summary_for_retrieval,
        related_card_ids,
        pet_remark,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      digest.title,
      digest.useFor,
      digest.knowledgeTag,
      digest.summaryForRetrieval,
      JSON.stringify(related),
      digest.petRemark,
      createdAt
    );

    db.prepare(`
      UPDATE items
      SET status = ?, extracted_title = ?, extracted_text = ?, last_error = ?, extraction_stage = ?, extraction_error = ?
      WHERE id = ?
    `).run(
      "digested",
      payload.extractedTitle ?? null,
      payload.extractedText ?? null,
      combinedError,
      extractionStage,
      payload.extractionError ?? null,
      itemId
    );

    db.prepare(`
      INSERT INTO events (type, payload, created_at)
      VALUES (?, ?, ?)
    `).run("card_created", JSON.stringify({
      itemId,
      cardId: Number(cardResult.lastInsertRowid)
    }), Date.now());

    if (queryEmbedding !== null) {
      upsertCardEmbedding(Number(cardResult.lastInsertRowid), queryEmbedding);
    }

    return {
      ...digest,
      itemId,
      related,
      createdAt,
      id: Number(cardResult.lastInsertRowid)
    };
  });

  return createCard();
};

export const ingestInput = async (input: IngestInput): Promise<CardRecord> => {
  const normalizedText = normalizeText(input.rawText);
  if (normalizedText.length === 0) {
    throw new Error("Ingest requires non-empty text.");
  }

  const pending = ensurePendingItem(input, normalizedText);
  if (pending.existingCard !== null) {
    return pending.existingCard;
  }

  const recentCards = getRecentCards()
    .filter((card) => card.itemId !== pending.itemId)
    .slice(0, 5);
  const digestResult = await generateDigestDraft(input, recentCards);
  const combinedError = joinErrors(input.lastError, digestResult.digestError);
  const relatedResult = digestResult.mode === "low_signal"
    ? {
      related: [],
      queryEmbedding: null
    }
    : await findRelatedCards(digestResult.digest.summaryForRetrieval, pending.itemId);

  return finalizeCard(
    pending.itemId,
    input,
    digestResult.digest,
    combinedError,
    relatedResult.related,
    relatedResult.queryEmbedding
  );
};

export const ingestManualText = async (
  rawText: string,
  origin: ItemOrigin = "real"
): Promise<CardRecord> => {
  return ingestInput({
    source: "manual_chaos",
    origin,
    rawText
  });
};
