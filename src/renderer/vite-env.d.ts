/// <reference types="vite/client" />

import type { CardRecord } from "../main/types/card";
import type { AppStatus, PetMode } from "../main/types/status";

declare global {
  interface Window {
    driftpet: {
      showDemo: () => Promise<CardRecord>;
      listRecentCards: () => Promise<CardRecord[]>;
      getStatus: () => Promise<AppStatus>;
      ingestManualText: (rawText: string) => Promise<CardRecord>;
      ingestChaosReset: (rawText: string) => Promise<CardRecord>;
      setPetMode: (mode: PetMode) => Promise<void>;
      setPetHourlyBudget: (value: number) => Promise<number>;
      onCardCreated: (listener: (card: CardRecord) => void) => () => void;
    };
  }
}

export {};
