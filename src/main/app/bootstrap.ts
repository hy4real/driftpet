import type { App } from "electron";
import { app } from "electron";
import { registerIpcHandlers } from "../../../electron/ipc";
import { runMigrations } from "../db/migrate";
import { decideAutoSurface, recordAutoCardShown, recordAutoCardSuppressed } from "../pet/runtime";
import { startTelegramPoller } from "../telegram/poller";
import { createMainWindow } from "./windows";
import type { CardRecord } from "../types/card";

export const bootstrapApp = async (electronApp: App): Promise<void> => {
  await electronApp.whenReady();

  if (process.platform === "darwin" && app.dock !== undefined) {
    app.dock.hide();
  }

  runMigrations();

  let mainWindow = createMainWindow();
  const emitCardCreated = (card: CardRecord): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("events:card-created", card);
    }
  };

  const emitAutoCardCreated = (card: CardRecord): void => {
    const decision = decideAutoSurface();
    if (!decision.allowed) {
      recordAutoCardSuppressed(card, decision.reason);
      return;
    }

    recordAutoCardShown(card);
    emitCardCreated(card);
  };

  registerIpcHandlers(emitCardCreated);
  const stopTelegramPoller = startTelegramPoller({ onCardCreated: emitAutoCardCreated });

  electronApp.on("activate", () => {
    if (mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
    }
  });

  electronApp.on("before-quit", () => {
    stopTelegramPoller();
  });

  electronApp.on("window-all-closed", () => {
    electronApp.quit();
  });
};
