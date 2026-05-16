/// <reference types="vite/client" />

import type { CardRecord } from "../main/types/card";
import type { ClipboardOffer } from "../main/clipboard/watcher";
import type { AppStatus } from "../main/types/status";
import type { ClaudeDispatchMeta, ClaudeDispatchUserStatus } from "../main/types/claude";
import type { WorklineLifecycleAction } from "../main/workline/lifecycle";

type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
  source: "builtin" | "driftpet" | "codex" | "petdex";
};

type PetdexRuntimeState = {
  expression: "idle" | "running" | "waiting" | "waving" | "jumping" | "failed" | "review";
  durationMs: number | null;
  updatedAt: number | null;
  counter: number | null;
  agentSource: string | null;
};

type PetdexRuntimeBubble = {
  text: string;
  agentSource: string | null;
  updatedAt: number | null;
  counter: number | null;
};

type ClaudeDispatchSettings = {
  terminalApp: string;
  workingDirectory: string;
  continuityMode: "continuous" | "isolated";
};

type RecoverableChaosDraft = {
  itemId: number;
  rawText: string;
  status: "pending" | "failed";
  receivedAt: number;
  lastError: string | null;
};

declare global {
  interface Window {
    driftpet: {
      showDemo: () => Promise<CardRecord>;
      listRecentCards: () => Promise<CardRecord[]>;
      deleteCard: (cardId: number) => Promise<boolean>;
      updateWorklineLifecycle: (cardId: number, action: WorklineLifecycleAction) => Promise<CardRecord>;
      listCloseLineCandidates: () => Promise<CardRecord[]>;
      skipDailyCloseLine: (cardIds: number[]) => Promise<number>;
      releaseRememberedThread: (cardId: number) => Promise<void>;
      getStatus: () => Promise<AppStatus>;
      getClaudeDispatchSettings: () => Promise<ClaudeDispatchSettings>;
      setClaudeDispatchSettings: (settings: ClaudeDispatchSettings) => Promise<ClaudeDispatchSettings>;
      ingestChaosReset: (rawText: string) => Promise<CardRecord>;
      getRecoverableChaosDraft: () => Promise<RecoverableChaosDraft | null>;
      dispatchClaudeCode: (cardId: number) => Promise<ClaudeDispatchMeta>;
      dispatchClaudeThread: (cardId: number) => Promise<ClaudeDispatchMeta>;
      updateClaudeDispatchStatus: (cardId: number, status: ClaudeDispatchUserStatus) => Promise<ClaudeDispatchMeta>;
      captureClaudeDispatchResult: (cardId: number, resultSummary: string) => Promise<ClaudeDispatchMeta>;
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
      onPetdexRuntimeState: (listener: (state: PetdexRuntimeState) => void) => () => void;
      onPetdexBubble: (listener: (bubble: PetdexRuntimeBubble) => void) => () => void;
    };
  }
}

export {};
