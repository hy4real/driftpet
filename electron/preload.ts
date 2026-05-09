import { contextBridge, ipcRenderer } from "electron";
import type { CardRecord } from "../src/main/types/card";
import type { AppStatus } from "../src/main/types/status";

type CardCreatedListener = (card: CardRecord) => void;
type PetActiveChangedListener = (assets: { slug: string; spritesheetPath: string }) => void;

type PetInfo = {
  slug: string;
  displayName: string;
  isBuiltin: boolean;
};

const api = {
  showDemo: (): Promise<CardRecord> => ipcRenderer.invoke("pet:show-demo"),
  listRecentCards: (): Promise<CardRecord[]> => ipcRenderer.invoke("cards:list-recent"),
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke("app:get-status"),
  ingestChaosReset: (rawText: string): Promise<CardRecord> => ipcRenderer.invoke("ingest:chaos-reset", rawText),
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
  onPetActiveChanged: (listener: PetActiveChangedListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, assets: { slug: string; spritesheetPath: string }) => {
      listener(assets);
    };

    ipcRenderer.on("pet:active-changed", wrapped);

    return () => {
      ipcRenderer.removeListener("pet:active-changed", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("driftpet", api);
