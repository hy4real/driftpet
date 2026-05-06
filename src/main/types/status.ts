export type StatusLevel = "ok" | "warn" | "idle";

export type StatusSection = {
  level: StatusLevel;
  summary: string;
  detail: string;
};

export type LatestItemStatus = {
  id: number;
  title: string;
  source: string;
  status: string;
  receivedAt: number;
  lastError: string | null;
};

export type AppStatus = {
  checkedAt: number;
  telegram: StatusSection & {
    enabled: boolean;
    lastUpdateId: number | null;
    recentTelegramItems: number;
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
