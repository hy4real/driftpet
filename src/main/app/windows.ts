import { BrowserWindow, screen, app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getPreloadEntryPath, getRendererEntryPath } from "../paths";
import {
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  calculateMovedBounds,
  calculateResizedBounds,
  clampBoundsToDisplay,
  getDefaultWindowStateForWorkArea,
  type WindowState,
} from "./window-state";
const WINDOW_STATE_PATH = path.join(app.getPath("userData"), "window-state.json");
const WINDOW_STATE_WRITE_DEBOUNCE_MS = 180;
const pendingWindowStateWrites = new WeakMap<BrowserWindow, ReturnType<typeof setTimeout>>();
const transientSizedWindows = new WeakSet<BrowserWindow>();
const suppressedResizeWrites = new WeakSet<BrowserWindow>();

const readWindowState = (): WindowState => {
  try {
    const raw = fs.readFileSync(WINDOW_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return getDefaultWindowState();
    }

    const nearestDisplay = screen.getDisplayNearestPoint({ x: parsed.x, y: parsed.y });
    return clampBoundsToDisplay(
      {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
      },
      nearestDisplay.workArea
    );
  } catch {
    return getDefaultWindowState();
  }
};

const getDefaultWindowState = (): WindowState => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return getDefaultWindowStateForWorkArea(primaryDisplay.workArea);
};

const getRendererEntry = (): string => {
  return getRendererEntryPath();
};

const getRendererDevUrl = (): string | null => {
  const explicit = process.env.DRIFTPET_RENDERER_URL?.trim() ?? "";
  if (explicit.length > 0) {
    return explicit;
  }

  const viteUrl = process.env.VITE_DEV_SERVER_URL?.trim() ?? "";
  if (viteUrl.length > 0) {
    return viteUrl;
  }

  return null;
};

const writeWindowState = (window: BrowserWindow): void => {
  if (window.isDestroyed()) {
    return;
  }

  const pendingWrite = pendingWindowStateWrites.get(window);
  if (pendingWrite !== undefined) {
    clearTimeout(pendingWrite);
    pendingWindowStateWrites.delete(window);
  }

  const bounds = window.getBounds();
  try {
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(bounds), "utf8");
  } catch {
    // Ignore persistence failures and keep the current session usable.
  }
};

const scheduleWindowStateWrite = (window: BrowserWindow): void => {
  if (window.isDestroyed()) {
    return;
  }

  const pendingWrite = pendingWindowStateWrites.get(window);
  if (pendingWrite !== undefined) {
    clearTimeout(pendingWrite);
  }

  pendingWindowStateWrites.set(
    window,
    setTimeout(() => {
      pendingWindowStateWrites.delete(window);
      writeWindowState(window);
    }, WINDOW_STATE_WRITE_DEBOUNCE_MS)
  );
};

export const createMainWindow = (): BrowserWindow => {
  const windowState = readWindowState();

  const window = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    x: windowState.x,
    y: windowState.y,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: getPreloadEntryPath()
    }
  });

  window.on("move", () => {
    scheduleWindowStateWrite(window);
  });

  window.on("resize", () => {
    if (suppressedResizeWrites.has(window)) {
      suppressedResizeWrites.delete(window);
      return;
    }
    writeWindowState(window);
  });

  const rendererDevUrl = getRendererDevUrl();
  if (rendererDevUrl !== null) {
    void window.loadURL(rendererDevUrl);
  } else {
    void window.loadFile(getRendererEntry());
  }

  return window;
};

export const resizeMainWindow = (
  window: BrowserWindow,
  width: number,
  height: number,
  windowKey?: "mini" | "compact" | "expanded",
  persist = true
): void => {
  const currentBounds = window.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const nextBounds = calculateResizedBounds(currentBounds, { width, height }, display.workArea);

  if (windowKey !== undefined) {
    window.setHasShadow(windowKey !== "mini");
  }
  if (persist) {
    transientSizedWindows.delete(window);
    suppressedResizeWrites.delete(window);
  } else {
    transientSizedWindows.add(window);
    suppressedResizeWrites.add(window);
  }
  window.setBounds(nextBounds, false);
  if (persist) {
    writeWindowState(window);
  }
};

export const moveMainWindowBy = (
  window: BrowserWindow,
  deltaX: number,
  deltaY: number
): void => {
  if (deltaX === 0 && deltaY === 0) {
    return;
  }

  const currentBounds = window.getBounds();
  const targetCenter = {
    x: Math.round(currentBounds.x + currentBounds.width / 2 + deltaX),
    y: Math.round(currentBounds.y + currentBounds.height / 2 + deltaY),
  };
  const display = screen.getDisplayNearestPoint(targetCenter);
  const nextBounds = calculateMovedBounds(
    currentBounds,
    {
      x: deltaX,
      y: deltaY,
    },
    display.workArea
  );

  window.setBounds(nextBounds, false);
  if (!transientSizedWindows.has(window)) {
    scheduleWindowStateWrite(window);
  }
};
