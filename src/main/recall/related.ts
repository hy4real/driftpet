import type { RelatedCardRef } from "../types/card";
import { listRecallCandidates } from "../db/embeddings";
import { canUseEmbeddings, generateEmbedding } from "../llm/embeddings";
import { detectOutputLanguage } from "../llm/language";
import type { ItemSource } from "../types/item";
import {
  cosineSimilarity,
  isNearDuplicateChaosReset,
  lexicalSimilarity,
  passesRelatedThreshold,
} from "./scoring";

type FindRelatedResult = {
  related: RelatedCardRef[];
  queryEmbedding: number[] | null;
};

type RelatedQuery = {
  source: ItemSource;
  title: string;
  summaryForRetrieval: string;
  rawUrl?: string | null;
};

const MAX_RELATED = 2;
const MAX_CANDIDATES = 50;

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

const normalizeUrlForRecall = (value: string): string => {
  try {
    const parsed = new URL(value);
    let pathname = parsed.pathname.replace(/\/+$/, "");

    if (parsed.hostname === "developer.mozilla.org") {
      pathname = pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?\//, "/");
    }

    return `${parsed.hostname}${pathname}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
};

const isSameUrlReference = (
  query: RelatedQuery,
  candidate: Awaited<ReturnType<typeof listRecallCandidates>>[number]
): boolean => {
  if (query.source !== "tg_url" || candidate.source !== "tg_url") {
    return false;
  }

  if (query.rawUrl === undefined || query.rawUrl === null || candidate.rawUrl === null) {
    return false;
  }

  return normalizeUrlForRecall(query.rawUrl) === normalizeUrlForRecall(candidate.rawUrl);
};

export const isCrossLanguageTelegramTextRecall = (
  query: RelatedQuery,
  candidate: Awaited<ReturnType<typeof listRecallCandidates>>[number]
): boolean => {
  if (query.source !== "tg_text" || candidate.source !== "tg_text") {
    return false;
  }

  const queryLanguage = detectOutputLanguage(query.title, query.summaryForRetrieval);
  const candidateLanguage = detectOutputLanguage(candidate.title, candidate.summaryForRetrieval);
  return queryLanguage !== candidateLanguage;
};


export const findRelatedCards = async (
  query: RelatedQuery,
  excludeItemId: number
): Promise<FindRelatedResult> => {
  const candidates = listRecallCandidates(excludeItemId, MAX_CANDIDATES)
    .filter(isRecallEligible)
    .filter((candidate) => !isSameUrlReference(query, candidate))
    .filter((candidate) => !isCrossLanguageTelegramTextRecall(query, candidate));
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
    .filter((entry) => passesRelatedThreshold(query, entry))
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
