import type { CardRecord, ThreadCache } from "../main/types/card";
import { getGuardedThreadAgeState, THREAD_COOLING_AFTER_MS } from "./guarded-thread";

export type ThreadWaitingState = "none" | "active" | "resolved";
export type ThreadWaitingAge = "fresh" | "cooling" | "cold" | "resolved_fresh" | "resolved_settled";

export type ThreadWaitingReminder = {
  state: ThreadWaitingState;
  age: ThreadWaitingAge;
  waitingOn: string | null;
  meanwhile: string | null;
  resolvedAt: number | null;
};

const extractLegacyWaitingFromSideThread = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const zhMatch = value.match(/(?:等待|等[^。！？\n，,]*(?:回复|结果|消息|确认|同步|跑完|通过|回音)|卡在[^。！？\n，,]*等[^。！？\n，,]*)/u);
  if (zhMatch !== null) {
    return zhMatch[0].trim();
  }

  const enMatch = value.match(/\b(?:wait(?:ing)? for|blocked on|pending|until .*reply)\b([^.!?\n]*)/i);
  if (enMatch !== null) {
    return enMatch[0].trim();
  }

  return null;
};

const buildThreadWaitingReminder = (
  cache: ThreadCache | null,
  createdAt: number | null,
  now: number
): ThreadWaitingReminder => {
  if (cache === null) {
    return {
      state: "none",
      age: "fresh",
      waitingOn: null,
      meanwhile: null,
      resolvedAt: null,
    };
  }

  const resolvedAt = cache.waitingResolvedAt ?? null;
  const explicitWaitingOn = cache.waitingOn ?? null;
  const explicitMeanwhile = cache.meanwhile ?? null;
  const waitingOn = explicitWaitingOn ?? (resolvedAt === null ? extractLegacyWaitingFromSideThread(cache.sideThread) : null);
  const meanwhile = explicitMeanwhile ?? (waitingOn !== null ? cache.nextMove : null);
  const ageState = getGuardedThreadAgeState(createdAt, now);

  if (waitingOn !== null) {
    return {
      state: "active",
      age: ageState,
      waitingOn,
      meanwhile,
      resolvedAt,
    };
  }

  if (resolvedAt !== null) {
    return {
      state: "resolved",
      age: now - resolvedAt < THREAD_COOLING_AFTER_MS ? "resolved_fresh" : "resolved_settled",
      waitingOn: null,
      meanwhile: null,
      resolvedAt,
    };
  }

  return {
    state: "none",
    age: ageState,
    waitingOn: null,
    meanwhile: null,
    resolvedAt: null,
  };
};

export const getThreadCacheWaitingReminder = (
  cache: ThreadCache | null,
  createdAt: number | null = null,
  now = Date.now()
): ThreadWaitingReminder =>
  buildThreadWaitingReminder(cache, createdAt, now);

export const getThreadWaitingReminder = (
  card: CardRecord | null,
  now = Date.now()
): ThreadWaitingReminder =>
  buildThreadWaitingReminder(card?.threadCache ?? null, card?.createdAt ?? null, now);

export const getThreadCacheWaitingOn = (cache: ThreadCache | null): string | null =>
  getThreadCacheWaitingReminder(cache).waitingOn;

export const getThreadCacheMeanwhile = (cache: ThreadCache | null): string | null =>
  getThreadCacheWaitingReminder(cache).meanwhile;

export const getCardWaitingOn = (card: CardRecord | null): string | null =>
  getThreadWaitingReminder(card).waitingOn;

export const getCardMeanwhile = (card: CardRecord | null): string | null =>
  getThreadWaitingReminder(card).meanwhile;
