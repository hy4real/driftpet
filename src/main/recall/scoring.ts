import type { ItemSource } from "../types/item";

export type RelatedQueryLike = {
  source: ItemSource;
  title: string;
  summaryForRetrieval: string;
};

export type RecallCandidateLike = {
  cardId: number;
  itemId: number;
  title: string;
  summaryForRetrieval: string;
  createdAt: number;
  embedding: number[] | null;
  source: string;
  origin: string;
  knowledgeTag: string | null;
};

export const CHAOS_DUPLICATE_THRESHOLD = 0.92;
export const CHAOS_SIMILAR_THRESHOLD = 0.68;
export const CHAOS_MIN_FINAL_SCORE = 0.64;
export const CHAOS_MIN_EMBEDDING = 0.52;
export const CHAOS_CROSS_LANGUAGE_MIN_EMBEDDING = 0.62;
export const CHAOS_CROSS_LANGUAGE_MIN_LEXICAL = 0.08;
export const CHAOS_MIN_LEXICAL = 0.38;
// Strong semantic match waives the lexical floor so cross-language and
// cross-phrasing chaos cards that share the same underlying thread can still
// recall each other.
export const CHAOS_STRONG_EMBEDDING = 0.7;
export const CHAOS_STRONG_MIN_FINAL_SCORE = 0.55;
export const NON_CHAOS_MIN_FINAL_SCORE = 0.56;
export const NON_CHAOS_MIN_EMBEDDING = 0.54;
export const NON_CHAOS_MIN_LEXICAL = 0.22;
export const NON_CHAOS_STRONG_EMBEDDING = 0.68;
export const NON_CHAOS_STRONG_MIN_FINAL_SCORE = 0.58;
export const LEXICAL_ONLY_THRESHOLD = 0.36;
export const LEXICAL_ONLY_MIN_LEXICAL = 0.32;

export const normalizeComparableText = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

export const tokenize = (value: string): string[] => {
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
      "example",
    ].includes(token));
};

export const cosineSimilarity = (a: number[], b: number[]): number => {
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

export const lexicalSimilarity = (left: string, right: string): number => {
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

export const isNearDuplicateChaosReset = (
  query: RelatedQueryLike,
  candidate: RecallCandidateLike,
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

  const queryTokens = new Set(tokenize(`${query.title} ${query.summaryForRetrieval}`));
  const candidateTokens = new Set(tokenize(`${candidate.title} ${candidate.summaryForRetrieval}`));
  if (queryTokens.size > 0 && candidateTokens.size > 0) {
    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }

    const overlapRatio = overlap / Math.min(queryTokens.size, candidateTokens.size);
    if (overlapRatio >= 0.7) {
      return true;
    }
  }

  return lexical >= CHAOS_DUPLICATE_THRESHOLD || lexical >= CHAOS_SIMILAR_THRESHOLD;
};

export const passesRelatedThreshold = (
  query: RelatedQueryLike,
  entry: {
    candidate: RecallCandidateLike;
    lexical: number;
    embedding: number | null;
    finalScore: number;
    crossLanguage?: boolean;
  }
): boolean => {
  if (isNearDuplicateChaosReset(query, entry.candidate, entry.lexical)) {
    return false;
  }

  if (query.source === "manual_chaos" && entry.candidate.source === "manual_chaos") {
    if (entry.embedding !== null) {
      if (entry.crossLanguage) {
        return entry.embedding >= CHAOS_CROSS_LANGUAGE_MIN_EMBEDDING
          || (entry.embedding >= CHAOS_MIN_EMBEDDING && entry.lexical >= CHAOS_CROSS_LANGUAGE_MIN_LEXICAL);
      }

      if (entry.embedding >= CHAOS_STRONG_EMBEDDING) {
        return entry.finalScore >= CHAOS_STRONG_MIN_FINAL_SCORE;
      }

      return entry.finalScore >= CHAOS_MIN_FINAL_SCORE
        && entry.embedding >= CHAOS_MIN_EMBEDDING
        && entry.lexical >= CHAOS_MIN_LEXICAL;
    }

    return entry.finalScore >= CHAOS_MIN_FINAL_SCORE && entry.lexical >= CHAOS_MIN_LEXICAL;
  }

  if (entry.embedding !== null) {
    if (entry.embedding >= NON_CHAOS_STRONG_EMBEDDING) {
      return entry.finalScore >= NON_CHAOS_STRONG_MIN_FINAL_SCORE;
    }

    return entry.finalScore >= NON_CHAOS_MIN_FINAL_SCORE
      && entry.embedding >= NON_CHAOS_MIN_EMBEDDING
      && entry.lexical >= NON_CHAOS_MIN_LEXICAL;
  }

  return entry.finalScore >= LEXICAL_ONLY_THRESHOLD && entry.lexical >= LEXICAL_ONLY_MIN_LEXICAL;
};
