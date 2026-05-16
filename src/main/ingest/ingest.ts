import crypto from "node:crypto";
import type { CardRecord, ThreadCache } from "../types/card";
import { getDatabase } from "../db/client";
import { CARD_SELECT_COLUMNS, getRecentCards, mapCardRow } from "../db/cards";
import type { CardRow } from "../db/cards";
import { upsertCardEmbedding } from "../db/embeddings";
import { generateDigestDraft } from "../llm/digest-card";
import { findRelatedCards } from "../recall/related";
import type { ItemOrigin, ItemSource, ItemStatus, UrlExtractionStage } from "../types/item";
import { normalizeText } from "../utils/text";
import { buildInitialCardLifecycle } from "../workline/lifecycle";

type ExistingItemRow = {
  id: number;
};

type DigestPayload = {
  title: string;
  useFor: string;
  knowledgeTag: string;
  summaryForRetrieval: string;
  threadCache?: ThreadCache | null;
  petRemark: string;
};

const buildContentHash = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

const findCardByItemId = (itemId: number): CardRecord | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      ${CARD_SELECT_COLUMNS}
    FROM cards
    WHERE item_id = ?
    ORDER BY id DESC
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
  artifactPath?: string | null;
  processor?: string | null;
  itemStatus?: ItemStatus;
  digestOverride?: DigestPayload;
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

export type IngestResult = {
  card: CardRecord;
  created: boolean;
};

export type RecoverableChaosDraft = {
  itemId: number;
  rawText: string;
  status: "pending" | "failed";
  receivedAt: number;
  lastError: string | null;
};

// A real chaos reset is meant to be a fresh moment, so manual_chaos opts out
// of permanent content-hash dedup. But a stream of identical pastes within a
// few seconds is paste-spam, not five distinct moments — collapse those onto
// the most recent same-text item so we don't burn five LLM calls.
const CHAOS_PASTE_DEDUP_WINDOW_MS = 90_000;

const findRecentChaosItem = (
  payload: IngestInput,
  normalized: string,
  now: number
): ExistingItemRow | undefined => {
  if (payload.source !== "manual_chaos") {
    return undefined;
  }

  const origin = payload.origin ?? "real";
  const db = getDatabase();
  return db.prepare(`
    SELECT id
    FROM items
    WHERE source = 'manual_chaos'
      AND origin = ?
      AND raw_text = ?
      AND received_at >= ?
    ORDER BY received_at DESC
    LIMIT 1
  `).get(origin, normalized, now - CHAOS_PASTE_DEDUP_WINDOW_MS) as ExistingItemRow | undefined;
};

const findUnfinishedChaosItem = (
  payload: IngestInput,
  normalized: string
): ExistingItemRow | undefined => {
  if (payload.source !== "manual_chaos") {
    return undefined;
  }

  const origin = payload.origin ?? "real";
  const db = getDatabase();
  return db.prepare(`
    SELECT items.id
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    WHERE items.source = 'manual_chaos'
      AND items.origin = ?
      AND items.raw_text = ?
      AND items.status = 'pending'
      AND cards.id IS NULL
    ORDER BY items.received_at DESC
    LIMIT 1
  `).get(origin, normalized) as ExistingItemRow | undefined;
};

export const getRecoverableChaosDraft = (): RecoverableChaosDraft | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      items.id AS itemId,
      items.raw_text AS rawText,
      items.status AS status,
      items.received_at AS receivedAt,
      items.last_error AS lastError
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    WHERE items.source = 'manual_chaos'
      AND items.origin = 'real'
      AND items.status IN ('pending', 'failed')
      AND items.raw_text IS NOT NULL
      AND length(trim(items.raw_text)) > 0
      AND cards.id IS NULL
    ORDER BY items.received_at DESC
    LIMIT 1
  `).get() as {
    itemId: number;
    rawText: string;
    status: string;
    receivedAt: number;
    lastError: string | null;
  } | undefined;

  if (row === undefined) {
    return null;
  }

  return {
    itemId: row.itemId,
    rawText: row.rawText,
    status: row.status === "failed" ? "failed" : "pending",
    receivedAt: row.receivedAt,
    lastError: row.lastError,
  };
};

const ensurePendingItem = (payload: IngestInput, normalized: string): PendingItemResult => {
  const db = getDatabase();
  const contentHash = payload.source === "manual_chaos"
    ? null
    : buildContentHash(buildItemIdentity(payload, normalized));

  const existing = contentHash === null
    ? findUnfinishedChaosItem(payload, normalized) ?? findRecentChaosItem(payload, normalized, Date.now())
    : db.prepare(`
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
  digest: DigestPayload,
  combinedError: string | null,
  related: CardRecord["related"],
  queryEmbedding: number[] | null
): CardRecord => {
  const db = getDatabase();
  const extractionStage = resolveExtractionStage(payload);
  const existingCard = findCardByItemId(itemId);
  if (existingCard !== null) {
    return existingCard;
  }

  const createCard = db.transaction(() => {
    const createdAt = Date.now();
    const lifecycle = buildInitialCardLifecycle(createdAt);
    const cardResult = db.prepare(`
      INSERT INTO cards (
        item_id,
        title,
        use_for,
        knowledge_tag,
        summary_for_retrieval,
        thread_cache_json,
        related_card_ids,
        pet_remark,
        created_at,
        lifecycle_status,
        ttl_at,
        recover_until,
        thread_id,
        last_touched_at,
        tomorrow_float_at,
        tomorrow_floated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itemId,
      digest.title,
      digest.useFor,
      digest.knowledgeTag,
      digest.summaryForRetrieval,
      digest.threadCache === undefined || digest.threadCache === null
        ? null
        : JSON.stringify(digest.threadCache),
      JSON.stringify(related),
      digest.petRemark,
      createdAt,
      lifecycle.lifecycleStatus,
      lifecycle.ttlAt,
      lifecycle.recoverUntil,
      null,
      lifecycle.lastTouchedAt,
      lifecycle.tomorrowFloatAt,
      lifecycle.tomorrowFloatedAt
    );

    db.prepare(`
      UPDATE items
      SET status = ?, extracted_title = ?, extracted_text = ?, last_error = ?, extraction_stage = ?, extraction_error = ?, artifact_path = ?, processor = ?
      WHERE id = ?
    `).run(
      payload.itemStatus ?? "digested",
      payload.extractedTitle ?? null,
      payload.extractedText ?? null,
      combinedError,
      extractionStage,
      payload.extractionError ?? null,
      payload.artifactPath ?? null,
      payload.processor ?? null,
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
      threadCache: digest.threadCache ?? null,
      itemId,
      related,
      createdAt,
      lifecycleStatus: lifecycle.lifecycleStatus,
      ttlAt: lifecycle.ttlAt,
      recoverUntil: lifecycle.recoverUntil,
      threadId: null,
      lastTouchedAt: lifecycle.lastTouchedAt,
      tomorrowFloatAt: lifecycle.tomorrowFloatAt,
      tomorrowFloatedAt: lifecycle.tomorrowFloatedAt,
      id: Number(cardResult.lastInsertRowid)
    };
  });

  try {
    return createCard();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: cards.item_id")) {
      const card = findCardByItemId(itemId);
      if (card !== null) {
        return card;
      }
    }

    throw error;
  }
};

export const ingestInputDetailed = async (input: IngestInput): Promise<IngestResult> => {
  const normalizedText = normalizeText(input.rawText);
  if (normalizedText.length === 0) {
    throw new Error("Ingest requires non-empty text.");
  }

  const pending = ensurePendingItem(input, normalizedText);
  if (pending.existingCard !== null) {
    return {
      card: pending.existingCard,
      created: false
    };
  }

  if (input.digestOverride !== undefined) {
    return {
      card: finalizeCard(
        pending.itemId,
        input,
        input.digestOverride,
        input.lastError ?? null,
        [],
        null
      ),
      created: true
    };
  }

  const recentCards = getRecentCards()
    .filter((card) => card.itemId !== pending.itemId)
    .slice(0, 5);
  const digestResult = await generateDigestDraft(input, recentCards);
  const combinedError = joinErrors(input.lastError, digestResult.digestError);
  const relatedResult = digestResult.mode === "skip_recall"
    ? {
      related: [],
      queryEmbedding: null
    }
    : await findRelatedCards({
      source: input.source,
      rawUrl: input.rawUrl ?? null,
      title: digestResult.digest.title,
      knowledgeTag: digestResult.digest.knowledgeTag,
      summaryForRetrieval: digestResult.digest.summaryForRetrieval
    }, pending.itemId);

  return {
    card: finalizeCard(
      pending.itemId,
      input,
      digestResult.digest,
      combinedError,
      relatedResult.related,
      relatedResult.queryEmbedding
    ),
    created: true
  };
};

export const ingestInput = async (input: IngestInput): Promise<CardRecord> => {
  const result = await ingestInputDetailed(input);
  return result.card;
};

export const ingestChaosReset = async (
  rawText: string,
  origin: ItemOrigin = "real"
): Promise<CardRecord> => {
  return ingestInput({
    source: "manual_chaos",
    origin,
    rawText
  });
};
