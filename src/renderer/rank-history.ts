import type { CardRecord } from "../main/types/card";

const THREAD_COOLING_AFTER_MS = 2 * 60 * 60 * 1000;
const HISTORY_STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const GENERIC_KNOWLEDGE_TAGS = new Set([
  "telegram ping",
  "link retry",
  "链接待重试",
  "captured article",
  "捕获文章",
  "note workflow",
  "video-to-note",
  "article-to-note",
  "chaos reset",
  "线程复位",
]);

type RankHistoryCardsOptions = {
  recentlyReleasedCardId?: number | null;
  anchorCard?: CardRecord | null;
  now?: number;
};

const normalizeTag = (value: string): string => value.trim().toLowerCase();

const isGenericKnowledgeTag = (value: string): boolean => {
  const normalized = normalizeTag(value);
  return GENERIC_KNOWLEDGE_TAGS.has(normalized)
    || normalized.includes("workflow")
    || normalized.endsWith("-to-note");
};

const getRelationScore = (card: CardRecord, anchorCard: CardRecord | null): number => {
  if (anchorCard === null) {
    return 0;
  }
  if (card.id === anchorCard.id) {
    return 3;
  }
  if (
    anchorCard.related.some((related) => related.cardId === card.id)
    || card.related.some((related) => related.cardId === anchorCard.id)
  ) {
    return 2;
  }
  if (
    !isGenericKnowledgeTag(anchorCard.knowledgeTag)
    && normalizeTag(card.knowledgeTag) === normalizeTag(anchorCard.knowledgeTag)
  ) {
    return 1;
  }
  return 0;
};

const getActivityScore = (card: CardRecord, now: number): number => {
  const cache = card.threadCache;
  if (cache?.waitingOn) {
    return 2;
  }
  if (
    cache?.waitingResolvedAt != null
    && now - cache.waitingResolvedAt < THREAD_COOLING_AFTER_MS
  ) {
    return 1;
  }
  return 0;
};

const getResultScore = (card: CardRecord): number =>
  card.latestClaudeDispatch?.resultSummary?.trim().length ? 1 : 0;

const getStalePenalty = (
  card: CardRecord,
  anchorCard: CardRecord | null,
  now: number
): number => {
  const isRelated = getRelationScore(card, anchorCard) > 0;
  const hasActivity = getActivityScore(card, now) > 0;
  const hasResult = getResultScore(card) > 0;
  if (isRelated || hasActivity || hasResult) {
    return 0;
  }
  return now - card.createdAt >= HISTORY_STALE_AFTER_MS ? 1 : 0;
};

export const rankHistoryCards = (
  cards: CardRecord[],
  {
    recentlyReleasedCardId = null,
    anchorCard = null,
    now = Date.now(),
  }: RankHistoryCardsOptions = {}
): CardRecord[] => {
  return [...cards].sort((left, right) => {
    const leftReleased = left.id === recentlyReleasedCardId ? 1 : 0;
    const rightReleased = right.id === recentlyReleasedCardId ? 1 : 0;
    if (leftReleased !== rightReleased) {
      return rightReleased - leftReleased;
    }

    const leftRelation = getRelationScore(left, anchorCard);
    const rightRelation = getRelationScore(right, anchorCard);
    if (leftRelation !== rightRelation) {
      return rightRelation - leftRelation;
    }

    const leftActivity = getActivityScore(left, now);
    const rightActivity = getActivityScore(right, now);
    if (leftActivity !== rightActivity) {
      return rightActivity - leftActivity;
    }

    const leftResult = getResultScore(left);
    const rightResult = getResultScore(right);
    if (leftResult !== rightResult) {
      return rightResult - leftResult;
    }

    const leftStalePenalty = getStalePenalty(left, anchorCard, now);
    const rightStalePenalty = getStalePenalty(right, anchorCard, now);
    if (leftStalePenalty !== rightStalePenalty) {
      return leftStalePenalty - rightStalePenalty;
    }

    return right.createdAt - left.createdAt;
  });
};
