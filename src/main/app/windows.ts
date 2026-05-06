import { BrowserWindow, screen } from "electron";
import path from "node:path";

const WINDOW_WIDTH = 460;
const WINDOW_HEIGHT = 360;
const EDGE_GAP = 24;

const getRendererEntry = (): string => {
  return path.join(process.cwd(), "dist/renderer/index.html");
};

export const createMainWindow = (): BrowserWindow => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  const x = Math.round(workArea.x + workArea.width - WINDOW_WIDTH - EDGE_GAP);
  const y = Math.round(workArea.y + workArea.height - WINDOW_HEIGHT - EDGE_GAP);

  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(process.cwd(), "dist-electron/electron/preload.js")
    }
  });

  if (process.env.NODE_ENV === "development" || !appIsPackaged()) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(getRendererEntry());
  }

  return window;
};

const appIsPackaged = (): boolean => {
  return process.defaultApp !== true && !process.execPath.includes("Electron");
};
