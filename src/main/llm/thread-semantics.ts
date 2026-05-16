import type { ThreadCache } from "../types/card";
import { normalizeText, truncate } from "../utils/text";
import type { OutputLanguage } from "./language";

const trimSentenceEnding = (value: string): string => {
  return value.trim().replace(/[。.!?！？]+$/u, "");
};

const nullableText = (value: string): string | null => {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
};

export const summarizeChaosThreadForStep = (value: string, limit: number): string => {
  return truncate(trimSentenceEnding(value), limit);
};

export const isThreadDriftText = (value: string): boolean => {
  const normalized = normalizeText(value);
  const lower = normalized.toLowerCase();
  return /\b(?:spiral(?:ing)?|drift(?:ed|ing)?|lost the thread|too many tabs|rabbit hole)\b/i.test(lower)
    || /标签页|开.*标签|丢线|跑偏|飘了|分心/u.test(normalized);
};

const ZH_WAITING_SIGNAL_TERMS = "回复|结果|消息|确认|同步|跑完|通过|回音|拍板|批准|审批|签字|答复";
const ZH_WAITING_SIGNAL_PATTERN = new RegExp(
  `(?:等待|等[^。！？\\n，,]*(?:${ZH_WAITING_SIGNAL_TERMS}))`,
  "u"
);
const ZH_WAITING_OR_BLOCKED_PATTERN = new RegExp(
  `(?:等待|等[^。！？\\n，,]*(?:${ZH_WAITING_SIGNAL_TERMS})|卡在[^。！？\\n，,]*等[^。！？\\n，,]*)`,
  "u"
);

export const hasWaitingSignal = (value: string): boolean => {
  const normalized = normalizeText(value);
  return ZH_WAITING_OR_BLOCKED_PATTERN.test(normalized)
    || /\bwait(?:ing)?\b|\bblocked on\b|\bpending\b|\buntil .*reply\b|\bwaiting for\b/i.test(normalized);
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
      .replace(/[，,]\s*(?:别|不要|不用|先别|别再|下一步|接下来|然后).*/u, "")
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

const findActiveMoveWhileWaiting = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  if (language === "zh") {
    const direct = normalized.match(/(?:这会儿|现在|同时)\s*(先[^。！？\n，,]*)/u);
    const directCandidate = nullableText(direct?.[1] ?? "");
    if (directCandidate !== null && !/^(?:等|等待)/u.test(directCandidate)) {
      return directCandidate;
    }
  }

  const patterns = language === "zh"
    ? [
      /(?:这会儿|现在|同时|先去|先把|先)\s*([^。！？\n，,]+(?:补完|做完|写完|收掉|推进|处理|验收|整理|提交|修掉|跑完)[^。！？\n，,]*)/u,
      /(?:先做|先把)\s*([^。！？\n，,]+)/u,
    ]
    : [
      /\b(?:for now|meanwhile|while waiting)\b[^.!?\n]*?\b(?:finish|ship|write|check|verify|clean up|close|run|fix)\b([^.!?\n]*)/i,
      /\b(?:first|for now)\s+(?:finish|ship|write|check|verify|clean up|close|run|fix)\b([^.!?\n]*)/i,
    ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    const segment = match === null
      ? null
      : language === "zh"
        ? match[1]
        : `${match[0].trim()}`;
    const candidate = cleanNextMoveCandidate(segment ?? "", language);
    if (candidate !== null && !/^(?:等|等待|wait)/i.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const buildWaitingSideThread = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  if (!hasWaitingSignal(normalized)) {
    return null;
  }

  if (language === "zh") {
    const match = normalized.match(ZH_WAITING_SIGNAL_PATTERN);
    const waiting = normalizeText(match?.[0] ?? "");
    return waiting.length > 0
      ? truncate(`${waiting}，回音没来前先别围着它空转。`, 120)
      : "这条里有一段在等结果，别围着它空转。";
  }

  const match = normalized.match(/\b(?:wait(?:ing)? for|blocked on|pending)\b([^.!?\n]+)/i);
  const waiting = normalizeText(match?.[0] ?? "");
  return waiting.length > 0
    ? truncate(`${waiting}; do not idle around it before the response lands.`, 160)
    : "Part of this thread is waiting on outside input; do not idle around it.";
};

export const extractWaitingOn = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  if (!hasWaitingSignal(normalized)) {
    return null;
  }

  if (language === "zh") {
    const match = normalized.match(ZH_WAITING_OR_BLOCKED_PATTERN);
    const waiting = nullableText(match?.[0] ?? "");
    return waiting === null ? "这条线有一段在等外部回音。" : truncate(waiting, 120);
  }

  const match = normalized.match(/\b(?:wait(?:ing)? for|blocked on|pending|until .*reply)\b([^.!?\n]*)/i);
  const waiting = nullableText(match?.[0] ?? "");
  return waiting === null ? "Part of this thread is waiting on outside input." : truncate(waiting, 160);
};

const hasTabDrift = (value: string): boolean => {
  const normalized = normalizeText(value);
  return /\btabs?\b/i.test(normalized) || /标签页|标签/u.test(normalized);
};

export const extractDeclaredThreadLabel = (value: string, language: OutputLanguage): string | null => {
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

export const buildThreadDriftTitle = (value: string, language: OutputLanguage): string => {
  if (language === "zh") {
    return hasTabDrift(value) ? "标签页漂移复位" : "回到当前主线";
  }

  return hasTabDrift(value) ? "Tab drift reset" : "Return to the current thread";
};

export const buildThreadDriftUseFor = (
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
      /(?:不是|并不是|别再|不要再|先别|不用|别急着)([^。！？\n]+)/u,
      /(?:^|[。！？\n；;，,])\s*(?:排除|先放下|放下|别碰)\s*([^。！？\n]+)/u,
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

const extractNextMoveCandidateFromText = (value: string, language: OutputLanguage): string | null => {
  const normalized = normalizeText(value);
  const markerPatterns = language === "zh"
    ? [
      /(?:下一步|下一手|接下来)\s*(?:是|：|:)?\s*([^。！？\n]+)/u,
      /(?:^|[。！？\n；;，,])\s*(?:今晚|今天|明天|现在|这会儿)\s*(?:先|立刻|马上)(?!\s*(?:别|不要|不用|别再))\s*([^。！？\n]+)/u,
      /(?:^|[。！？\n；;，,])\s*(?:先|立刻|马上)(?!\s*(?:别|不要|不用|别再))\s*([^。！？\n]+)/u,
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

export const extractNextMoveFromText = (value: string, fallback: string, language: OutputLanguage): string => {
  if (hasWaitingSignal(value)) {
    const activeWhileWaiting = findActiveMoveWhileWaiting(value, language);
    if (activeWhileWaiting !== null) {
      return truncate(activeWhileWaiting, language === "zh" ? 120 : 180);
    }
  }

  const candidate = extractNextMoveCandidateFromText(value, language);
  return truncate(candidate ?? fallback, language === "zh" ? 120 : 180);
};

export const hasExplicitNextMove = (value: string, language: OutputLanguage): boolean => {
  return extractNextMoveCandidateFromText(value, language) !== null;
};

export const buildThreadCache = (input: {
  sourceText: string;
  title: string;
  nextMove: string;
  meanwhile?: string | null;
  waitingOn?: string | null;
  sideThread?: string | null;
  language: OutputLanguage;
  expiresWhen?: string | null;
}): ThreadCache => {
  return {
    chasing: truncate(input.title, input.language === "zh" ? 72 : 120),
    workingJudgment: extractTentativeJudgment(input.sourceText, input.language),
    ruledOut: extractRuledOut(input.sourceText, input.language),
    nextMove: truncate(input.nextMove, input.language === "zh" ? 120 : 180),
    meanwhile: input.meanwhile ?? null,
    waitingOn: input.waitingOn ?? null,
    waitingResolvedAt: null,
    sideThread: input.sideThread ?? null,
    expiresWhen: input.expiresWhen ?? (input.language === "zh" ? "这条线冷掉或已经沉淀后" : "when this thread is cold or settled")
  };
};

export const buildTelegramTextKnowledgeTag = (title: string, language: OutputLanguage): string => {
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

export const extractTelegramThreadLabel = (value: string, language: OutputLanguage): string => {
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
      .replace(/^(?:今晚|今天|明天|现在|这会儿)\s*/u, "")
      .replace(/^(?:先把|先|把|别再|不要再|回到|立刻|马上|暂停)\s*/u, "")
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

export const finalizeTelegramTextTitle = (
  candidate: string,
  rawText: string,
  language: OutputLanguage
): string => {
  const cleaned = normalizeText(candidate)
    .replace(/(?:\.{3}|…)+$/u, "")
    .replace(/[，,;；:：\s]+$/u, "")
    .trim();
  const raw = normalizeText(rawText);
  const lowered = cleaned.toLowerCase();

  const shouldCompact = cleaned.length === 0
    || cleaned === "捕获笔记"
    || lowered === "captured note"
    || cleaned === raw
    || cleaned.length > 60
    || /[。.!?！？]/u.test(cleaned);

  if (!shouldCompact) {
    return cleaned;
  }

  return extractTelegramThreadLabel(raw, language);
};
