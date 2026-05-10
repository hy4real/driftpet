import type { ItemOrigin, UrlExtractionStage } from "./item";
import type { RelatedCardRef } from "./card";
import type { ClaudeDispatchMeta } from "./claude";
import type { TelegramPollerLifecycle } from "../telegram/poller-runtime";

export type StatusLevel = "ok" | "warn" | "idle";

export type RememberedThread = {
  cardId: number;
  title: string;
  createdAt: number;
};

export type StatusSection = {
  level: StatusLevel;
  summary: string;
  detail: string;
};

export type LatestCaptureCardStatus = {
  id: number;
  title: string;
  useFor: string;
  knowledgeTag: string;
  petRemark: string;
  related: RelatedCardRef[];
  latestClaudeDispatch: ClaudeDispatchMeta | null;
};

export type LatestCaptureExtractionStatus = {
  hasUrl: boolean;
  rawUrl: string | null;
  extractedTitle: string | null;
  extractedTextPreview: string | null;
  artifactPath: string | null;
  processor: string | null;
  extractionState: "not_applicable" | "fallback" | "extracted" | "failed";
  stage: UrlExtractionStage;
  detail: string | null;
};

export type LatestItemStatus = {
  id: number;
  title: string;
  source: string;
  status: string;
  receivedAt: number;
  rawUrl: string | null;
  rawText: string | null;
  tgMessageId: string | null;
  origin: ItemOrigin;
  lastError: string | null;
  extraction: LatestCaptureExtractionStatus;
  card: LatestCaptureCardStatus | null;
};

export type AppStatus = {
  checkedAt: number;
  pet: StatusSection & {
    enabled: boolean;
    hourlyBudget: number;
    shownThisHour: number;
    canSurfaceAuto: boolean;
    rememberedThread: RememberedThread | null;
  };
  telegram: StatusSection & {
    enabled: boolean;
    lastUpdateId: number | null;
    recentTelegramItems: number;
    pollerState: TelegramPollerLifecycle;
    lastPollAt: number | null;
    lastSuccessAt: number | null;
    lastError: string | null;
    lastProcessedResult: {
      updateId: number;
      tgMessageId: string | null;
      source: string | null;
      rawUrl: string | null;
      artifactPath: string | null;
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
    } | null;
  };
  llm: StatusSection & {
    enabled: boolean;
    provider: string;
    digestModel: string;
    remarkModel: string;
  };
  embeddings: StatusSection & {
    enabled: boolean;
    provider: string;
    model: string | null;
    storedEmbeddings: number;
  };
  storage: StatusSection & {
    items: number;
    cards: number;
    failedItems: number;
    latestItem: LatestItemStatus | null;
  };
};
