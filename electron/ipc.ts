import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { deleteCardById, getRecentCards } from "../src/main/db/cards";
import { getPref, setPref } from "../src/main/db/prefs";
import { ingestChaosReset } from "../src/main/ingest/ingest";
import { launchClaudeCodeTask, getClaudeDispatchPrefKey } from "../src/main/claude/dispatch";
import { getClaudeDispatchSettings, setClaudeDispatchSettings } from "../src/main/claude/settings";
import type { CardRecord } from "../src/main/types/card";
import type { ClaudeDispatchMeta } from "../src/main/types/claude";
import { setPetHourlyBudget } from "../src/main/pet/runtime";
import type { AppStatus } from "../src/main/types/status";
import { getAppStatus } from "../src/main/status/app-status";
import { buildThreadBundle } from "../src/shared/thread-bundle";
import { moveMainWindowBy, resizeMainWindow } from "../src/main/app/windows";
import {
  COMPACT_WINDOW_HEIGHT,
  COMPACT_WINDOW_WIDTH,
  EXPANDED_WINDOW_HEIGHT,
  EXPANDED_WINDOW_WIDTH,
  MINI_BUBBLE_WINDOW_WIDTH,
  MINI_WINDOW_HEIGHT,
  MINI_WINDOW_WIDTH,
} from "../src/main/app/window-state";
import { parsePetdexSlug, downloadPet } from "../src/main/pet/petdex-client";
import {
  listInstalledPets,
  getActivePetSlug,
  setActivePetSlug,
  getActivePetAssets,
  type PetInfo
} from "../src/main/pet/registry";

export const registerIpcHandlers = (
  emitCardCreated: (card: CardRecord) => void
): void => {
  const getTargetWindow = (
    event: IpcMainEvent | IpcMainInvokeEvent
  ): BrowserWindow | null => {
    return BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0] ?? null;
  };

  const resizeWindow = (
    event: IpcMainInvokeEvent,
    windowKey: "mini" | "compact" | "expanded"
  ): void => {
    const window = getTargetWindow(event);
    if (window === null || window.isDestroyed()) {
      return;
    }

    let width = MINI_WINDOW_WIDTH;
    let height = MINI_WINDOW_HEIGHT;
    if (windowKey === "mini") {
      width = MINI_WINDOW_WIDTH;
      height = MINI_WINDOW_HEIGHT;
    } else if (windowKey === "compact") {
      width = COMPACT_WINDOW_WIDTH;
      height = COMPACT_WINDOW_HEIGHT;
    } else {
      width = EXPANDED_WINDOW_WIDTH;
      height = EXPANDED_WINDOW_HEIGHT;
    }

    resizeMainWindow(window, width, height, windowKey);
  };

  ipcMain.handle("pet:show-demo", async (): Promise<CardRecord> => {
    const card = await ingestChaosReset(
      "You drifted into inputs again. Close two tabs, keep one thread, and turn this note into the next concrete action.",
      "synthetic"
    );
    emitCardCreated(card);
    return card;
  });

  ipcMain.handle("cards:list-recent", async (): Promise<CardRecord[]> => {
    return getRecentCards();
  });

  ipcMain.handle("cards:delete", async (_event, cardId: number): Promise<boolean> => {
    return deleteCardById(cardId);
  });

  ipcMain.handle("card:dispatch-claude-code", async (_event, cardId: number): Promise<ClaudeDispatchMeta> => {
    const card = getRecentCards().find((entry) => entry.id === cardId);
    if (card === undefined) {
      throw new Error(`card not found: ${cardId}`);
    }

    const status = await getAppStatus();
    const settings = getClaudeDispatchSettings();
    try {
      const result = await launchClaudeCodeTask({
        card,
        rememberedThread: settings.continuityMode === "continuous" ? status.pet.rememberedThread : null,
        recentCards: getRecentCards(),
        mode: "card",
      });

      setPref(getClaudeDispatchPrefKey(cardId), JSON.stringify(result));
      return result;
    } catch (error) {
      const failedResult: ClaudeDispatchMeta = {
        command: "",
        promptPath: "",
        runner: "",
        cwd: settings.workingDirectory,
        createdAt: Date.now(),
        status: "failed",
        mode: "card",
        error: error instanceof Error ? error.message : "Claude Code dispatch failed.",
      };
      setPref(getClaudeDispatchPrefKey(cardId), JSON.stringify(failedResult));
      throw error;
    }
  });

  ipcMain.handle("card:dispatch-claude-thread", async (_event, cardId: number): Promise<ClaudeDispatchMeta> => {
    const recentCards = getRecentCards();
    const card = recentCards.find((entry) => entry.id === cardId);
    if (card === undefined) {
      throw new Error(`card not found: ${cardId}`);
    }

    const status = await getAppStatus();
    const settings = getClaudeDispatchSettings();
    const rememberedThread = settings.continuityMode === "continuous" ? status.pet.rememberedThread : null;
    const anchorCard = rememberedThread === null
      ? card
      : recentCards.find((entry) => entry.id === rememberedThread.cardId) ?? card;

    try {
      const result = await launchClaudeCodeTask({
        card,
        rememberedThread,
        recentCards,
        threadBundle: rememberedThread === null ? null : buildThreadBundle(anchorCard, recentCards),
        mode: "thread",
      });

      setPref(getClaudeDispatchPrefKey(cardId), JSON.stringify(result));
      return result;
    } catch (error) {
      const failedResult: ClaudeDispatchMeta = {
        command: "",
        promptPath: "",
        runner: "",
        cwd: settings.workingDirectory,
        createdAt: Date.now(),
        status: "failed",
        mode: "thread",
        error: error instanceof Error ? error.message : "Claude thread dispatch failed.",
      };
      setPref(getClaudeDispatchPrefKey(cardId), JSON.stringify(failedResult));
      throw error;
    }
  });

  ipcMain.handle("app:get-status", async (): Promise<AppStatus> => {
    return getAppStatus();
  });

  ipcMain.handle("claude:get-dispatch-settings", async (): Promise<{ terminalApp: string; workingDirectory: string; continuityMode: "continuous" | "isolated" }> => {
    return getClaudeDispatchSettings();
  });

  ipcMain.handle(
    "claude:set-dispatch-settings",
    async (
      _event,
      settings: { terminalApp: string; workingDirectory: string; continuityMode: "continuous" | "isolated" }
    ): Promise<{ terminalApp: string; workingDirectory: string; continuityMode: "continuous" | "isolated" }> => {
      return setClaudeDispatchSettings(settings);
    }
  );

  ipcMain.handle("ingest:chaos-reset", async (_event, rawText: string): Promise<CardRecord> => {
    const card = await ingestChaosReset(rawText);
    emitCardCreated(card);
    return card;
  });

  ipcMain.handle("pet:set-hourly-budget", async (_event, value: number): Promise<number> => {
    return setPetHourlyBudget(value);
  });

  ipcMain.handle("pet:set-window-size", async (_event, windowSize: "mini" | "compact" | "expanded"): Promise<void> => {
    resizeWindow(_event, windowSize);
  });

  ipcMain.handle("pet:set-mini-bubble-visible", async (event, visible: boolean): Promise<void> => {
    const window = getTargetWindow(event);
    if (window === null || window.isDestroyed()) {
      return;
    }

    resizeMainWindow(
      window,
      visible ? MINI_BUBBLE_WINDOW_WIDTH : MINI_WINDOW_WIDTH,
      MINI_WINDOW_HEIGHT,
      "mini",
      !visible
    );
  });

  ipcMain.on("pet:move-window-by", (event, deltaX: number, deltaY: number) => {
    const window = getTargetWindow(event);
    if (window === null || window.isDestroyed()) {
      return;
    }

    moveMainWindowBy(window, Number(deltaX) || 0, Number(deltaY) || 0);
  });

  ipcMain.handle("pet:list", async (): Promise<PetInfo[]> => {
    return listInstalledPets();
  });

  ipcMain.handle("pet:active", async (): Promise<{ slug: string; spritesheetPath: string }> => {
    const assets = getActivePetAssets();
    return { slug: assets.slug, spritesheetPath: assets.spritesheetPath };
  });

  ipcMain.handle("pet:set-active", async (event, slug: string): Promise<void> => {
    setActivePetSlug(slug);
    const window = getTargetWindow(event);
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send("pet:active-changed", getActivePetAssets());
    }
  });

  ipcMain.handle("pet:install", async (event, input: string): Promise<{ slug: string; displayName: string }> => {
    const slug = parsePetdexSlug(input);
    if (slug === null) {
      throw new Error(`invalid pet identifier: ${input}`);
    }

    await downloadPet(slug);
    setActivePetSlug(slug);

    const window = getTargetWindow(event);
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send("pet:active-changed", getActivePetAssets());
    }

    const pets = listInstalledPets();
    const pet = pets.find((p) => p.slug === slug);
    return { slug, displayName: pet?.displayName ?? slug };
  });
};
