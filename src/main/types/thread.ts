import type { CardRecord } from "./card";

export type ThreadBundleReason = "anchor" | "related" | "backlink" | "same_tag";

export type ThreadBundleMember = {
  card: CardRecord;
  reason: ThreadBundleReason;
};

export type ThreadBundle = {
  anchorCardId: number;
  anchorTitle: string;
  anchorKnowledgeTag: string;
  cards: ThreadBundleMember[];
};
