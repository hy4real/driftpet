import type { CardRecord } from "../main/types/card";
import type { RememberedThread } from "../main/types/status";

export type GuardedThreadAgeState = "fresh" | "cooling" | "cold";

export const THREAD_COOLING_AFTER_MS = 2 * 60 * 60 * 1000;
export const THREAD_COLD_AFTER_MS = 24 * 60 * 60 * 1000;

export const clampGuardedThreadLabel = (value: string, maxLength = 28): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
};

export const getGuardedThreadAgeState = (
  createdAt: number | null,
  now: number
): GuardedThreadAgeState => {
  if (createdAt === null) {
    return "fresh";
  }

  const ageMs = Math.max(0, now - createdAt);
  if (ageMs >= THREAD_COLD_AFTER_MS) {
    return "cold";
  }
  if (ageMs >= THREAD_COOLING_AFTER_MS) {
    return "cooling";
  }

  return "fresh";
};

export const getGuardedThreadProgress = (createdAt: number | null, now: number): number => {
  if (createdAt === null) {
    return 1;
  }

  const ageMs = Math.max(0, now - createdAt);
  return Math.max(0, Math.min(1, 1 - (ageMs / THREAD_COLD_AFTER_MS)));
};

export const guardedThreadVerbByAge: Record<GuardedThreadAgeState, string> = {
  fresh: "正在追",
  cooling: "线变冷",
  cold: "可放下",
};

export const guardedThreadActionPrefixByAge: Record<GuardedThreadAgeState, string> = {
  fresh: "下一手",
  cooling: "趁热接",
  cold: "先判定",
};

export const getGuardedThreadTitle = (
  card: CardRecord | null,
  thread: RememberedThread | null
): string | null => {
  if (card?.threadCache !== null && card?.threadCache !== undefined) {
    return card.threadCache.chasing;
  }

  return thread?.title ?? null;
};

export const getGuardedThreadNextMove = (card: CardRecord | null): string | null => {
  return card?.threadCache?.nextMove ?? null;
};

export const getGuardedThreadExpiresWhen = (card: CardRecord | null): string | null => {
  return card?.threadCache?.expiresWhen ?? null;
};

export const formatGuardedThreadActionLabel = (
  ageState: GuardedThreadAgeState,
  nextMove: string | null,
  expiresWhen: string | null,
  maxLength: number
): string => {
  if (ageState === "cold" && expiresWhen !== null) {
    return `冷掉条件：${clampGuardedThreadLabel(expiresWhen, maxLength)}`;
  }

  if (nextMove !== null) {
    return `${guardedThreadActionPrefixByAge[ageState]}：${clampGuardedThreadLabel(nextMove, maxLength)}`;
  }

  if (ageState === "cooling") {
    return "这条线有点冷";
  }
  if (ageState === "cold") {
    return "可以放下或接回";
  }

  return "点击接回这条线";
};
