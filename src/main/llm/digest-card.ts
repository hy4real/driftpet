import type { CardRecord } from "../types/card";
import type { ItemSource } from "../types/item";
import { canUseLlm, getLlmMissingReason, sendTextPrompt } from "./client";
import { loadPrompt } from "./prompt-loader";

type DigestInput = {
  source: ItemSource;
  rawText: string;
  rawUrl?: string | null;
  extractedTitle?: string | null;
  extractedText?: string | null;
  lastError?: string | null;
};

type DigestDraft = Omit<CardRecord, "id" | "itemId" | "createdAt" | "related">;

type GenerateDigestResult = {
  digest: DigestDraft;
  digestError: string | null;
  mode: "full" | "low_signal";
};

type DigestJson = {
  title?: unknown;
  useFor?: unknown;
  knowledgeTag?: unknown;
  summaryForRetrieval?: unknown;
};

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DIGEST_MODEL = process.env.DRIFTPET_DIGEST_MODEL ?? DEFAULT_MODEL;
const REMARK_MODEL = process.env.DRIFTPET_REMARK_MODEL ?? DIGEST_MODEL;
const LOW_SIGNAL_TG_TEXT = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "sup",
  "ping",
  "test",
  "ok",
  "okay",
  "kk",
  "gm",
  "gn",
  "你好",
  "您好",
  "哈喽",
  "嗨",
  "喂",
  "在吗",
  "在嘛",
  "收到",
  "哈哈",
  "哈哈哈",
  "lol"
]);

const normalizeText = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};

const truncate = (value: string, limit: number): string => {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
};

const normalizeForSignal = (value: string): string => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "");
};

const isLowSignalTelegramText = (input: DigestInput): boolean => {
  if (input.source !== "tg_text" || input.rawUrl !== undefined && input.rawUrl !== null) {
    return false;
  }

  const compact = normalizeForSignal(input.rawText);
  if (compact.length === 0) {
    return false;
  }

  if (LOW_SIGNAL_TG_TEXT.has(compact)) {
    return true;
  }

  return /^(hello+|hi+|hey+|yo+|ping+|test+|ok+|lol+|哈哈+|呵呵+)$/.test(compact);
};

const createLowSignalDigest = (input: DigestInput): DigestDraft => {
  const label = truncate(normalizeText(input.rawText), 36) || "ping";

  return {
    title: `Telegram ping captured: ${label}`,
    useFor: "Treat this as a ping or smoke input. Confirm the Telegram lane works, then move back to a higher-signal thread.",
    knowledgeTag: "Telegram ping",
    summaryForRetrieval: `Low-signal Telegram ping: ${label}`,
    petRemark: "Tiny ping landed. File it and keep moving."
  };
};

const createFallbackDigest = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.extractedText ?? input.rawText);
  const title = truncate(
    normalizeText(input.extractedTitle ?? "") || contentBasis.slice(0, 60) || "Manual drift reset",
    120
  );
  const useFragment = truncate(contentBasis, 160);

  return {
    title,
    useFor: `Turn this into one next action: ${useFragment}${contentBasis.length > 160 ? "..." : ""}`,
    knowledgeTag: input.source === "tg_url" ? "captured article" : "captured note",
    summaryForRetrieval: truncate(contentBasis, 500),
    petRemark: "You noticed the drift. Keep the next move small."
  };
};

const formatRecentCards = (cards: CardRecord[]): string => {
  if (cards.length === 0) {
    return "No recent cards yet.";
  }

  return cards.map((card, index) => {
    return [
      `${index + 1}. title: ${card.title}`,
      `knowledge: ${card.knowledgeTag}`,
      `use_for: ${card.useFor}`
    ].join(" | ");
  }).join("\n");
};

const extractJsonObject = (value: string): string | null => {
  const fenced = value.match(/```json\s*([\s\S]*?)```/i);
  if (fenced !== null) {
    return fenced[1].trim();
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return value.slice(firstBrace, lastBrace + 1);
};

const parseDigestJson = (value: string): DigestJson => {
  const jsonText = extractJsonObject(value);
  if (jsonText === null) {
    throw new Error("Model output did not contain a JSON object.");
  }

  const parsed = JSON.parse(jsonText) as DigestJson;
  return parsed;
};

const coerceString = (value: unknown, fallback: string, limit: number): string => {
  if (typeof value !== "string") {
    return truncate(fallback, limit);
  }

  const normalized = normalizeText(value);
  return truncate(normalized.length > 0 ? normalized : fallback, limit);
};

const buildDigestPrompt = (input: DigestInput, recentCards: CardRecord[]): string => {
  const basePrompt = loadPrompt("digest-card.v1.md");
  const contentBasis = normalizeText(input.extractedText ?? input.rawText);

  return [
    basePrompt,
    "",
    "Recent cards:",
    formatRecentCards(recentCards),
    "",
    "Input item:",
    JSON.stringify({
      source: input.source,
      rawUrl: input.rawUrl ?? null,
      extractedTitle: input.extractedTitle ?? null,
      rawText: input.rawText,
      extractedText: contentBasis
    }, null, 2)
  ].join("\n");
};

const buildRemarkPrompt = (digest: DigestDraft): string => {
  const basePrompt = loadPrompt("pet-remark.v1.md");
  return [
    basePrompt,
    "",
    "Digest card:",
    JSON.stringify({
      title: digest.title,
      useFor: digest.useFor,
      knowledgeTag: digest.knowledgeTag,
      summaryForRetrieval: digest.summaryForRetrieval
    }, null, 2)
  ].join("\n");
};

export const generateDigestDraft = async (
  input: DigestInput,
  recentCards: CardRecord[]
): Promise<GenerateDigestResult> => {
  if (isLowSignalTelegramText(input)) {
    return {
      digest: createLowSignalDigest(input),
      digestError: null,
      mode: "low_signal"
    };
  }

  const fallback = createFallbackDigest(input);

  if (!canUseLlm()) {
    return {
      digest: fallback,
      digestError: `${getLlmMissingReason()}; using fallback digest.`,
      mode: "full"
    };
  }

  try {
    const digestResponse = await sendTextPrompt({
      prompt: buildDigestPrompt(input, recentCards),
      model: DIGEST_MODEL,
      maxTokens: 500
    });
    const digestJson = parseDigestJson(digestResponse);

    const digest: DigestDraft = {
      title: coerceString(digestJson.title, fallback.title, 120),
      useFor: coerceString(digestJson.useFor, fallback.useFor, 260),
      knowledgeTag: coerceString(digestJson.knowledgeTag, fallback.knowledgeTag, 80),
      summaryForRetrieval: coerceString(
        digestJson.summaryForRetrieval,
        fallback.summaryForRetrieval,
        500
      ),
      petRemark: fallback.petRemark
    };

    try {
      const remarkResponse = await sendTextPrompt({
        prompt: buildRemarkPrompt(digest),
        model: REMARK_MODEL,
        maxTokens: 80
      });
      digest.petRemark = coerceString(remarkResponse, fallback.petRemark, 80);
      return {
        digest,
        digestError: null,
        mode: "full"
      };
    } catch (error) {
      return {
        digest,
        digestError: error instanceof Error
          ? `Pet remark fallback: ${error.message}`
          : "Pet remark fallback: unknown error.",
        mode: "full"
      };
    }
  } catch (error) {
    return {
      digest: fallback,
      digestError: error instanceof Error
        ? `Digest fallback: ${error.message}`
        : "Digest fallback: unknown error.",
      mode: "full"
    };
  }
};
