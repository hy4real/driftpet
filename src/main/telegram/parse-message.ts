import type { ItemSource, UrlExtractionStage } from "../types/item";

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

export const parseTelegramMessage = (message: TelegramMessage): ParsedTelegramInput | null => {
  const text = message.text ?? message.caption ?? "";
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    return null;
  }

  const entities = message.text !== undefined ? message.entities : message.caption_entities;
  const rawUrl = findUrlInEntities(text, entities) ?? normalizedText.match(URL_PATTERN)?.[0] ?? null;

  return {
    source: rawUrl === null ? "tg_text" : "tg_url",
    rawText: normalizedText,
    rawUrl,
    tgMessageId: `${message.chat.id}:${message.message_id}`
  };
};
