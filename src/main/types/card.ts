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
  meanwhile: string | null;
  waitingOn: string | null;
  waitingResolvedAt?: number | null;
  sideThread: string | null;
  expiresWhen: string | null;
};

export const CARD_LIFECYCLE_STATUSES = ["hot", "waiting", "cooling", "archived", "dropped"] as const;

export type CardLifecycleStatus = typeof CARD_LIFECYCLE_STATUSES[number];

export const isCardLifecycleStatus = (value: unknown): value is CardLifecycleStatus => {
  return typeof value === "string" && CARD_LIFECYCLE_STATUSES.includes(value as CardLifecycleStatus);
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
  lifecycleStatus: CardLifecycleStatus;
  ttlAt: number | null;
  recoverUntil: number | null;
  threadId: string | null;
  lastTouchedAt: number | null;
  tomorrowFloatAt: number | null;
  tomorrowFloatedAt: number | null;
  latestClaudeDispatch?: ClaudeDispatchMeta | null;
};
