export type ItemSource = "manual_chaos" | "tg_text" | "tg_url";

export type ItemStatus = "pending" | "digested" | "failed";
export type ItemOrigin = "real" | "synthetic";

export type ItemRecord = {
  id: number;
  source: ItemSource;
  rawUrl: string | null;
  rawText: string | null;
  extractedTitle: string | null;
  extractedText: string | null;
  contentHash: string | null;
  tgMessageId: string | null;
  receivedAt: number;
  status: ItemStatus;
  origin: ItemOrigin;
  lastError: string | null;
};
