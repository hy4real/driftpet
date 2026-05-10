import { getPref, setPref } from "../db/prefs";
import type { TelegramPollerRuntimeState } from "./poller-runtime";

export const TELEGRAM_POLLER_RUNTIME_PREF = "telegram_poller_runtime";
export const TELEGRAM_LAST_RESULT_PREF = "telegram_last_processed_result";

export type PersistedTelegramPollerRuntimeState = TelegramPollerRuntimeState & {
  updatedAt: number;
};

export type PersistedTelegramProcessResult = {
  updateId: number;
  tgMessageId: string | null;
  source: string | null;
  rawUrl: string | null;
  created: boolean | null;
  cardId: number | null;
  cardTitle: string | null;
  processor: string | null;
  extractionStage: string | null;
  itemStatus: string | null;
  textPreview: string | null;
  captionPreview: string | null;
  entityTypes: string[];
  note: string | null;
  updatedAt: number;
};

const parseJsonPref = <T>(key: string): T | null => {
  const raw = getPref(key);
  if (raw === null || raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const persistTelegramPollerRuntimeState = (
  state: TelegramPollerRuntimeState
): PersistedTelegramPollerRuntimeState => {
  const payload: PersistedTelegramPollerRuntimeState = {
    ...state,
    updatedAt: Date.now()
  };
  setPref(TELEGRAM_POLLER_RUNTIME_PREF, JSON.stringify(payload));
  return payload;
};

export const readPersistedTelegramPollerRuntimeState = (): PersistedTelegramPollerRuntimeState | null => {
  return parseJsonPref<PersistedTelegramPollerRuntimeState>(TELEGRAM_POLLER_RUNTIME_PREF);
};

export const persistTelegramProcessResult = (
  result: Omit<PersistedTelegramProcessResult, "updatedAt">
): PersistedTelegramProcessResult => {
  const payload: PersistedTelegramProcessResult = {
    ...result,
    updatedAt: Date.now()
  };
  setPref(TELEGRAM_LAST_RESULT_PREF, JSON.stringify(payload));
  return payload;
};

export const readPersistedTelegramProcessResult = (): PersistedTelegramProcessResult | null => {
  return parseJsonPref<PersistedTelegramProcessResult>(TELEGRAM_LAST_RESULT_PREF);
};
