import type { ClaudeDispatchMeta } from "./claude";

export type RelatedCardRef = {
  cardId: number;
  title: string;
  reason: string;
};

export type ThreadCache = {
  chasing: string;
  workingJudgment: string | null;
  ruledOut: string | null;
  nextMove: string;
  sideThread: string | null;
  expiresWhen: string | null;
};

export type CardRecord = {
  id: number;
  itemId: number;
  title: string;
  useFor: string;
  knowledgeTag: string;
  summaryForRetrieval: string;
  threadCache: ThreadCache | null;
  related: RelatedCardRef[];
  petRemark: string;
  createdAt: number;
  latestClaudeDispatch?: ClaudeDispatchMeta | null;
};
