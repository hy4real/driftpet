import { getDatabase } from "../db/client";
import { getPref } from "../db/prefs";
import { getEmbeddingRuntimeConfig, getLlmRuntimeConfig } from "../llm/config";
import { canUseLlm, getLlmMissingReason } from "../llm/client";
import { canUseEmbeddings, getEmbeddingMissingReason } from "../llm/embeddings";
import type { AppStatus, LatestItemStatus, StatusLevel } from "../types/status";

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
  extracted_title: string | null;
  raw_text: string | null;
  received_at: number;
  last_error: string | null;
};

const DEFAULT_DIGEST_MODEL = "claude-sonnet-4-20250514";

const summarize = (value: string, limit: number): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
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
    lastError: row.last_error
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
      id,
      source,
      status,
      extracted_title,
      raw_text,
      received_at,
      last_error
    FROM items
    ORDER BY received_at DESC
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
  latestItem: LatestItemStatus | null
): AppStatus["storage"] => {
  const summary = `${counts.item_count} items · ${counts.card_count} cards`;

  if (latestItem === null) {
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

  const detail = latestItem.lastError !== null && latestItem.lastError.length > 0
    ? `${latestItem.source} · ${latestItem.status} · ${summarize(latestItem.lastError, 72)}`
    : `${latestItem.source} · ${latestItem.status} · ${latestItem.title}`;

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

  return {
    checkedAt: Date.now(),
    telegram: getTelegramSection(counts.telegram_count),
    llm: getLlmSection(),
    embeddings: getEmbeddingSection(counts.embedding_count),
    storage: getStorageSection(counts, latestItem)
  };
};
