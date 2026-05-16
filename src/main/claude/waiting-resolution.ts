import type { ThreadCache } from "../types/card";

export const clearResolvedWaiting = (
  threadCache: ThreadCache | null,
  resolvedAt = Date.now()
): ThreadCache | null => {
  if (threadCache === null) {
    return null;
  }

  const hadWaitingSignal = threadCache.waitingOn !== null || threadCache.meanwhile !== null;
  if (!hadWaitingSignal) {
    return threadCache.waitingResolvedAt === undefined
      ? threadCache
      : {
        ...threadCache,
        waitingResolvedAt: threadCache.waitingResolvedAt ?? null,
      };
  }

  return {
    ...threadCache,
    meanwhile: null,
    waitingOn: null,
    waitingResolvedAt: resolvedAt,
  };
};
