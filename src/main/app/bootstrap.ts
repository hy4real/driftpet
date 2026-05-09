import type { App } from "electron";
import { app, BrowserWindow, clipboard, globalShortcut, net, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";
import { registerIpcHandlers } from "../../../electron/ipc";
import { startClipboardWatcher, type ClipboardOffer } from "../clipboard/watcher";
import { closeDatabase, checkpointDatabase } from "../db/client";
import { runMigrations } from "../db/migrate";
import { decideAutoSurface, recordAutoCardShown, recordAutoCardSuppressed } from "../pet/runtime";
import { startTelegramPoller } from "../telegram/poller";
import { createMainWindow } from "./windows";
import { createTray } from "./tray";
import type { CardRecord } from "../types/card";
import { getActivePetAssets } from "../pet/registry";
import { getDataDir, getAssetsDir } from "../paths";

export const bootstrapApp = async (electronApp: App): Promise<void> => {
  await electronApp.whenReady();

  // Register custom protocol for serving pet spritesheet assets.
  protocol.handle("driftpet-pet", (request) => {
    const url = new URL(request.url);
    // driftpet-pet://<slug>/spritesheet.webp
    const slug = url.hostname;
    const filename = url.pathname.replace(/^\//, "");

    if (slug === "boba") {
      const builtinDir = getAssetsDir();
      const builtinPath = path.join(builtinDir, filename);
      if (fs.existsSync(builtinPath)) {
        return net.fetch(`file://${builtinPath}`);
      }
      // Fallback to renderer assets.
      const rendererAsset = path.resolve(__dirname, "../../src/renderer/assets", filename);
      return net.fetch(`file://${rendererAsset}`);
    }

    const petDir = path.join(getDataDir(), "pets", slug);
    const filePath = path.join(petDir, filename);
    if (fs.existsSync(filePath)) {
      return net.fetch(`file://${filePath}`);
    }

    return new Response("Not Found", { status: 404 });
  });

  if (process.platform === "darwin" && app.dock !== undefined) {
    app.dock.hide();
  }

  runMigrations();

  // Periodic WAL checkpoint every 5 minutes.
  const checkpointInterval = setInterval(checkpointDatabase, 5 * 60 * 1000);

  let isQuitting = false;
  let mainWindow = createMainWindow();
  const bindWindowLifecycle = (window: BrowserWindow): void => {
    window.on("close", (event) => {
      if (isQuitting) {
        return;
      }

      event.preventDefault();
      window.hide();
    });
  };
  bindWindowLifecycle(mainWindow);

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

  const clipboardOfferEnabled = (process.env.DRIFTPET_CLIPBOARD_OFFER ?? "on").toLowerCase() !== "off";
  const clipboardWatcher = clipboardOfferEnabled
    ? startClipboardWatcher({
      reader: clipboard,
      onOffer: (offer: ClipboardOffer) => {
        if (mainWindow.isDestroyed()) {
          return;
        }
        mainWindow.webContents.send("events:clipboard-offer", offer);
      }
    })
    : null;
  // System tray.
  createTray({
    onToggleWindow: () => {
      if (mainWindow.isDestroyed()) {
        mainWindow = createMainWindow();
        bindWindowLifecycle(mainWindow);
        return;
      }
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    },
    onQuit: () => {
      stopTelegramPoller();
      clipboardWatcher?.stop();
      globalShortcut.unregisterAll();
      clearInterval(checkpointInterval);
      closeDatabase();
      electronApp.quit();
    },
  });

  electronApp.on("activate", () => {
    if (mainWindow.isDestroyed()) {
      mainWindow = createMainWindow();
      bindWindowLifecycle(mainWindow);
      return;
    }

    mainWindow.show();
    mainWindow.focus();
  });

  electronApp.on("before-quit", () => {
    isQuitting = true;
    stopTelegramPoller();
    clipboardWatcher?.stop();
    globalShortcut.unregisterAll();
    clearInterval(checkpointInterval);
    closeDatabase();
  });
};
