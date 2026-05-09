import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";
import { getAssetsDir } from "../paths";

let tray: Tray | null = null;

type TrayCallbacks = {
  onToggleWindow: () => void;
  onQuit: () => void;
};

const createTrayIcon = (): Electron.NativeImage => {
  // Try to load the app icon first, falling back to a programmatic image.
  const iconPath = path.join(getAssetsDir(), "icon.png");

  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({ width: 22, height: 22 });
    }
  } catch {
    // Fall through to programmatic icon.
  }

  // Fallback: create a simple 22x22 colored icon programmatically.
  const size = 22;
  const buffer = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dist = Math.sqrt((x - size / 2) ** 2 + (y - size / 2) ** 2);
      if (dist <= size / 2 - 1) {
        buffer[idx] = 233;     // R
        buffer[idx + 1] = 69;  // G
        buffer[idx + 2] = 96;  // B
        buffer[idx + 3] = 255; // A
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
};

export const createTray = (callbacks: TrayCallbacks): Tray => {
  if (tray !== null) {
    return tray;
  }

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("driftpet 正在陪着你");

  const buildMenu = () => {
    return Menu.buildFromTemplate([
      {
        label: "叫它出来 / 让它躲起来",
        click: callbacks.onToggleWindow,
      },
      { type: "separator" },
      {
        label: "让 driftpet 回窝",
        click: callbacks.onQuit,
      },
    ]);
  };

  tray.setContextMenu(buildMenu());

  return tray;
};

export const getTray = (): Tray | null => tray;
