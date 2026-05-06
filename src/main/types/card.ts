export type RelatedCardRef = {
  cardId: number;
  title: string;
  reason: string;
};

export type CardRecord = {
  id: number;
  itemId: number;
  title: string;
  useFor: string;
  knowledgeTag: string;
  summaryForRetrieval: string;
  related: RelatedCardRef[];
  petRemark: string;
  createdAt: number;
};
