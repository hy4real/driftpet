import { contextBridge, ipcRenderer } from "electron";
import type { CardRecord } from "../src/main/types/card";
import type { AppStatus } from "../src/main/types/status";

type CardCreatedListener = (card: CardRecord) => void;

const api = {
  showDemo: (): Promise<CardRecord> => ipcRenderer.invoke("pet:show-demo"),
  listRecentCards: (): Promise<CardRecord[]> => ipcRenderer.invoke("cards:list-recent"),
  getStatus: (): Promise<AppStatus> => ipcRenderer.invoke("app:get-status"),
  ingestManualText: (rawText: string): Promise<CardRecord> => ipcRenderer.invoke("ingest:manual-text", rawText),
  ingestChaosReset: (rawText: string): Promise<CardRecord> => ipcRenderer.invoke("ingest:chaos-reset", rawText),
  onCardCreated: (listener: CardCreatedListener): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, card: CardRecord) => {
      listener(card);
    };

    ipcRenderer.on("events:card-created", wrapped);

    return () => {
      ipcRenderer.removeListener("events:card-created", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("driftpet", api);
