import type { CardRecord } from "../main/types/card";
import type { ThreadBundle, ThreadBundleMember, ThreadBundleReason } from "../main/types/thread";

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

const normalizeKnowledgeTag = (value: string): string => {
  return value.trim().toLowerCase();
};

export const isGenericKnowledgeTag = (value: string): boolean => {
  const normalized = normalizeKnowledgeTag(value);
  return GENERIC_KNOWLEDGE_TAGS.has(normalized)
    || normalized.includes("workflow")
    || normalized.endsWith("-to-note");
};

const reasonPriority: Record<ThreadBundleReason, number> = {
  anchor: 0,
  related: 1,
  backlink: 2,
  same_tag: 3,
};

const pushMember = (
  members: ThreadBundleMember[],
  indexByCardId: Map<number, number>,
  card: CardRecord,
  reason: ThreadBundleReason
): void => {
  const existingIndex = indexByCardId.get(card.id);
  if (existingIndex === undefined) {
    indexByCardId.set(card.id, members.length);
    members.push({ card, reason });
    return;
  }

  const existing = members[existingIndex];
  if (reasonPriority[reason] < reasonPriority[existing.reason]) {
    members[existingIndex] = { ...existing, reason };
  }
};

export const buildThreadBundle = (
  anchor: CardRecord | null,
  recentCards: CardRecord[],
  maxCards = 5
): ThreadBundle | null => {
  if (anchor === null) {
    return null;
  }

  const cardsById = new Map(recentCards.map((card) => [card.id, card]));
  const members: ThreadBundleMember[] = [];
  const indexByCardId = new Map<number, number>();

  pushMember(members, indexByCardId, anchor, "anchor");

  for (const related of anchor.related) {
    const linked = cardsById.get(related.cardId);
    if (linked !== undefined) {
      pushMember(members, indexByCardId, linked, "related");
    }
  }

  for (const candidate of recentCards) {
    if (candidate.id === anchor.id) {
      continue;
    }

    if (candidate.related.some((related) => related.cardId === anchor.id)) {
      pushMember(members, indexByCardId, candidate, "backlink");
    }
  }

  if (!isGenericKnowledgeTag(anchor.knowledgeTag)) {
    const anchorTag = normalizeKnowledgeTag(anchor.knowledgeTag);
    for (const candidate of recentCards) {
      if (candidate.id === anchor.id) {
        continue;
      }

      if (normalizeKnowledgeTag(candidate.knowledgeTag) === anchorTag) {
        pushMember(members, indexByCardId, candidate, "same_tag");
      }
    }
  }

  return {
    anchorCardId: anchor.id,
    anchorTitle: anchor.title,
    anchorKnowledgeTag: anchor.knowledgeTag,
    cards: members.slice(0, maxCards),
  };
};
