import type { CardRecord, ThreadCache } from "../types/card";
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
  threadCache?: unknown;
};

type ChaosResetJson = {
  mainLine?: unknown;
  sideQuests?: unknown;
  nextStep?: unknown;
  summaryForRetrieval?: unknown;
  knowledgeTag?: unknown;
  threadCache?: unknown;
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

const nullableText = (value: string): string | null => {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
};

const summarizeChaosThreadForStep = (value: string, limit: number): string => {
  return truncate(trimSentenceEnding(value), limit);
};

const isThreadDriftText = (value: string): boolean => {
  const normalized = normalizeText(value);
  const lower = normalized.toLowerCase();
  return /\b(?:spiral(?:ing)?|drift(?:ed|ing)?|lost the thread|too many tabs|rabbit hole)\b/i.test(lower)
    || /标签页|开.*标签|丢线|跑偏|飘了|分心/u.test(normalized);
};

const hasTabDrift = (value: string): boolean => {
  const normalized = normalizeText(value);
  return /\btabs?\b/i.test(normalized) || /标签页|标签/u.test(normalized);
};

const extractDeclaredThreadLabel = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const patterns = language === "zh"
    ? [
      /(?:主线|真正(?:该|要)做的|现在(?:该|要)做的|当前任务)\s*(?:是|：|:)\s*([^。！？\n]+)/u,
      /(?:而是|回到)\s*([^。！？\n]+)/u,
      /(?:下一步|下一件事)\s*(?:是|：|:)\s*([^。！？\n]+)/u,
    ]
    : [
      /\b(?:real (?:job|deliverable|task|work)|main (?:thread|line)|current task)\s+(?:is|:)\s+([^.!?\n]+)/i,
      /\b(?:return to|go back to|back to)\s+([^.!?\n]+)/i,
      /\b(?:next useful move|next step)\s+(?:is|:)\s+([^.!?\n]+)/i,
    ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const candidate = normalizeText(match?.[1] ?? "")
      .replace(/^(to|把|先把|先|继续|立刻)\s*/iu, "")
      .replace(/[，,;；:：\s]+$/u, "");
    if (candidate.length > 0) {
      return truncate(candidate, language === "zh" ? 48 : 60);
    }
  }

  return null;
};

const buildThreadDriftTitle = (value: string, language: OutputLanguage): string => {
  if (language === "zh") {
    return hasTabDrift(value) ? "标签页漂移复位" : "回到当前主线";
  }

  return hasTabDrift(value) ? "Tab drift reset" : "Return to the current thread";
};

const buildThreadDriftUseFor = (
  value: string,
  language: OutputLanguage,
  threadLabel: string
): string => {
  if (language === "zh") {
    const action = hasTabDrift(value)
      ? "关掉两个无关标签页"
      : "先停下当前岔线";
    return `${action}，让 driftpet 先守住“${summarizeChaosThreadForStep(threadLabel, 28)}”，写下第一条检查项，然后立刻做五分钟。`;
  }

  const action = hasTabDrift(value)
    ? "Close two unrelated tabs"
    : "Pause the side branch";
  return `${action}, let driftpet guard "${summarizeChaosThreadForStep(threadLabel, 40)}", write the first checklist line, and work on it for five minutes now.`;
};

const extractTentativeJudgment = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const patterns = language === "zh"
    ? [
      /(?:我(?:怀疑|猜|觉得|判断)|可能|大概率)([^。！？\n]+)/u,
      /(?:不是|并不是)([^。！？\n]+)/u,
    ]
    : [
      /\b(?:I suspect|I think|I believe|my hunch is|probably|likely)\b([^.!?\n]+)/i,
      /\b(?:not|isn't|wasn't)\b([^.!?\n]+)/i,
    ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const candidate = nullableText(match?.[0] ?? "");
    if (candidate !== null) {
      return truncate(candidate, language === "zh" ? 72 : 120);
    }
  }

  return null;
};

const extractRuledOut = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const patterns = language === "zh"
    ? [
      /(?:不是|并不是|别再|不要再|先别|不用)([^。！？\n]+)/u,
      /(?:排除|放下|别碰)([^。！？\n]+)/u,
    ]
    : [
      /\b(?:not|isn't|wasn't|do not|don't|stop|avoid|set aside|ruled out)\b([^.!?\n]+)/i,
    ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const candidate = nullableText(match?.[0] ?? "");
    if (candidate !== null) {
      return truncate(candidate, language === "zh" ? 72 : 120);
    }
  }

  return null;
};

const isNegatedNextMove = (value: string, language: OutputLanguage): boolean => {
  return language === "zh"
    ? /^(?:别|不要|不用|先别|别再)/u.test(value)
    : /^(?:do not|don't|avoid|stop|not\b|no\s+)/i.test(value);
};

const cleanNextMoveCandidate = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const cleaned = language === "zh"
    ? normalized
      .replace(/^[，,;；:：\s]+/u, "")
      .replace(/^(?:把|先把|先|继续|立刻|马上)\s*/u, "")
      .replace(/[，,;；:：\s]+$/u, "")
      .trim()
    : normalized
      .replace(/^[,;:\s]+/u, "")
      .replace(/(?:,|;)\s*(?:and\s+)?(?:do not|don't|avoid|stop|not)\b.*$/iu, "")
      .replace(/(?:,|;)\s*(?:and\s+)?then\b.*$/iu, "")
      .replace(/^first\s*(?:,|:|-)?\s*/iu, "")
      .replace(/\s*\bfirst\b\s*$/iu, "")
      .replace(/^(?:to|then|and|please|now)\s+/iu, "")
      .replace(/^[,;:\s]+/u, "")
      .replace(/[,;:\s]+$/u, "")
      .trim();

  const candidate = nullableText(cleaned);
  if (candidate === null || isNegatedNextMove(candidate, language)) {
    return null;
  }

  return candidate;
};

const extractNextMoveCandidateFromText = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const markerPatterns = language === "zh"
    ? [
      /(?:下一步|下一手|接下来)\s*(?:是|：|:)?\s*([^。！？\n]+)/u,
      /(?:先|立刻|马上)(?!\s*(?:别|不要|不用|别再))\s*([^。！？\n]+)/u,
    ]
    : [
      /\b(?:next step|next move|next useful move)\s*(?:is|:)?\s*([^.!?\n]+)/i,
    ];

  for (const pattern of markerPatterns) {
    const match = pattern.exec(normalized);
    const candidate = cleanNextMoveCandidate(match?.[1] ?? "", language);
    if (candidate !== null) {
      return candidate;
    }
  }

  if (language !== "zh") {
    const firstAtStart = /(?:^|[.!?\n])\s*first\s*(?:,|:|-)?\s*([^.!?\n]+)/iu.exec(normalized);
    const firstCandidate = cleanNextMoveCandidate(firstAtStart?.[1] ?? "", language);
    if (firstCandidate !== null) {
      return firstCandidate;
    }

    const firstMarkedClause = normalized
      .split(/[.!?\n,;]+/u)
      .map((clause) => normalizeText(clause))
      .find((clause) => /^first\b/iu.test(clause) || /\bfirst\b$/iu.test(clause));
    const clauseCandidate = cleanNextMoveCandidate(firstMarkedClause ?? "", language);
    if (clauseCandidate !== null) {
      return clauseCandidate;
    }
  }

  return null;
};

const extractNextMoveFromText = (value: string, fallback: string, language: OutputLanguage): string => {
  const candidate = extractNextMoveCandidateFromText(value, language);
  return truncate(candidate ?? fallback, language === "zh" ? 120 : 180);
};

const hasExplicitNextMove = (value: string, language: OutputLanguage): boolean => {
  return extractNextMoveCandidateFromText(value, language) !== null;
};

const buildThreadCache = (input: {
  sourceText: string;
  title: string;
  nextMove: string;
  sideThread?: string | null;
  language: OutputLanguage;
  expiresWhen?: string | null;
}): ThreadCache => {
  return {
    chasing: truncate(input.title, input.language === "zh" ? 72 : 120),
    workingJudgment: extractTentativeJudgment(input.sourceText, input.language),
    ruledOut: extractRuledOut(input.sourceText, input.language),
    nextMove: truncate(input.nextMove, input.language === "zh" ? 120 : 180),
    sideThread: input.sideThread ?? null,
    expiresWhen: input.expiresWhen ?? (input.language === "zh" ? "这条线冷掉或已经沉淀后" : "when this thread is cold or settled")
  };
};

const getRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
};

const coerceOptionalCacheString = (
  value: unknown,
  fallback: string | null,
  limit: number,
  language: OutputLanguage
): string | null => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = normalizeText(value);
  if (normalized.length === 0) {
    return fallback;
  }

  return matchesOutputLanguage(language, normalized)
    ? truncate(normalized, limit)
    : fallback;
};

const coerceThreadCache = (
  value: unknown,
  fallback: ThreadCache,
  language: OutputLanguage
): ThreadCache => {
  const record = getRecord(value);
  if (record === null) {
    return fallback;
  }

  return {
    chasing: coerceStringInLanguage(record.chasing, fallback.chasing, 120, language),
    workingJudgment: coerceOptionalCacheString(record.workingJudgment, fallback.workingJudgment, 160, language),
    ruledOut: coerceOptionalCacheString(record.ruledOut, fallback.ruledOut, 160, language),
    nextMove: coerceStringInLanguage(record.nextMove, fallback.nextMove, 180, language),
    sideThread: coerceOptionalCacheString(record.sideThread, fallback.sideThread, 160, language),
    expiresWhen: coerceOptionalCacheString(record.expiresWhen, fallback.expiresWhen, 120, language)
  };
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

  const cleaned = selected
    .replace(/^(pause|return to|go back to|stop|do not)\s+/i, "")
    .trim() || selected;
  const words = cleaned.split(/\s+/u);
  const tag = words.slice(0, 4).join(" ");
  return tag.length > 0 ? tag : cleaned;
};

const extractTelegramThreadLabel = (value: string, language: OutputLanguage): string => {
  const declared = extractDeclaredThreadLabel(value, language);
  if (declared !== null) {
    return declared;
  }

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

  const nextMove = extractNextMoveCandidateFromText(value, language);
  if (nextMove !== null) {
    return truncate(nextMove, 60);
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
      threadCache: null,
      petRemark: "轻轻响了一下，记下就继续。"
    };
  }

  return {
    title: `Telegram ping captured: ${label}`,
    useFor: "Treat this as a ping or smoke input. Confirm the Telegram lane works, then move back to a higher-signal thread.",
    knowledgeTag: "Telegram ping",
    summaryForRetrieval: `Low-signal Telegram ping: ${label}`,
    threadCache: null,
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
      threadCache: null,
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
    threadCache: null,
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
    const useFor = "把它当成按需参考，不要现在整篇消化。只提取一个能直接推进当前任务的事实、步骤或例子，然后关掉页面。";
    return {
      title,
      useFor,
      knowledgeTag: "捕获文章",
      summaryForRetrieval: truncate(`按需参考：${summary}。这条缓存只保存能推进当前工作线的事实、步骤或例子，不把整篇文章变成新任务。`, 500),
      threadCache: buildThreadCache({
        sourceText: contentBasis,
        title,
        nextMove: useFor,
        sideThread: "不要把整篇文章变成新任务。",
        language
      }),
      petRemark: "拿走你要的那一小段，别住进这篇文章里。"
    };
  }

  const useFor = "Treat this as on-demand reference, not something to fully consume right now. Pull one fact, step, or example that directly unblocks the current task, then close the tab.";
  return {
    title,
    useFor,
    knowledgeTag: "captured article",
    summaryForRetrieval: truncate(`On-demand reference: ${summary}. This cache preserves only the fact, step, or example that can move the current work thread forward, not the whole article as a new task.`, 500),
    threadCache: buildThreadCache({
      sourceText: contentBasis,
      title,
      nextMove: useFor,
      sideThread: "Do not turn the whole article into a new task.",
      language
    }),
    petRemark: "Take the bit you need and get back out."
  };
};

const createTelegramTextFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.rawText);
  const language = detectOutputLanguage(input.rawText, input.extractedText, input.extractedTitle);
  const title = isThreadDriftText(contentBasis) && extractDeclaredThreadLabel(contentBasis, language) === null
    ? buildThreadDriftTitle(contentBasis, language)
    : extractTelegramThreadLabel(contentBasis, language);
  const knowledgeTag = buildTelegramTextKnowledgeTag(title, language);
  const thread = summarizeChaosThreadForStep(title, language === "zh" ? 28 : 40);

  if (language === "zh") {
    const useFor = isThreadDriftText(contentBasis)
      ? buildThreadDriftUseFor(contentBasis, language, thread)
      : `让 driftpet 先守住“${thread}”，只做一个当前动作，别把这条信息扩成新分支。`;
    return {
      title,
      useFor,
      knowledgeTag,
      summaryForRetrieval: truncate(`工作记忆缓存：${title}。当前守住的线是“${thread}”，下一步只围绕这条线做一个动作，避免扩成新分支。`, 500),
      threadCache: buildThreadCache({
        sourceText: contentBasis,
        title,
        nextMove: extractNextMoveFromText(contentBasis, useFor, language),
        sideThread: "别把这条信息扩成新分支。",
        language
      }),
      petRemark: "这根线我先叼着，你只做下一小步。"
    };
  }

  const useFor = isThreadDriftText(contentBasis)
    ? buildThreadDriftUseFor(contentBasis, language, thread)
    : `Let driftpet guard "${thread}". Do only this next move, and do not turn it into a broader redesign.`;
  return {
    title,
    useFor,
    knowledgeTag,
    summaryForRetrieval: truncate(`Working-memory cache: ${title}. The guarded thread is "${thread}", and the next move should stay on this line instead of becoming a broader branch.`, 500),
    threadCache: buildThreadCache({
      sourceText: contentBasis,
      title,
      nextMove: extractNextMoveFromText(contentBasis, useFor, language),
      sideThread: "Do not turn this into a broader redesign.",
      language
    }),
    petRemark: "I will hold this thread; you take the next small move."
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
    const useFor = `先把这条工作记忆交给 driftpet 守住，再做一个下一步动作：${useFragment}${contentBasis.length > 160 ? "..." : ""}`;
    return {
      title,
      useFor,
      knowledgeTag,
      summaryForRetrieval: truncate(`工作记忆缓存：${contentBasis}`, 500),
      threadCache: buildThreadCache({
        sourceText: contentBasis,
        title,
        nextMove: extractNextMoveFromText(contentBasis, useFor, language),
        language
      }),
      petRemark: "我先守着这根线，你把下一步做小。"
    };
  }

  const useFor = `Let driftpet guard this working-memory thread, then turn it into one next action: ${useFragment}${contentBasis.length > 160 ? "..." : ""}`;
  return {
    title,
    useFor,
    knowledgeTag,
    summaryForRetrieval: truncate(`Working-memory cache: ${contentBasis}`, 500),
    threadCache: buildThreadCache({
      sourceText: contentBasis,
      title,
      nextMove: extractNextMoveFromText(contentBasis, useFor, language),
      language
    }),
    petRemark: "I will guard the thread; keep the next move small."
  };
};

const createChaosResetFallback = (input: DigestInput): DigestDraft => {
  const contentBasis = normalizeText(input.rawText);
  const language = detectOutputLanguage(input.rawText);
  const declaredThread = extractDeclaredThreadLabel(contentBasis, language);
  const cleanedMainLine = cleanChaosMainLine(contentBasis, "Pick one concrete deliverable for this thread.");
  const shouldUseGenericDriftTitle = isThreadDriftText(contentBasis)
    && declaredThread === null
    && (
      cleanedMainLine === "Pick one concrete deliverable for this thread."
      || cleanedMainLine === contentBasis
    );
  const mainLine = declaredThread
    ?? (shouldUseGenericDriftTitle
      ? buildThreadDriftTitle(contentBasis, language)
      : cleanedMainLine);

  if (language === "zh") {
    const fallbackMainLine = "先定一个这条线现在要交付的具体东西。";
    const resolvedMainLine = mainLine === "Pick one concrete deliverable for this thread."
      ? truncate(fallbackMainLine, 72)
      : mainLine;
    const stepThread = summarizeChaosThreadForStep(resolvedMainLine, 28);
    const sideQuests = /https?:\/\//i.test(contentBasis)
      ? "先放下那些不能直接推进这条工作记忆的链接和标签页。"
      : "先放下所有不能直接推进当前工作记忆的岔线。";
    const fallbackNextStep = isThreadDriftText(contentBasis)
      ? buildThreadDriftUseFor(contentBasis, language, stepThread)
      : `关掉两个无关标签页，让 driftpet 先守住“${stepThread}”，写下第一条检查项，然后立刻做五分钟。`;
    const nextStep = hasExplicitNextMove(contentBasis, language)
      ? extractNextMoveFromText(contentBasis, fallbackNextStep, language)
      : fallbackNextStep;

    return {
      title: resolvedMainLine,
      useFor: `先放下：${sideQuests}\n下一步：${nextStep}`,
      knowledgeTag: "工作记忆守线",
      summaryForRetrieval: truncate(`工作记忆缓存：${resolvedMainLine}。暂时排除或放下：${sideQuests} 下一步：${nextStep}`, 500),
      threadCache: buildThreadCache({
        sourceText: contentBasis,
        title: resolvedMainLine,
        nextMove: nextStep,
        sideThread: sideQuests,
        language
      }),
      petRemark: "这根线我先守着，你别再开新岔路。"
    };
  }

  const sideQuests = /https?:\/\//i.test(contentBasis)
    ? "Set aside the extra links and tabs that do not unblock this working-memory thread."
    : "Set aside anything that does not move the current working-memory thread forward.";
  const stepThread = summarizeChaosThreadForStep(mainLine, 40);
  const fallbackNextStep = isThreadDriftText(contentBasis)
    ? buildThreadDriftUseFor(contentBasis, language, stepThread)
    : `Close two unrelated tabs, let driftpet guard "${stepThread}", write the first checklist line, and work on it for five minutes now.`;
  const nextStep = hasExplicitNextMove(contentBasis, language)
    ? extractNextMoveFromText(contentBasis, fallbackNextStep, language)
    : fallbackNextStep;

  return {
    title: mainLine,
    useFor: `Set aside: ${sideQuests}\nNext: ${nextStep}`,
    knowledgeTag: "thread cache",
    summaryForRetrieval: truncate(`Working-memory cache: ${mainLine}. Set aside or rule out: ${sideQuests} Next: ${nextStep}`, 500),
    threadCache: buildThreadCache({
      sourceText: contentBasis,
      title: mainLine,
      nextMove: nextStep,
      sideThread: sideQuests,
      language
    }),
    petRemark: "I will guard this thread; stop opening side doors."
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

const isGenericNextStep = (value: string): boolean => {
  const normalized = normalizeText(value);
  const lower = normalized.toLowerCase();
  return normalized.length === 0
    || /^turn this into one next action/i.test(normalized)
    || /\b(?:review|read|summarize|analyze|explore|improve|optimize|continue working on|look into)\b/i.test(lower)
    || /(?:下一步动作|具体产出|最小可交付|继续优化|继续完善|整理一下|分析一下|看一下|研究一下)/u.test(normalized);
};

const refineUseFor = (
  candidate: string,
  fallback: string,
  input: DigestInput,
  language: OutputLanguage
): string => {
  if (!isGenericNextStep(candidate)) {
    return candidate;
  }

  const contentBasis = normalizeText(input.rawText);
  if (isThreadDriftText(contentBasis)) {
    const thread = extractDeclaredThreadLabel(contentBasis, language)
      ?? buildThreadDriftTitle(contentBasis, language);
    return buildThreadDriftUseFor(contentBasis, language, thread);
  }

  return fallback;
};

const extractFallbackNextStep = (fallbackUseFor: string, language: OutputLanguage): string => {
  const marker = language === "zh" ? /下一步：\s*/u : /Next:\s*/i;
  const parts = fallbackUseFor.split(marker);
  return normalizeText(parts.at(1) ?? fallbackUseFor);
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
        ? "先放下所有不能直接推进当前工作记忆的岔线。"
        : "Set aside anything that does not move the current working-memory thread forward.",
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
    const refinedNextStep = refineUseFor(
      nextStep,
      extractFallbackNextStep(fallback.useFor, language),
      input,
      language
    );

    const digest: DigestDraft = {
      title: mainLine,
      useFor: language === "zh"
        ? `先放下：${sideQuests}\n下一步：${refinedNextStep}`
        : `Set aside: ${sideQuests}\nNext: ${refinedNextStep}`,
      knowledgeTag: coerceStringInLanguage(
        parsed.knowledgeTag,
        language === "zh" ? "工作记忆守线" : "thread cache",
        80,
        language
      ),
      summaryForRetrieval: coerceStringInLanguage(
        parsed.summaryForRetrieval,
        fallback.summaryForRetrieval,
        500,
        language
      ),
      threadCache: coerceThreadCache(
        parsed.threadCache,
        fallback.threadCache ?? buildThreadCache({
          sourceText: input.rawText,
          title: mainLine,
          nextMove: refinedNextStep,
          sideThread: sideQuests,
          language
        }),
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
    const useFor = refineUseFor(
      coerceStringInLanguage(digestJson.useFor, fallback.useFor, 260, language),
      fallback.useFor,
      input,
      language
    );
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
      threadCache: coerceThreadCache(
        digestJson.threadCache,
        fallback.threadCache ?? buildThreadCache({
          sourceText: normalizeText(input.extractedText ?? input.rawText),
          title,
          nextMove: useFor,
          language
        }),
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
