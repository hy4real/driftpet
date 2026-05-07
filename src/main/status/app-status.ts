import { getDatabase } from "../db/client";
import { getPref } from "../db/prefs";
import { getEmbeddingRuntimeConfig, getLlmRuntimeConfig } from "../llm/config";
import { canUseLlm, getLlmMissingReason } from "../llm/client";
import { canUseEmbeddings, getEmbeddingMissingReason } from "../llm/embeddings";
import { decideAutoSurface } from "../pet/runtime";
import type { AppStatus, LatestItemStatus, StatusLevel } from "../types/status";
import type { RelatedCardRef } from "../types/card";
import type { ItemOrigin, UrlExtractionStage } from "../types/item";

type CountsRow = {
  item_count: number;
  card_count: number;
  embedding_count: number;
  failed_count: number;
  telegram_count: number;
};

type LatestItemRow = {
  id: number;
  source: string;
  status: string;
  origin: ItemOrigin;
  raw_url: string | null;
  tg_message_id: string | null;
  extracted_title: string | null;
  extracted_text: string | null;
  raw_text: string | null;
  received_at: number;
  last_error: string | null;
  extraction_stage: UrlExtractionStage | null;
  extraction_error: string | null;
  card_id: number | null;
  card_title: string | null;
  use_for: string | null;
  knowledge_tag: string | null;
  pet_remark: string | null;
  related_card_ids: string | null;
};

const DEFAULT_DIGEST_MODEL = "claude-sonnet-4-20250514";

const summarize = (value: string, limit: number): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
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

const inferExtractionStage = (row: LatestItemRow): UrlExtractionStage => {
  if (row.raw_url === null) {
    return "not_applicable";
  }

  if (row.extraction_stage !== null) {
    return row.extraction_stage;
  }

  const error = row.last_error?.toLowerCase() ?? "";
  if (error.includes("fetch failed")) {
    return "fetch_failed";
  }

  if (error.includes("no readable article content found")) {
    return "no_content";
  }

  return row.extracted_text !== null && row.extracted_text.trim().length > 0
    ? "readability"
    : "no_content";
};

const buildExtractionStatus = (row: LatestItemRow): LatestItemStatus["extraction"] => {
  const stage = inferExtractionStage(row);
  let extractionState: LatestItemStatus["extraction"]["extractionState"] = "not_applicable";
  let detail: string | null = null;
  let extractedTextPreview: string | null = null;

  if (stage === "readability") {
    extractionState = "extracted";
    detail = "Readability extracted article text.";
    extractedTextPreview = row.extracted_text === null ? null : summarize(row.extracted_text, 180);
  } else if (stage === "body_fallback") {
    extractionState = "fallback";
    detail = row.extraction_error ?? "Readability returned empty content; using page body text fallback.";
    extractedTextPreview = row.extracted_text === null ? null : summarize(row.extracted_text, 180);
  } else if (stage === "fetch_failed") {
    extractionState = "failed";
    detail = row.extraction_error ?? "URL fetch failed before article parsing.";
  } else if (stage === "no_content") {
    extractionState = "failed";
    detail = row.extraction_error ?? "Fetched the page, but found no readable article content.";
  }

  return {
    hasUrl: row.raw_url !== null,
    rawUrl: row.raw_url,
    extractedTitle: row.extracted_title,
    extractedTextPreview,
    extractionState,
    stage,
    detail
  };
};

const buildLatestItem = (row: LatestItemRow | undefined): LatestItemStatus | null => {
  if (row === undefined) {
    return null;
  }

  const fallbackTitle = row.raw_text === null || row.raw_text.length === 0
    ? "Untitled input"
    : summarize(row.raw_text, 54);

  return {
    id: row.id,
    title: row.extracted_title ?? fallbackTitle,
    source: row.source,
    status: row.status,
    receivedAt: row.received_at,
    origin: row.origin,
    rawUrl: row.raw_url,
    rawText: row.raw_text,
    tgMessageId: row.tg_message_id,
    lastError: row.last_error,
    extraction: buildExtractionStatus(row),
    card: row.card_id === null || row.card_title === null || row.use_for === null || row.knowledge_tag === null || row.pet_remark === null
      ? null
      : {
        id: row.card_id,
        title: row.card_title,
        useFor: row.use_for,
        knowledgeTag: row.knowledge_tag,
        petRemark: row.pet_remark,
        related: parseRelated(row.related_card_ids)
      }
  };
};

const getCounts = (): CountsRow => {
  const db = getDatabase();
  return db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM items) AS item_count,
      (SELECT COUNT(*) FROM cards) AS card_count,
      (SELECT COUNT(*) FROM card_embeddings) AS embedding_count,
      (SELECT COUNT(*) FROM items WHERE status = 'failed') AS failed_count,
      (SELECT COUNT(*) FROM items WHERE source LIKE 'tg_%') AS telegram_count
  `).get() as CountsRow;
};

const getLatestItem = (): LatestItemStatus | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      items.id AS id,
      items.source AS source,
      items.status AS status,
      items.origin AS origin,
      items.raw_url AS raw_url,
      items.tg_message_id AS tg_message_id,
      items.extracted_title AS extracted_title,
      items.extracted_text AS extracted_text,
      items.raw_text AS raw_text,
      items.received_at AS received_at,
      items.last_error AS last_error,
      items.extraction_stage AS extraction_stage,
      items.extraction_error AS extraction_error,
      cards.id AS card_id,
      cards.title AS card_title,
      cards.use_for AS use_for,
      cards.knowledge_tag AS knowledge_tag,
      cards.pet_remark AS pet_remark,
      cards.related_card_ids AS related_card_ids
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    ORDER BY items.received_at DESC
    LIMIT 1
  `).get() as LatestItemRow | undefined;

  return buildLatestItem(row);
};

const getLatestRealItem = (): LatestItemStatus | null => {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      items.id AS id,
      items.source AS source,
      items.status AS status,
      items.origin AS origin,
      items.raw_url AS raw_url,
      items.tg_message_id AS tg_message_id,
      items.extracted_title AS extracted_title,
      items.extracted_text AS extracted_text,
      items.raw_text AS raw_text,
      items.received_at AS received_at,
      items.last_error AS last_error,
      items.extraction_stage AS extraction_stage,
      items.extraction_error AS extraction_error,
      cards.id AS card_id,
      cards.title AS card_title,
      cards.use_for AS use_for,
      cards.knowledge_tag AS knowledge_tag,
      cards.pet_remark AS pet_remark,
      cards.related_card_ids AS related_card_ids
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    WHERE items.origin = 'real'
    ORDER BY items.received_at DESC
    LIMIT 1
  `).get() as LatestItemRow | undefined;

  return buildLatestItem(row);
};

const getTelegramSection = (recentTelegramItems: number): AppStatus["telegram"] => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const enabled = token.length > 0;
  const rawOffset = getPref("telegram_last_update_id");
  const parsedOffset = rawOffset === null ? null : Number(rawOffset);
  const lastUpdateId = parsedOffset !== null && Number.isFinite(parsedOffset)
    ? parsedOffset
    : null;

  let level: StatusLevel = "warn";
  let summary = "Telegram disabled";
  let detail = "Set TELEGRAM_BOT_TOKEN to enable phone-to-pet capture.";

  if (enabled && lastUpdateId !== null && lastUpdateId > 0) {
    level = "ok";
    summary = `Polling live · ${recentTelegramItems} Telegram item${recentTelegramItems === 1 ? "" : "s"}`;
    detail = `Last update offset ${lastUpdateId}`;
  } else if (enabled) {
    level = "idle";
    summary = "Configured, waiting for first update";
    detail = "Send a message to the bot and it should land here.";
  }

  return {
    enabled,
    level,
    summary,
    detail,
    lastUpdateId,
    recentTelegramItems
  };
};

const getPetSection = (): AppStatus["pet"] => {
  const decision = decideAutoSurface();

  if (decision.mode === "sleep") {
    return {
      enabled: true,
      level: "idle",
      summary: `Sleep mode · ${decision.shownThisHour}/${decision.hourlyBudget} shown this hour`,
      detail: "Auto popups are paused until you switch back to focus mode.",
      mode: decision.mode,
      hourlyBudget: decision.hourlyBudget,
      shownThisHour: decision.shownThisHour,
      canSurfaceAuto: false
    };
  }

  return {
    enabled: true,
    level: decision.allowed ? "ok" : "warn",
    summary: `Focus mode · ${decision.shownThisHour}/${decision.hourlyBudget} shown this hour`,
    detail: decision.allowed
      ? "Auto popups can still surface new cards."
      : "Hourly surface budget reached; new cards still land in history.",
    mode: decision.mode,
    hourlyBudget: decision.hourlyBudget,
    shownThisHour: decision.shownThisHour,
    canSurfaceAuto: decision.allowed
  };
};

const getLlmSection = (): AppStatus["llm"] => {
  const digestModel = process.env.DRIFTPET_DIGEST_MODEL ?? DEFAULT_DIGEST_MODEL;
  const remarkModel = process.env.DRIFTPET_REMARK_MODEL ?? digestModel;
  const enabled = canUseLlm();

  try {
    const config = getLlmRuntimeConfig();

    return {
      enabled,
      level: enabled ? "ok" : "warn",
      summary: enabled
        ? `${config.provider} ready`
        : "Fallback digest mode",
      detail: enabled
        ? `${digestModel} / ${remarkModel}`
        : getLlmMissingReason(),
      provider: config.provider,
      digestModel,
      remarkModel
    };
  } catch (error) {
    return {
      enabled: false,
      level: "warn",
      summary: "LLM config invalid",
      detail: error instanceof Error ? error.message : "LLM config invalid.",
      provider: "unknown",
      digestModel,
      remarkModel
    };
  }
};

const getEmbeddingSection = (storedEmbeddings: number): AppStatus["embeddings"] => {
  const enabled = canUseEmbeddings();

  try {
    const config = getEmbeddingRuntimeConfig();
    const provider = config.provider;

    if (provider === "disabled") {
      return {
        enabled: false,
        level: "idle",
        summary: "Related recall disabled",
        detail: "Set DRIFTPET_EMBED_PROVIDER to enable embeddings.",
        provider,
        model: null,
        storedEmbeddings
      };
    }

    return {
      enabled,
      level: enabled ? "ok" : "warn",
      summary: enabled
        ? `${provider} embeddings ready`
        : "Embedding unavailable",
      detail: enabled
        ? `${config.model ?? "unknown model"} · ${storedEmbeddings} stored vector${storedEmbeddings === 1 ? "" : "s"}`
        : getEmbeddingMissingReason(),
      provider,
      model: config.model,
      storedEmbeddings
    };
  } catch (error) {
    return {
      enabled: false,
      level: "warn",
      summary: "Embedding config invalid",
      detail: error instanceof Error ? error.message : "Embedding config invalid.",
      provider: "unknown",
      model: null,
      storedEmbeddings
    };
  }
};

const getStorageSection = (
  counts: CountsRow,
  latestItem: LatestItemStatus | null,
  latestRealItem: LatestItemStatus | null
): AppStatus["storage"] => {
  const summary = `${counts.item_count} items · ${counts.card_count} cards`;
  const summaryItem = latestRealItem ?? latestItem;

  if (summaryItem === null) {
    return {
      level: "idle",
      summary,
      detail: "No captured inputs yet.",
      items: counts.item_count,
      cards: counts.card_count,
      failedItems: counts.failed_count,
      latestItem
    };
  }

  const detail = summaryItem.extraction.extractionState === "failed" && summaryItem.extraction.detail !== null
    ? `${summaryItem.source} · ${summaryItem.status} · ${summarize(summaryItem.extraction.detail, 72)}`
    : summaryItem.card === null && summaryItem.lastError !== null && summaryItem.lastError.length > 0
      ? `${summaryItem.source} · ${summaryItem.status} · ${summarize(summaryItem.lastError, 72)}`
      : `${summaryItem.source} · ${summaryItem.status} · ${summaryItem.title}`;

  return {
    level: counts.failed_count > 0 ? "warn" : "ok",
    summary,
    detail,
    items: counts.item_count,
    cards: counts.card_count,
    failedItems: counts.failed_count,
    latestItem
  };
};

export const getAppStatus = async (): Promise<AppStatus> => {
  const counts = getCounts();
  const latestItem = getLatestItem();
  const latestRealItem = getLatestRealItem();

  return {
    checkedAt: Date.now(),
    pet: getPetSection(),
    telegram: getTelegramSection(counts.telegram_count),
    llm: getLlmSection(),
    embeddings: getEmbeddingSection(counts.embedding_count),
    storage: getStorageSection(counts, latestItem, latestRealItem)
  };
};
