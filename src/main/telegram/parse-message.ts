import type { ItemSource, ItemStatus, UrlExtractionStage } from "../types/item";

type TelegramEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

type TelegramChat = {
  id: number;
};

type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
};

export type ParsedTelegramInput = {
  source: ItemSource;
  rawText: string;
  rawUrl: string | null;
  tgMessageId: string;
  extractedTitle?: string | null;
  extractedText?: string | null;
  extractionStage?: UrlExtractionStage;
  extractionError?: string | null;
  lastError?: string | null;
  artifactPath?: string | null;
  processor?: string | null;
  itemStatus?: ItemStatus;
  workflowTitle?: string | null;
  workflowUseFor?: string | null;
  workflowKnowledgeTag?: string | null;
  workflowPetRemark?: string | null;
};

const URL_PATTERN = /https?:\/\/[^\s]+/i;

const sliceEntityText = (text: string, entity: TelegramEntity): string => {
  return text.slice(entity.offset, entity.offset + entity.length);
};

const findUrlInEntities = (
  text: string,
  entities: TelegramEntity[] | undefined
): string | null => {
  if (entities === undefined) {
    return null;
  }

  for (const entity of entities) {
    if (entity.type === "url") {
      return sliceEntityText(text, entity);
    }

    if (entity.type === "text_link" && entity.url !== undefined) {
      return entity.url;
    }
  }

  return null;
};

const preferMoreCompleteUrl = (
  entityUrl: string | null,
  fallbackUrl: string | null
): string | null => {
  if (entityUrl === null) {
    return fallbackUrl;
  }

  if (fallbackUrl === null) {
    return entityUrl;
  }

  if (entityUrl === fallbackUrl) {
    return entityUrl;
  }

  if (fallbackUrl.startsWith(entityUrl) && fallbackUrl.length > entityUrl.length) {
    return fallbackUrl;
  }

  return entityUrl;
};

export const parseTelegramMessage = (message: TelegramMessage): ParsedTelegramInput | null => {
  const text = message.text ?? message.caption ?? "";
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    return null;
  }

  const entities = message.text !== undefined ? message.entities : message.caption_entities;
  const entityUrl = findUrlInEntities(text, entities);
  const textUrl = normalizedText.match(URL_PATTERN)?.[0] ?? null;
  const rawUrl = preferMoreCompleteUrl(entityUrl, textUrl);

  return {
    source: rawUrl === null ? "tg_text" : "tg_url",
    rawText: normalizedText,
    rawUrl,
    tgMessageId: `${message.chat.id}:${message.message_id}`
  };
};
