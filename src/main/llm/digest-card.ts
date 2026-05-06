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

type ChaosResetJson = {
  mainLine?: unknown;
  sideQuests?: unknown;
  nextStep?: unknown;
  summaryForRetrieval?: unknown;
  knowledgeTag?: unknown;
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

const createChaosResetFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.rawText);
  const firstLine = contentBasis.split(/\n+/).map((line) => normalizeText(line)).find((line) => line.length > 0) ?? "";
  const cleanedMainLine = firstLine
    .replace(/https?:\/\/\S+/g, "")
    .replace(/当前\s*tab[:：].*$/i, "")
    .replace(/tabs?[:：].*$/i, "")
    .replace(/[，,;；]\s*$/, "")
    .trim();
  const mainLine = truncate(
    cleanedMainLine.length > 0 ? cleanedMainLine : "Return to one thread and name the actual deliverable.",
    72
  );
  const sideQuests = /https?:\/\//i.test(contentBasis)
    ? "Set aside the extra links and tabs that do not unblock the main deliverable."
    : "Set aside anything that does not move the current deliverable forward.";
  const nextStep = "Write the next concrete output, close two unrelated tabs, and do the first five-minute step now.";

  return {
    title: mainLine,
    useFor: `Set aside: ${sideQuests}\nNext: ${nextStep}`,
    knowledgeTag: "chaos reset",
    summaryForRetrieval: truncate(`${mainLine} ${sideQuests} ${nextStep}`, 500),
    petRemark: "You drifted. Pull one thread and keep it."
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

const parseChaosResetJson = (value: string): ChaosResetJson => {
  const jsonText = extractJsonObject(value);
  if (jsonText === null) {
    throw new Error("Model output did not contain a JSON object.");
  }

  return JSON.parse(jsonText) as ChaosResetJson;
};

const scrubBrokenPetRemark = (value: string, fallback: string): string => {
  const normalized = normalizeText(value);
  if (!normalized.startsWith("{")) {
    return normalized;
  }

  try {
    const parsed = JSON.parse(normalized) as {
      petRemark?: unknown;
    };
    if (typeof parsed.petRemark === "string") {
      return normalizeText(parsed.petRemark);
    }
  } catch {
    return fallback;
  }

  return fallback;
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

const buildChaosResetPrompt = (input: DigestInput, recentCards: CardRecord[]): string => {
  const basePrompt = loadPrompt("chaos-reset.v1.md");

  return [
    basePrompt,
    "",
    "Recent cards:",
    formatRecentCards(recentCards),
    "",
    "Current chaos dump:",
    input.rawText
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

const applyPetRemark = async (
  digest: DigestDraft,
  fallbackRemark: string
): Promise<Pick<GenerateDigestResult, "digest" | "digestError">> => {
  try {
    const remarkResponse = await sendTextPrompt({
      prompt: buildRemarkPrompt(digest),
      model: REMARK_MODEL,
      maxTokens: 80
    });

    digest.petRemark = coerceString(
      scrubBrokenPetRemark(remarkResponse, fallbackRemark),
      fallbackRemark,
      80
    );
    return {
      digest,
      digestError: null
    };
  } catch (error) {
    return {
      digest,
      digestError: error instanceof Error
        ? `Pet remark fallback: ${error.message}`
        : "Pet remark fallback: unknown error."
    };
  }
};

const generateChaosResetDraft = async (
  input: DigestInput,
  recentCards: CardRecord[]
): Promise<GenerateDigestResult> => {
  const fallback = createChaosResetFallback(input);

  if (!canUseLlm()) {
    return {
      digest: fallback,
      digestError: `${getLlmMissingReason()}; using fallback digest.`,
      mode: "full"
    };
  }

  try {
    const response = await sendTextPrompt({
      prompt: buildChaosResetPrompt(input, recentCards),
      model: DIGEST_MODEL,
      maxTokens: 350
    });
    const parsed = parseChaosResetJson(response);
    const mainLine = coerceString(parsed.mainLine, fallback.title, 120);
    const sideQuests = coerceString(
      parsed.sideQuests,
      "Set aside anything that does not move the current deliverable forward.",
      180
    );
    const nextStep = coerceString(
      parsed.nextStep,
      "Write the next concrete output and do the first five-minute step now.",
      180
    );

    const digest: DigestDraft = {
      title: mainLine,
      useFor: `Set aside: ${sideQuests}\nNext: ${nextStep}`,
      knowledgeTag: coerceString(parsed.knowledgeTag, "chaos reset", 80),
      summaryForRetrieval: coerceString(
        parsed.summaryForRetrieval,
        fallback.summaryForRetrieval,
        500
      ),
      petRemark: fallback.petRemark
    };

    const withRemark = await applyPetRemark(digest, fallback.petRemark);
    return {
      digest: withRemark.digest,
      digestError: withRemark.digestError,
      mode: "full"
    };
  } catch (error) {
    return {
      digest: fallback,
      digestError: error instanceof Error
        ? `Chaos reset fallback: ${error.message}`
        : "Chaos reset fallback: unknown error.",
      mode: "full"
    };
  }
};

export const generateDigestDraft = async (
  input: DigestInput,
  recentCards: CardRecord[]
): Promise<GenerateDigestResult> => {
  if (input.source === "manual_chaos") {
    return generateChaosResetDraft(input, recentCards);
  }

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

    const withRemark = await applyPetRemark(digest, fallback.petRemark);
    return {
      digest: withRemark.digest,
      digestError: withRemark.digestError,
      mode: "full"
    };
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
