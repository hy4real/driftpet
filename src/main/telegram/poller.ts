import { getPref, setPref } from "../db/prefs";
import { ensureEnvLoaded } from "../env";
import { ingestInput } from "../ingest/ingest";
import type { CardRecord } from "../types/card";
import { enrichTelegramInput } from "./enrich-input";
import { parseTelegramMessage } from "./parse-message";

ensureEnvLoaded();

type TelegramMessage = {
  message_id: number;
  chat: {
    id: number;
  };
  text?: string;
  caption?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
  caption_entities?: Array<{
    type: string;
    offset: number;
    length: number;
    url?: string;
  }>;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramApiResponse = {
  ok: boolean;
  result: TelegramUpdate[];
};

type StartTelegramPollerArgs = {
  onCardCreated: (card: CardRecord) => void;
};

const TELEGRAM_OFFSET_PREF = "telegram_last_update_id";
const TELEGRAM_TIMEOUT_SECONDS = 20;
const RETRY_DELAY_MS = 1500;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const getTelegramOffset = (): number => {
  const rawValue = getPref(TELEGRAM_OFFSET_PREF);
  if (rawValue === null) {
    return 0;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const persistTelegramOffset = (updateId: number): void => {
  setPref(TELEGRAM_OFFSET_PREF, String(updateId));
};

const buildUpdatesUrl = (token: string, offset: number): string => {
  const params = new URLSearchParams({
    timeout: String(TELEGRAM_TIMEOUT_SECONDS)
  });

  if (offset > 0) {
    params.set("offset", String(offset + 1));
  }

  return `https://api.telegram.org/bot${token}/getUpdates?${params.toString()}`;
};

export const processTelegramUpdates = async (
  updates: TelegramUpdate[],
  onCardCreated: (card: CardRecord) => void
): Promise<number> => {
  let lastProcessedId = getTelegramOffset();

  for (const update of updates) {
    if (update.update_id <= lastProcessedId) {
      continue;
    }

    if (update.message !== undefined) {
      const parsed = parseTelegramMessage(update.message);
      if (parsed !== null) {
        const enriched = await enrichTelegramInput(parsed);
        const card = await ingestInput(enriched);
        onCardCreated(card);
      }
    }

    persistTelegramOffset(update.update_id);
    lastProcessedId = update.update_id;
  }

  return lastProcessedId;
};

export const startTelegramPoller = ({
  onCardCreated
}: StartTelegramPollerArgs): (() => void) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) {
    console.log("[driftpet] Telegram poller disabled: TELEGRAM_BOT_TOKEN is missing.");
    return () => {};
  }

  let active = true;
  const controller = new AbortController();

  const loop = async (): Promise<void> => {
    while (active) {
      try {
        const offset = getTelegramOffset();
        const response = await fetch(buildUpdatesUrl(token, offset), {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Telegram getUpdates failed with HTTP ${response.status}.`);
        }

        const payload = await response.json() as TelegramApiResponse;
        if (!payload.ok) {
          throw new Error("Telegram API returned ok=false.");
        }

        await processTelegramUpdates(payload.result, onCardCreated);
      } catch (error) {
        if (!active) {
          break;
        }

        if (error instanceof Error && error.name === "AbortError") {
          break;
        }

        console.error("[driftpet] Telegram polling error:", error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  };

  void loop();

  return () => {
    active = false;
    controller.abort();
  };
};
