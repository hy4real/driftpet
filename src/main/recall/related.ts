import type { RelatedCardRef } from "../types/card";
import { listRecallCandidates } from "../db/embeddings";
import { canUseEmbeddings, generateEmbedding } from "../llm/embeddings";
import { detectOutputLanguage } from "../llm/language";
import type { ItemSource } from "../types/item";

type FindRelatedResult = {
  related: RelatedCardRef[];
  queryEmbedding: number[] | null;
};

type RelatedQuery = {
  source: ItemSource;
  title: string;
  summaryForRetrieval: string;
};

const MAX_RELATED = 2;
const MAX_CANDIDATES = 50;
const EMBEDDING_THRESHOLD = 0.44;
const LEXICAL_ONLY_THRESHOLD = 0.24;
const CHAOS_DUPLICATE_THRESHOLD = 0.92;
const CHAOS_SIMILAR_THRESHOLD = 0.68;

const normalizeComparableText = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[._/-]+/g, " ")
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => ![
      "https",
      "http",
      "www",
      "com",
      "net",
      "org",
      "html",
      "index",
      "example"
    ].includes(token));
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const lexicalSimilarity = (left: string, right: string): number => {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.sqrt(leftTokens.size * rightTokens.size);
};

const buildReason = (summary: string, languageHint: string): string => {
  const snippet = summary.trim().replace(/\s+/g, " ").slice(0, 96);
  const language = detectOutputLanguage(languageHint, summary);

  if (language === "zh") {
    return snippet.length > 0 ? `相关线索：${snippet}${summary.length > 96 ? "..." : ""}` : "相关线索来自更早的一张卡片。";
  }

  return snippet.length > 0 ? `Similar thread: ${snippet}${summary.length > 96 ? "..." : ""}` : "Similar thread from an earlier card.";
};

const isRecallEligible = (candidate: Awaited<ReturnType<typeof listRecallCandidates>>[number]): boolean => {
  if (candidate.origin !== "real") {
    return false;
  }

  if (candidate.knowledgeTag !== null && candidate.knowledgeTag.toLowerCase() === "telegram ping") {
    return false;
  }

  const title = candidate.title.toLowerCase();
  const summary = candidate.summaryForRetrieval.toLowerCase();
  const looksLikePing = title.includes("ping") || summary.includes("telegram ping");
  return candidate.source !== "tg_text" || looksLikePing === false;
};

const isNearDuplicateChaosReset = (
  query: RelatedQuery,
  candidate: Awaited<ReturnType<typeof listRecallCandidates>>[number],
  lexical: number
): boolean => {
  if (query.source !== "manual_chaos" || candidate.source !== "manual_chaos") {
    return false;
  }

  const normalizedTitle = normalizeComparableText(query.title);
  const normalizedCandidateTitle = normalizeComparableText(candidate.title);
  if (normalizedTitle.length > 0 && normalizedTitle === normalizedCandidateTitle) {
    return true;
  }

  if (
    normalizedTitle.length > 0 &&
    normalizedCandidateTitle.length > 0 &&
    (normalizedTitle.includes(normalizedCandidateTitle) || normalizedCandidateTitle.includes(normalizedTitle))
  ) {
    return true;
  }

  const normalizedSummary = normalizeComparableText(query.summaryForRetrieval);
  const normalizedCandidateSummary = normalizeComparableText(candidate.summaryForRetrieval);
  if (
    normalizedSummary.length > 0 &&
    normalizedCandidateSummary.length > 0 &&
    (normalizedSummary.includes(normalizedCandidateSummary) || normalizedCandidateSummary.includes(normalizedSummary))
  ) {
    return true;
  }

  return lexical >= CHAOS_DUPLICATE_THRESHOLD || lexical >= CHAOS_SIMILAR_THRESHOLD;
};

export const findRelatedCards = async (
  query: RelatedQuery,
  excludeItemId: number
): Promise<FindRelatedResult> => {
  const candidates = listRecallCandidates(excludeItemId, MAX_CANDIDATES)
    .filter(isRecallEligible);
  const queryEmbedding = canUseEmbeddings()
    ? await generateEmbedding(query.summaryForRetrieval).catch(() => null)
    : null;

  const scored = candidates.map((candidate) => {
    const lexical = lexicalSimilarity(query.summaryForRetrieval, candidate.summaryForRetrieval);
    const embedding = queryEmbedding !== null && candidate.embedding !== null
      ? cosineSimilarity(queryEmbedding, candidate.embedding)
      : null;
    const recencyBoost = Math.max(0, 1 - (Date.now() - candidate.createdAt) / (1000 * 60 * 60 * 24 * 30)) * 0.05;
    const finalScore = (embedding !== null ? (embedding * 0.82) + (lexical * 0.18) : lexical) + recencyBoost;

    return {
      candidate,
      lexical,
      embedding,
      finalScore
    };
  });

  const related = scored
    .filter((entry) => {
      if (isNearDuplicateChaosReset(query, entry.candidate, entry.lexical)) {
        return false;
      }

      if (entry.embedding !== null) {
        return entry.finalScore >= EMBEDDING_THRESHOLD && entry.embedding >= 0.38;
      }

      return entry.finalScore >= LEXICAL_ONLY_THRESHOLD && entry.lexical >= 0.2;
    })
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, MAX_RELATED)
    .map((entry) => ({
      cardId: entry.candidate.cardId,
      title: entry.candidate.title,
      reason: buildReason(entry.candidate.summaryForRetrieval, query.summaryForRetrieval)
    }));

  return {
    related,
    queryEmbedding
  };
};
