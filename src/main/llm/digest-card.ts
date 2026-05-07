import type { CardRecord } from "../types/card";
import type { ItemSource } from "../types/item";
import { canUseLlm, getLlmMissingReason, sendTextPrompt } from "./client";
import { detectOutputLanguage, matchesOutputLanguage, type OutputLanguage } from "./language";
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

const languageName = (language: OutputLanguage): string => {
  return language === "zh" ? "Chinese" : "English";
};

const normalizeForSignal = (value: string): string => {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "");
};

const trimChaosClause = (value: string): string => {
  const chineseMarker = /[，,]\s*(但|不过|可是|只是|然后|同时|结果).*/u;
  const chineseMatch = chineseMarker.exec(value);
  if (chineseMatch !== null && chineseMatch.index >= 8) {
    return value.slice(0, chineseMatch.index).trim();
  }

  const englishMarker = /\b(?:but|while|except)\b.*/i;
  const englishMatch = englishMarker.exec(value);
  if (englishMatch !== null && englishMatch.index >= 8) {
    return value.slice(0, englishMatch.index).trim().replace(/[,\s]+$/, "");
  }

  return value.trim();
};

const cleanChaosMainLine = (value: string, fallback: string): string => {
  const firstLine = normalizeText(value)
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .find((line) => line.length > 0) ?? "";
  const cleaned = trimChaosClause(
    firstLine
      .replace(/https?:\/\/\S+/g, "")
      .replace(/当前\s*tab[:：].*$/i, "")
      .replace(/tabs?[:：].*$/i, "")
      .replace(/[，,;；]\s*$/, "")
      .trim()
  );

  return truncate(cleaned.length > 0 ? cleaned : fallback, 72);
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
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);

  if (language === "zh") {
    return {
      title: `收到了一个 Telegram 轻量 ping：${label}`,
      useFor: "把它当成连通性测试或轻量提醒。确认 Telegram 通路正常后，回到更高信号的主线。",
      knowledgeTag: "Telegram ping",
      summaryForRetrieval: `低信号 Telegram ping：${label}`,
      petRemark: "轻轻响了一下，记下就继续。"
    };
  }

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
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);

  if (language === "zh") {
    return {
      title,
      useFor: `把它压成一个下一步动作：${useFragment}${contentBasis.length > 160 ? "..." : ""}`,
      knowledgeTag: input.source === "tg_url" ? "捕获文章" : "捕获笔记",
      summaryForRetrieval: truncate(contentBasis, 500),
      petRemark: "你已经意识到飘了，下一步先做小一点。"
    };
  }

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
  const mainLine = cleanChaosMainLine(contentBasis, "Return to one thread and name the actual deliverable.");
  const language = detectOutputLanguage(input.rawText);

  if (language === "zh") {
    const fallbackMainLine = "回到一条主线，并把真正要交付的东西说清楚。";
    const resolvedMainLine = mainLine === "Return to one thread and name the actual deliverable."
      ? truncate(fallbackMainLine, 72)
      : mainLine;
    const sideQuests = /https?:\/\//i.test(contentBasis)
      ? "先放下那些不能直接推进主交付的链接和标签页。"
      : "先放下所有不能直接推进当前交付的岔线。";
    const nextStep = "写下下一条具体产出，关掉两个无关标签页，然后立刻做第一个五分钟动作。";

    return {
      title: resolvedMainLine,
      useFor: `先放下：${sideQuests}\n下一步：${nextStep}`,
      knowledgeTag: "线程复位",
      summaryForRetrieval: truncate(`${resolvedMainLine} ${sideQuests} ${nextStep}`, 500),
      petRemark: "你又飘了。先拎住一根线。"
    };
  }

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

const coerceStringInLanguage = (
  value: unknown,
  fallback: string,
  limit: number,
  language: OutputLanguage
): string => {
  const candidate = coerceString(value, fallback, limit);
  return matchesOutputLanguage(language, candidate) ? candidate : truncate(fallback, limit);
};

const buildDigestPrompt = (input: DigestInput, recentCards: CardRecord[]): string => {
  const basePrompt = loadPrompt("digest-card.v1.md");
  const contentBasis = normalizeText(input.extractedText ?? input.rawText);
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);

  return [
    basePrompt,
    "",
    `Output language: ${languageName(language)}`,
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
  const language = detectOutputLanguage(input.rawText);

  return [
    basePrompt,
    "",
    `Output language: ${languageName(language)}`,
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
  const language = detectOutputLanguage(
    digest.title,
    digest.useFor,
    digest.knowledgeTag,
    digest.summaryForRetrieval
  );

  return [
    basePrompt,
    "",
    `Output language: ${languageName(language)}`,
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
  const language = detectOutputLanguage(input.rawText);

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
    const mainLine = cleanChaosMainLine(
      coerceStringInLanguage(parsed.mainLine, fallback.title, 120, language),
      fallback.title
    );
    const sideQuests = coerceStringInLanguage(
      parsed.sideQuests,
      language === "zh"
        ? "先放下所有不能直接推进当前交付的岔线。"
        : "Set aside anything that does not move the current deliverable forward.",
      180,
      language
    );
    const nextStep = coerceStringInLanguage(
      parsed.nextStep,
      language === "zh"
        ? "写下下一条具体产出，然后立刻做第一个五分钟动作。"
        : "Write the next concrete output and do the first five-minute step now.",
      180,
      language
    );

    const digest: DigestDraft = {
      title: mainLine,
      useFor: language === "zh"
        ? `先放下：${sideQuests}\n下一步：${nextStep}`
        : `Set aside: ${sideQuests}\nNext: ${nextStep}`,
      knowledgeTag: coerceStringInLanguage(
        parsed.knowledgeTag,
        language === "zh" ? "线程复位" : "chaos reset",
        80,
        language
      ),
      summaryForRetrieval: coerceStringInLanguage(
        parsed.summaryForRetrieval,
        fallback.summaryForRetrieval,
        500,
        language
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
    const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);

    const digest: DigestDraft = {
      title: coerceStringInLanguage(digestJson.title, fallback.title, 120, language),
      useFor: coerceStringInLanguage(digestJson.useFor, fallback.useFor, 260, language),
      knowledgeTag: coerceStringInLanguage(digestJson.knowledgeTag, fallback.knowledgeTag, 80, language),
      summaryForRetrieval: coerceStringInLanguage(
        digestJson.summaryForRetrieval,
        fallback.summaryForRetrieval,
        500,
        language
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
