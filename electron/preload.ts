import { contextBridge, ipcRenderer } from "electron";
import type { CardRecord } from "../src/main/types/card";
import type { ClipboardOffer } from "../src/main/clipboard/watcher";
import type { AppStatus } from "../src/main/types/status";
import type { ClaudeDispatchMeta, ClaudeDispatchUserStatus } from "../src/main/types/claude";

type CardCreatedListener = (card: CardRecord) => void;
type ClipboardOfferListener = (offer: ClipboardOffer) => void;
type PetActiveChangedListener = (assets: { slug: string; spritesheetPath: string }) => void;
type PetdexRuntimeStateListener = (state: PetdexRuntimeState) => void;
type PetdexRuntimeBubbleListener = (bubble: PetdexRuntimeBubble) => void;

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

type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
  source: "builtin" | "driftpet" | "codex" | "petdex";
};

type ClaudeDispatchSettings = {
  terminalApp: string;
  workingDirectory: string;
  continuityMode: "continuous" | "isolated";
};

const api = {
  showDemo: (): Promise<CardRecord> => ipcRenderer.invoke("pet:show-demo"),
  listRecentCards: (): Promise<CardRecord[]> => ipcRenderer.invoke("cards:list-recent"),
  deleteCard: (cardId: number): Promise<boolean> => ipcRenderer.invoke("cards:delete", cardId),
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke("app:get-status"),
  getClaudeDispatchSettings: (): Promise<ClaudeDispatchSettings> => ipcRenderer.invoke("claude:get-dispatch-settings"),
  setClaudeDispatchSettings: (settings: ClaudeDispatchSettings): Promise<ClaudeDispatchSettings> => ipcRenderer.invoke("claude:set-dispatch-settings", settings),
  ingestChaosReset: (rawText: string): Promise<CardRecord> => ipcRenderer.invoke("ingest:chaos-reset", rawText),
  dispatchClaudeCode: (cardId: number): Promise<ClaudeDispatchMeta> => ipcRenderer.invoke("card:dispatch-claude-code", cardId),
  dispatchClaudeThread: (cardId: number): Promise<ClaudeDispatchMeta> => ipcRenderer.invoke("card:dispatch-claude-thread", cardId),
  updateClaudeDispatchStatus: (cardId: number, status: ClaudeDispatchUserStatus): Promise<ClaudeDispatchMeta> => ipcRenderer.invoke("card:update-claude-dispatch-status", cardId, status),
  captureClaudeDispatchResult: (cardId: number, resultSummary: string): Promise<ClaudeDispatchMeta> => ipcRenderer.invoke("card:capture-claude-dispatch-result", cardId, resultSummary),
  setPetHourlyBudget: (value: number): Promise<number> => ipcRenderer.invoke("pet:set-hourly-budget", value),
  setWindowSize: (windowSize: "mini" | "compact" | "expanded"): Promise<void> => ipcRenderer.invoke("pet:set-window-size", windowSize),
  setMiniBubbleVisible: (visible: boolean): Promise<void> => ipcRenderer.invoke("pet:set-mini-bubble-visible", visible),
  moveWindowBy: (deltaX: number, deltaY: number): void => {
    ipcRenderer.send("pet:move-window-by", deltaX, deltaY);
  },
  petList: (): Promise<PetInfo[]> => ipcRenderer.invoke("pet:list"),
  petActive: (): Promise<{ slug: string; spritesheetPath: string }> => ipcRenderer.invoke("pet:active"),
  petSetActive: (slug: string): Promise<void> => ipcRenderer.invoke("pet:set-active", slug),
  petInstall: (input: string): Promise<{ slug: string; displayName: string }> => ipcRenderer.invoke("pet:install", input),
  onCardCreated: (listener: CardCreatedListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, card: CardRecord) => {
      listener(card);
    };

    ipcRenderer.on("events:card-created", wrapped);

    return () => {
      ipcRenderer.removeListener("events:card-created", wrapped);
    };
  },
  onClipboardOffer: (listener: ClipboardOfferListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, offer: ClipboardOffer) => {
      listener(offer);
    };

    ipcRenderer.on("events:clipboard-offer", wrapped);

    return () => {
      ipcRenderer.removeListener("events:clipboard-offer", wrapped);
    };
  },
  onPetActiveChanged: (listener: PetActiveChangedListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, assets: { slug: string; spritesheetPath: string }) => {
      listener(assets);
    };

    ipcRenderer.on("pet:active-changed", wrapped);

    return () => {
      ipcRenderer.removeListener("pet:active-changed", wrapped);
    };
  },
  onPetdexRuntimeState: (listener: PetdexRuntimeStateListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: PetdexRuntimeState) => {
      listener(state);
    };

    ipcRenderer.on("petdex:runtime-state", wrapped);

    return () => {
      ipcRenderer.removeListener("petdex:runtime-state", wrapped);
    };
  },
  onPetdexBubble: (listener: PetdexRuntimeBubbleListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, bubble: PetdexRuntimeBubble) => {
      listener(bubble);
    };

    ipcRenderer.on("petdex:bubble", wrapped);

    return () => {
      ipcRenderer.removeListener("petdex:bubble", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("driftpet", api);
