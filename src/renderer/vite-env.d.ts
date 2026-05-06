/// <reference types="vite/client" />

import type { CardRecord } from "../main/types/card";
import type { AppStatus } from "../main/types/status";

declare global {
  interface Window {
    driftpet: {
      showDemo: () => Promise<CardRecord>;
      listRecentCards: () => Promise<CardRecord[]>;
      getStatus: () => Promise<AppStatus>;
      ingestManualText: (rawText: string) => Promise<CardRecord>;
      onCardCreated: (listener: (card: CardRecord) => void) => () => void;
    };
  }
}

export {};
