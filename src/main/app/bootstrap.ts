import type { App } from "electron";
import { app } from "electron";
import { registerIpcHandlers } from "../../../electron/ipc";
import { runMigrations } from "../db/migrate";
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

  registerIpcHandlers(emitCardCreated);
  const stopTelegramPoller = startTelegramPoller({ onCardCreated: emitCardCreated });

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
