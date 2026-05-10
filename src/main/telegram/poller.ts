import { getPref, setPref } from "../db/prefs";
import { ensureEnvLoaded } from "../env";
import { ingestInputDetailed, type IngestInput } from "../ingest/ingest";
import type { CardRecord } from "../types/card";
import { enrichTelegramInput } from "./enrich-input";
import { parseTelegramMessage } from "./parse-message";
import { sendTelegramMessage } from "./telegram-api";
import {
  markTelegramPollerConflict,
  markTelegramPollerDisabled,
  markTelegramPollerError,
  markTelegramPollerPollSucceeded,
  markTelegramPollerStarting,
  markTelegramPollerStopped
} from "./poller-runtime";
import {
  persistTelegramPollerRuntimeState,
  persistTelegramProcessResult
} from "./poller-prefs";

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

type TelegramApiErrorResponse = {
  ok: false;
  error_code?: number;
  description?: string;
};

type StartTelegramPollerArgs = {
  onCardCreated: (card: CardRecord) => void;
};

const TELEGRAM_OFFSET_PREF = "telegram_last_update_id";
const TELEGRAM_TIMEOUT_SECONDS = 20;
const RETRY_DELAY_MS = 1500;
const CONFLICT_RETRY_DELAY_MS = 5000;
const REPORT_PREF_PREFIX = "telegram_report_sent:";

const preview = (value: string | undefined, limit = 160): string | null => {
  if (value === undefined) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
};

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

const syncPersistedRuntimeState = (): void => {
  persistTelegramPollerRuntimeState({
    enabled: true,
    active: false,
    lifecycle: "stopped",
    lastOffset: getTelegramOffset(),
    lastPollAt: null,
    lastSuccessAt: null,
    lastError: null
  });
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

const buildDigestOverride = (
  enriched: Awaited<ReturnType<typeof enrichTelegramInput>>
): IngestInput["digestOverride"] => {
  if (
    typeof enriched.processor !== "string"
    || enriched.processor.length === 0
    || typeof enriched.workflowTitle !== "string"
    || enriched.workflowTitle.length === 0
    || typeof enriched.workflowUseFor !== "string"
    || enriched.workflowUseFor.length === 0
    || typeof enriched.workflowKnowledgeTag !== "string"
    || enriched.workflowKnowledgeTag.length === 0
    || typeof enriched.workflowPetRemark !== "string"
    || enriched.workflowPetRemark.length === 0
  ) {
    return undefined;
  }

  const summaryForRetrieval = (enriched.extractedText ?? enriched.rawText).trim();
  if (summaryForRetrieval.length === 0) {
    return undefined;
  }

  return {
    title: enriched.workflowTitle,
    useFor: enriched.workflowUseFor,
    knowledgeTag: enriched.workflowKnowledgeTag,
    summaryForRetrieval,
    petRemark: enriched.workflowPetRemark
  };
};

const buildReportPrefKey = (tgMessageId: string): string => {
  return `${REPORT_PREF_PREFIX}${tgMessageId}`;
};

const hasSentTelegramReport = (tgMessageId: string): boolean => {
  return getPref(buildReportPrefKey(tgMessageId)) !== null;
};

const markTelegramReportSent = (tgMessageId: string): void => {
  setPref(buildReportPrefKey(tgMessageId), String(Date.now()));
};

const summarize = (value: string, limit: number): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
};

const buildTelegramReportText = (
  enriched: Awaited<ReturnType<typeof enrichTelegramInput>>,
  card: CardRecord,
  created: boolean
): string => {
  const outcome = enriched.itemStatus === "failed" ? "失败" : "完成";
  const artifactLine = enriched.artifactPath === null ? "无" : enriched.artifactPath;
  const errorLine = enriched.extractionError ?? enriched.lastError ?? null;
  const lines = [
    `${created ? "✅" : "↩️"} 已${outcome}`,
    `标题：${card.title}`,
    `卡片：#${card.id}`,
    `处理器：${enriched.processor ?? "unknown"}`,
    `产物：${artifactLine}`
  ];

  if (errorLine !== null && errorLine.trim().length > 0) {
    lines.push(`说明：${summarize(errorLine, 260)}`);
  }

  return lines.join("\n");
};

const maybeSendTelegramReport = async (
  token: string,
  message: TelegramMessage,
  enriched: Awaited<ReturnType<typeof enrichTelegramInput>>,
  card: CardRecord,
  created: boolean
): Promise<void> => {
  if (token.trim().length === 0) {
    return;
  }

  if (enriched.source !== "tg_url" || enriched.rawUrl === null) {
    return;
  }

  if (hasSentTelegramReport(enriched.tgMessageId)) {
    return;
  }

  const reportText = buildTelegramReportText(enriched, card, created);
  await sendTelegramMessage(token, message.chat.id, reportText, message.message_id);
  markTelegramReportSent(enriched.tgMessageId);
};

export const processTelegramUpdates = async (
  token: string,
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
        const result = await ingestInputDetailed({
          ...enriched,
          digestOverride: buildDigestOverride(enriched)
        });
        persistTelegramProcessResult({
          updateId: update.update_id,
          tgMessageId: enriched.tgMessageId,
          source: enriched.source,
          rawUrl: enriched.rawUrl,
          artifactPath: enriched.artifactPath ?? null,
          created: result.created,
          cardId: result.card.id,
          cardTitle: result.card.title,
          processor: enriched.processor ?? null,
          extractionStage: enriched.extractionStage ?? null,
          itemStatus: enriched.itemStatus ?? null,
          textPreview: preview(update.message.text),
          captionPreview: preview(update.message.caption),
          entityTypes: [
            ...(update.message.entities ?? []).map((entity) => entity.type),
            ...(update.message.caption_entities ?? []).map((entity) => entity.type)
          ],
          note: result.created ? "created_or_updated_card" : "dedup_reused_existing_card"
        });
        if (result.created) {
          onCardCreated(result.card);
        }

        await maybeSendTelegramReport(
          token,
          update.message,
          enriched,
          result.card,
          result.created
        );
      } else {
        persistTelegramProcessResult({
          updateId: update.update_id,
          tgMessageId: `${update.message.chat.id}:${update.message.message_id}`,
          source: null,
          rawUrl: null,
          artifactPath: null,
          created: null,
          cardId: null,
          cardTitle: null,
          processor: null,
          extractionStage: null,
          itemStatus: null,
          textPreview: preview(update.message.text),
          captionPreview: preview(update.message.caption),
          entityTypes: [
            ...(update.message.entities ?? []).map((entity) => entity.type),
            ...(update.message.caption_entities ?? []).map((entity) => entity.type)
          ],
          note: "ignored_empty_text_or_caption"
        });
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
    const state = markTelegramPollerDisabled("TELEGRAM_BOT_TOKEN is not set.");
    persistTelegramPollerRuntimeState(state);
    console.log("[driftpet] Telegram 轮询已关闭：TELEGRAM_BOT_TOKEN 未设置。");
    return () => {};
  }

  let active = true;
  const controller = new AbortController();
  syncPersistedRuntimeState();

  const loop = async (): Promise<void> => {
    while (active) {
      try {
        const offset = getTelegramOffset();
        persistTelegramPollerRuntimeState(markTelegramPollerStarting(offset));
        const response = await fetch(buildUpdatesUrl(token, offset), {
          signal: AbortSignal.any([AbortSignal.timeout((TELEGRAM_TIMEOUT_SECONDS + 5) * 1000), controller.signal])
        });

        const responseText = await response.text();
        let parsedResponse: TelegramApiResponse | TelegramApiErrorResponse | null = null;
        try {
          parsedResponse = JSON.parse(responseText) as TelegramApiResponse | TelegramApiErrorResponse;
        } catch {
          parsedResponse = null;
        }

        if (!response.ok) {
          const description = parsedResponse !== null && "description" in parsedResponse && typeof parsedResponse.description === "string"
            ? parsedResponse.description
            : `Telegram getUpdates failed with HTTP ${response.status}.`;

          if (response.status === 409) {
            persistTelegramPollerRuntimeState(markTelegramPollerConflict(description));
            console.error("[driftpet] Telegram 轮询冲突:", description);
            await sleep(CONFLICT_RETRY_DELAY_MS);
            continue;
          }

          throw new Error(description);
        }

        if (parsedResponse === null) {
          throw new Error("Telegram getUpdates returned invalid JSON.");
        }

        const payload = parsedResponse as TelegramApiResponse;
        if (!payload.ok) {
          const errorPayload = parsedResponse as TelegramApiErrorResponse;
          if (errorPayload.error_code === 409) {
            const description = errorPayload.description ?? "Telegram getUpdates conflict.";
            persistTelegramPollerRuntimeState(markTelegramPollerConflict(description));
            console.error("[driftpet] Telegram 轮询冲突:", description);
            await sleep(CONFLICT_RETRY_DELAY_MS);
            continue;
          }

          throw new Error(errorPayload.description ?? "Telegram API returned ok=false.");
        }

        const processedOffset = await processTelegramUpdates(token, payload.result, onCardCreated);
        persistTelegramPollerRuntimeState(markTelegramPollerPollSucceeded(processedOffset));
      } catch (error) {
        if (!active) {
          break;
        }

        if (error instanceof Error && error.name === "AbortError") {
          break;
        }

        const message = error instanceof Error ? error.message : "Telegram poller failed.";
        persistTelegramPollerRuntimeState(markTelegramPollerError(message));
        console.error("[driftpet] Telegram 轮询异常:", error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  };

  void loop();

  return () => {
    active = false;
    controller.abort();
    persistTelegramPollerRuntimeState(markTelegramPollerStopped());
  };
};
