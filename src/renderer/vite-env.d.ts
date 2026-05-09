/// <reference types="vite/client" />

import type { CardRecord } from "../main/types/card";
import type { ClipboardOffer } from "../main/clipboard/watcher";
import type { AppStatus } from "../main/types/status";

type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
};

declare global {
  interface Window {
    driftpet: {
      showDemo: () => Promise<CardRecord>;
      listRecentCards: () => Promise<CardRecord[]>;
      getStatus: () => Promise<AppStatus>;
      ingestChaosReset: (rawText: string) => Promise<CardRecord>;
      setPetHourlyBudget: (value: number) => Promise<number>;
      setWindowSize: (windowSize: "mini" | "compact" | "expanded") => Promise<void>;
      setMiniBubbleVisible: (visible: boolean) => Promise<void>;
      moveWindowBy: (deltaX: number, deltaY: number) => void;
      petList: () => Promise<PetInfo[]>;
      petActive: () => Promise<{ slug: string; spritesheetPath: string }>;
      petSetActive: (slug: string) => Promise<void>;
      petInstall: (input: string) => Promise<{ slug: string; displayName: string }>;
      onCardCreated: (listener: (card: CardRecord) => void) => () => void;
      onClipboardOffer: (listener: (offer: ClipboardOffer) => void) => () => void;
      onPetActiveChanged: (listener: (assets: { slug: string; spritesheetPath: string }) => void) => () => void;
    };
  }
}

export {};
