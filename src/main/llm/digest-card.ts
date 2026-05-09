import type { CardRecord } from "../types/card";
import type { ItemSource, UrlExtractionStage } from "../types/item";
import { canUseLlm, getLlmMissingReason, sendTextPrompt } from "./client";
import { detectOutputLanguage, matchesOutputLanguage, type OutputLanguage } from "./language";
import { loadPrompt } from "./prompt-loader";
import { normalizeText, truncate } from "../utils/text";

type DigestInput = {
  source: ItemSource;
  rawText: string;
  rawUrl?: string | null;
  extractedTitle?: string | null;
  extractedText?: string | null;
  extractionStage?: UrlExtractionStage;
  extractionError?: string | null;
  lastError?: string | null;
};

type DigestDraft = Omit<CardRecord, "id" | "itemId" | "createdAt" | "related">;

type GenerateDigestResult = {
  digest: DigestDraft;
  digestError: string | null;
  mode: "full" | "skip_recall";
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

const summarizeUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    const label = `${parsed.hostname}${path}`;
    return truncate(label.length > 0 ? label : parsed.hostname, 72);
  } catch {
    return truncate(normalizeText(value), 72);
  }
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

const trimSentenceEnding = (value: string): string => {
  return value.trim().replace(/[。.!?！？]+$/u, "");
};

const summarizeChaosThreadForStep = (value: string, limit: number): string => {
  return truncate(trimSentenceEnding(value), limit);
};

const buildTelegramTextKnowledgeTag = (title: string, language: OutputLanguage): string => {
  const clauses = normalizeText(title)
    .split(/[，,:;：]/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  const selected = clauses.at(0) ?? normalizeText(title);

  if (language === "zh") {
    const cleaned = selected
      .replace(/^(先|先把|把|暂停|回到|立刻|别再|不要再)/u, "")
      .trim();
    return truncate(cleaned.length > 0 ? cleaned : selected, 18).replace(/\.\.\.$/, "");
  }

  return truncate(
    selected
      .replace(/^(pause|return to|go back to|stop|do not)\s+/i, "")
      .trim() || selected,
    24
  ).replace(/\.\.\.$/, "");
};

const extractTelegramThreadLabel = (value: string, language: OutputLanguage): string => {
  const clauses = normalizeText(value)
    .split(/[。.!?！？\n，,:;：]/u)
    .map((clause) => normalizeText(clause))
    .filter((clause) => clause.length > 0);
  const selected = clauses.at(0) ?? normalizeText(value);

  if (language === "zh") {
    const zh = selected
      .replace(/^(今晚|现在|先|先把|把|别再|不要再|回到|立刻|暂停)\s*/u, "")
      .trim();
    return truncate(zh.length > 0 ? zh : selected, 48);
  }

  const english = selected
    .replace(/^(tonight|now|first|please|use|tighten)\s+/i, "")
    .trim();
  return truncate(english.length > 0 ? english : selected, 60);
};

const finalizeTelegramTextTitle = (
  candidate: string,
  rawText: string,
  language: OutputLanguage
): string => {
  const cleaned = normalizeText(candidate)
    .replace(/(?:\.{3}|…)+$/u, "")
    .replace(/[，,;；:：\s]+$/u, "")
    .trim();
  const raw = normalizeText(rawText);

  const shouldCompact = cleaned.length === 0
    || cleaned === raw
    || cleaned.length > 60
    || /[。.!?！？]/u.test(cleaned);

  if (!shouldCompact) {
    return cleaned;
  }

  return extractTelegramThreadLabel(raw, language);
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

const isUrlExtractionFailure = (input: DigestInput): boolean => {
  if (input.source !== "tg_url" || input.rawUrl === undefined || input.rawUrl === null) {
    return false;
  }

  if (input.extractedText !== undefined && input.extractedText !== null && input.extractedText.trim().length > 0) {
    return false;
  }

  if (input.extractionStage === "fetch_failed" || input.extractionStage === "no_content") {
    return true;
  }

  const error = normalizeText(input.extractionError ?? input.lastError ?? "").toLowerCase();
  return error.startsWith("fetch failed")
    || error.includes("no readable article content found");
};

const createUrlFailureDigest = (input: DigestInput): DigestDraft => {
  const label = summarizeUrl(input.rawUrl ?? input.rawText);
  const language = detectOutputLanguage(input.rawText, input.extractedTitle);

  if (language === "zh") {
    return {
      title: `链接暂未抓取成功：${label}`,
      useFor: "这次没有拿到可读正文。只有当它仍然直接影响当前任务时，再手动打开链接，或带一句上下文重新转发。",
      knowledgeTag: "链接待重试",
      summaryForRetrieval: truncate(
        `链接抓取未成功：${label}。这次没有提取到正文，不应把它当成已经读过的文章内容。`,
        500
      ),
      petRemark: "先承认这次没抓到正文，别把链接壳当成已经消化过。"
    };
  }

  return {
    title: `URL capture incomplete: ${label}`,
    useFor: "No readable article text was captured this time. Only open the link manually if it still matters to the current task, or resend it with one sentence of context.",
    knowledgeTag: "link retry",
    summaryForRetrieval: truncate(
      `URL capture incomplete: ${label}. No article text was extracted, so this should not be treated as already-read content.`,
      500
    ),
    petRemark: "Call it what it is: a link shell, not a digested article."
  };
};

const isReadableUrlCapture = (input: DigestInput): boolean => {
  return input.source === "tg_url"
    && input.extractedText !== undefined
    && input.extractedText !== null
    && input.extractedText.trim().length > 0;
};

const createUrlReferenceFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.extractedText ?? input.rawText);
  const title = truncate(
    normalizeText(input.extractedTitle ?? "") || summarizeUrl(input.rawUrl ?? input.rawText),
    120
  );
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);
  const summary = truncate(`${title} ${contentBasis}`, 500);

  if (language === "zh") {
    return {
      title,
      useFor: "把它当成按需参考，不要现在整篇消化。只提取一个能直接推进当前任务的事实、步骤或例子，然后关掉页面。",
      knowledgeTag: "捕获文章",
      summaryForRetrieval: summary,
      petRemark: "拿走你要的那一小段，别住进这篇文章里。"
    };
  }

  return {
    title,
    useFor: "Treat this as on-demand reference, not something to fully consume right now. Pull one fact, step, or example that directly unblocks the current task, then close the tab.",
    knowledgeTag: "captured article",
    summaryForRetrieval: summary,
    petRemark: "Take the bit you need and get back out."
  };
};

const createTelegramTextFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.rawText);
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);
  const title = extractTelegramThreadLabel(contentBasis, language);
  const knowledgeTag = buildTelegramTextKnowledgeTag(title, language);
  const thread = summarizeChaosThreadForStep(title, language === "zh" ? 28 : 40);

  if (language === "zh") {
    return {
      title,
      useFor: `先围绕“${thread}”只做一个当前动作，别把这条信息扩成新分支。`,
      knowledgeTag,
      summaryForRetrieval: truncate(`${title} ${thread}`, 500),
      petRemark: "你已经意识到飘了，先把这一条收紧。"
    };
  }

  return {
    title,
    useFor: `Do only this next: ${thread}. Do not turn it into a broader redesign.`,
    knowledgeTag,
    summaryForRetrieval: truncate(`${title} ${thread}`, 500),
    petRemark: "You noticed the drift. Keep the next move small."
  };
};

const createFallbackDigest = (input: DigestInput): DigestDraft => {
  if (isReadableUrlCapture(input)) {
    return createUrlReferenceFallback(input);
  }

  if (input.source === "tg_text") {
    return createTelegramTextFallback(input);
  }

  const contentBasis = normalizeText(input.extractedText ?? input.rawText);
  const title = truncate(
    normalizeText(input.extractedTitle ?? "") || contentBasis.slice(0, 60) || "Manual drift reset",
    120
  );
  const useFragment = truncate(contentBasis, 160);
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);
  const knowledgeTag = language === "zh" ? "捕获文章" : "captured article";

  if (language === "zh") {
    return {
      title,
      useFor: `把它压成一个下一步动作：${useFragment}${contentBasis.length > 160 ? "..." : ""}`,
      knowledgeTag,
      summaryForRetrieval: truncate(contentBasis, 500),
      petRemark: "你已经意识到飘了，下一步先做小一点。"
    };
  }

  return {
    title,
    useFor: `Turn this into one next action: ${useFragment}${contentBasis.length > 160 ? "..." : ""}`,
    knowledgeTag,
    summaryForRetrieval: truncate(contentBasis, 500),
    petRemark: "You noticed the drift. Keep the next move small."
  };
};

const createChaosResetFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.rawText);
  const mainLine = cleanChaosMainLine(contentBasis, "Pick one concrete deliverable for this thread.");
  const language = detectOutputLanguage(input.rawText);

  if (language === "zh") {
    const fallbackMainLine = "先定一个这条线现在要交付的具体东西。";
    const resolvedMainLine = mainLine === "Pick one concrete deliverable for this thread."
      ? truncate(fallbackMainLine, 72)
      : mainLine;
    const stepThread = summarizeChaosThreadForStep(resolvedMainLine, 28);
    const sideQuests = /https?:\/\//i.test(contentBasis)
      ? "先放下那些不能直接推进主交付的链接和标签页。"
      : "先放下所有不能直接推进当前交付的岔线。";
    const nextStep = `关掉两个无关标签页，写下“${stepThread}”的第一条检查项，然后立刻做五分钟。`;

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
  const stepThread = summarizeChaosThreadForStep(mainLine, 40);
  const nextStep = `Close two unrelated tabs, write the first checklist line for "${stepThread}", and work on it for five minutes now.`;

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

const finalizeKnowledgeTag = (
  candidate: string,
  fallback: string,
  source: ItemSource,
  title: string,
  language: OutputLanguage
): string => {
  const cleaned = normalizeText(candidate)
    .replace(/(?:\.{3}|…)+$/u, "")
    .replace(/[，,;；:：\s]+$/u, "")
    .trim();

  if (source === "tg_text") {
    const lowered = cleaned.toLowerCase();
    if (
      cleaned.length === 0
      || cleaned === "捕获笔记"
      || lowered === "captured note"
    ) {
      return buildTelegramTextKnowledgeTag(title, language);
    }
  }

  return cleaned.length > 0 ? cleaned : fallback;
};

const buildDigestPrompt = (input: DigestInput, recentCards: CardRecord[]): string => {
  const basePrompt = loadPrompt("digest-card.v1.md");
  const contentBasis = normalizeText(input.extractedText ?? input.rawText);
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);
  const isReadableUrl = isReadableUrlCapture(input);
  const isHighSignalTelegramText = input.source === "tg_text" && !isLowSignalTelegramText(input);

  const scenarioGuidance = isReadableUrl
    ? [
      "Scenario guidance:",
      "- This input is a successfully extracted URL/article.",
      "- Treat it as just-in-time reference for the current task, not something to fully consume.",
      "- In `useFor`, tell the user what one fact, step, or example to pull from this page right now.",
      "- Do not tell the user to broadly read, review, summarize, or learn the whole article."
    ].join("\n")
    : isHighSignalTelegramText
      ? [
        "Scenario guidance:",
        "- This input is a direct high-signal Telegram text note from live work.",
        "- Treat it as a self-instruction for the current task, not a generic captured note.",
        "- `title` must be a short thread label, not a verbatim echo of the whole message.",
        "- `knowledgeTag` must name the actual work thread and must not be a generic label like `captured note` or `捕获笔记`.",
        "- `useFor` should point to one immediate action, not a broad improvement plan."
      ].join("\n")
    : null;

  return [
    basePrompt,
    "",
    `Output language: ${languageName(language)}`,
    ...(scenarioGuidance === null ? [] : ["", scenarioGuidance]),
    "",
    "Recent cards:",
    formatRecentCards(recentCards),
    "",
    "Input item:",
    JSON.stringify({
      source: input.source,
      rawUrl: input.rawUrl ?? null,
      extractedTitle: input.extractedTitle ?? null,
      extractionStage: input.extractionStage ?? null,
      extractionError: input.extractionError ?? null,
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
      mode: "skip_recall"
    };
  }

  if (isUrlExtractionFailure(input)) {
    return {
      digest: createUrlFailureDigest(input),
      digestError: null,
      mode: "skip_recall"
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
    const title = input.source === "tg_text"
      ? finalizeTelegramTextTitle(
        coerceStringInLanguage(digestJson.title, fallback.title, 120, language),
        input.rawText,
        language
      )
      : coerceStringInLanguage(digestJson.title, fallback.title, 120, language);
    const useFor = coerceStringInLanguage(digestJson.useFor, fallback.useFor, 260, language);
    const knowledgeTag = finalizeKnowledgeTag(
      coerceStringInLanguage(digestJson.knowledgeTag, fallback.knowledgeTag, 80, language),
      fallback.knowledgeTag,
      input.source,
      title,
      language
    );

    const digest: DigestDraft = {
      title,
      useFor,
      knowledgeTag,
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
