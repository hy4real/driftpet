export type TelegramPollerLifecycle =
  | "disabled"
  | "starting"
  | "polling"
  | "conflict"
  | "error"
  | "stopped";

export type TelegramPollerRuntimeState = {
  enabled: boolean;
  active: boolean;
  lifecycle: TelegramPollerLifecycle;
  lastOffset: number | null;
  lastPollAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
};

const INITIAL_STATE: TelegramPollerRuntimeState = {
  enabled: false,
  active: false,
  lifecycle: "stopped",
  lastOffset: null,
  lastPollAt: null,
  lastSuccessAt: null,
  lastError: null
};

let runtimeState: TelegramPollerRuntimeState = {
  ...INITIAL_STATE
};

const updateRuntimeState = (
  nextState: Partial<TelegramPollerRuntimeState>
): TelegramPollerRuntimeState => {
  runtimeState = {
    ...runtimeState,
    ...nextState
  };

  return getTelegramPollerRuntimeState();
};

export const resetTelegramPollerRuntimeState = (): TelegramPollerRuntimeState => {
  runtimeState = {
    ...INITIAL_STATE
  };

  return getTelegramPollerRuntimeState();
};

export const getTelegramPollerRuntimeState = (): TelegramPollerRuntimeState => {
  return {
    ...runtimeState
  };
};

export const markTelegramPollerDisabled = (reason: string): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    enabled: false,
    active: false,
    lifecycle: "disabled",
    lastError: reason
  });
};

export const markTelegramPollerStarting = (offset: number): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    enabled: true,
    active: true,
    lifecycle: "starting",
    lastOffset: offset,
    lastPollAt: Date.now(),
    lastError: null
  });
};

export const markTelegramPollerPollSucceeded = (offset: number): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    enabled: true,
    active: true,
    lifecycle: "polling",
    lastOffset: offset,
    lastPollAt: Date.now(),
    lastSuccessAt: Date.now(),
    lastError: null
  });
};

export const markTelegramPollerConflict = (message: string): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    enabled: true,
    active: true,
    lifecycle: "conflict",
    lastPollAt: Date.now(),
    lastError: message
  });
};

export const markTelegramPollerError = (message: string): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    enabled: true,
    active: true,
    lifecycle: "error",
    lastPollAt: Date.now(),
    lastError: message
  });
};

export const markTelegramPollerStopped = (): TelegramPollerRuntimeState => {
  return updateRuntimeState({
    active: false,
    lifecycle: runtimeState.enabled ? "stopped" : runtimeState.lifecycle
  });
};
