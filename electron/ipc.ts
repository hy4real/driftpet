import { ipcMain } from "electron";
import { getRecentCards } from "../src/main/db/cards";
import { ingestChaosReset, ingestManualText } from "../src/main/ingest/ingest";
import type { CardRecord } from "../src/main/types/card";
import type { AppStatus } from "../src/main/types/status";
import { getAppStatus } from "../src/main/status/app-status";

export const registerIpcHandlers = (
  emitCardCreated: (card: CardRecord) => void
): void => {
  ipcMain.handle("pet:show-demo", async (): Promise<CardRecord> => {
    const card = await ingestManualText(
      "You drifted into inputs again. Close two tabs, keep one thread, and turn this note into the next concrete action.",
      "synthetic"
    );
    emitCardCreated(card);
    return card;
  });

  ipcMain.handle("cards:list-recent", async (): Promise<CardRecord[]> => {
    return getRecentCards();
  });

  ipcMain.handle("app:get-status", async (): Promise<AppStatus> => {
    return getAppStatus();
  });

  ipcMain.handle("ingest:manual-text", async (_event, rawText: string): Promise<CardRecord> => {
    const card = await ingestManualText(rawText);
    emitCardCreated(card);
    return card;
  });

  ipcMain.handle("ingest:chaos-reset", async (_event, rawText: string): Promise<CardRecord> => {
    const card = await ingestChaosReset(rawText);
    emitCardCreated(card);
    return card;
  });
};
