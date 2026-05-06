import type { RelatedCardRef } from "../types/card";
import { listRecallCandidates } from "../db/embeddings";
import { canUseEmbeddings, generateEmbedding } from "../llm/embeddings";

type FindRelatedResult = {
  related: RelatedCardRef[];
  queryEmbedding: number[] | null;
};

const MAX_RELATED = 2;
const MAX_CANDIDATES = 50;

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
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

const buildReason = (summary: string): string => {
  const snippet = summary.trim().replace(/\s+/g, " ").slice(0, 96);
  return snippet.length > 0 ? `Similar thread: ${snippet}${summary.length > 96 ? "..." : ""}` : "Similar thread from an earlier card.";
};

export const findRelatedCards = async (
  summaryForRetrieval: string,
  excludeItemId: number
): Promise<FindRelatedResult> => {
  const candidates = listRecallCandidates(excludeItemId, MAX_CANDIDATES);
  const queryEmbedding = canUseEmbeddings()
    ? await generateEmbedding(summaryForRetrieval).catch(() => null)
    : null;

  const scored = candidates.map((candidate) => {
    const lexical = lexicalSimilarity(summaryForRetrieval, candidate.summaryForRetrieval);
    const embedding = queryEmbedding !== null && candidate.embedding !== null
      ? cosineSimilarity(queryEmbedding, candidate.embedding)
      : null;
    const recencyBoost = Math.max(0, 1 - (Date.now() - candidate.createdAt) / (1000 * 60 * 60 * 24 * 30)) * 0.05;
    const finalScore = (embedding !== null ? (embedding * 0.75) + (lexical * 0.25) : lexical) + recencyBoost;

    return {
      candidate,
      finalScore
    };
  });

  const threshold = queryEmbedding !== null ? 0.35 : 0.18;
  const related = scored
    .filter((entry) => entry.finalScore >= threshold)
    .sort((left, right) => right.finalScore - left.finalScore)
    .slice(0, MAX_RELATED)
    .map((entry) => ({
      cardId: entry.candidate.cardId,
      title: entry.candidate.title,
      reason: buildReason(entry.candidate.summaryForRetrieval)
    }));

  return {
    related,
    queryEmbedding
  };
};
