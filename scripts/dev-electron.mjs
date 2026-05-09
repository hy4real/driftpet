import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import waitOn from "wait-on";

const repoRoot = process.cwd();
const rendererUrl = "http://127.0.0.1:5173";
const distElectronDir = path.join(repoRoot, "dist-electron");
const electronEntry = path.join(distElectronDir, "electron", "main.js");
const envPath = path.join(repoRoot, ".env");

const electronBin = process.platform === "win32" ? "electron.cmd" : "electron";

let electronChild = null;
let restartTimer = null;
let restarting = false;
let pendingRestart = false;
let shuttingDown = false;
const watchers = [];

const shouldRestartForPath = (filename) => {
  if (typeof filename !== "string" || filename.length === 0) {
    return false;
  }

  return /\.(?:[cm]?js|json)$/i.test(filename);
};

const log = (message) => {
  console.log(`[dev:electron] ${message}`);
};

const startElectron = () => {
  log("Starting Electron");
  electronChild = spawn(electronBin, ["."], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DRIFTPET_RENDERER_URL: rendererUrl,
    },
    stdio: "inherit",
  });

  electronChild.on("exit", (code, signal) => {
    const wasRestarting = restarting;
    electronChild = null;

    if (shuttingDown) {
      return;
    }

    if (wasRestarting) {
      restarting = false;
      startElectron();
      if (pendingRestart) {
        pendingRestart = false;
        queueRestart("pending rebuild");
      }
      return;
    }

    log(`Electron exited (${signal ?? code ?? "unknown"}). Waiting for the next rebuild.`);
  });
};

const restartElectron = (reason) => {
  if (shuttingDown) {
    return;
  }

  if (electronChild === null) {
    log(`Starting Electron after ${reason}`);
    startElectron();
    return;
  }

  if (restarting) {
    pendingRestart = true;
    return;
  }

  restarting = true;
  pendingRestart = false;
  log(`Restarting Electron (${reason})`);

  const child = electronChild;
  const forceKillTimer = setTimeout(() => {
    if (electronChild === child) {
      child.kill("SIGKILL");
    }
  }, 2000);

  child.once("exit", () => {
    clearTimeout(forceKillTimer);
  });

  child.kill("SIGTERM");
};

const queueRestart = (reason) => {
  if (restartTimer !== null) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartElectron(reason);
  }, 180);
};

const attachWatcher = (targetPath, options, onChange) => {
  const watcher = fs.watch(targetPath, options, onChange);
  watchers.push(watcher);
};

const closeWatchers = () => {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers.length = 0;
};

const shutdown = () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  closeWatchers();

  if (restartTimer !== null) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (electronChild !== null) {
    electronChild.kill("SIGTERM");
  }
};

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

await waitOn({
  resources: [
    `tcp:127.0.0.1:5173`,
    `file:${electronEntry}`,
  ],
});

attachWatcher(distElectronDir, { recursive: true }, (_eventType, filename) => {
  if (shouldRestartForPath(filename)) {
    queueRestart(`main/preload rebuild: ${filename}`);
  }
});

if (fs.existsSync(envPath)) {
  attachWatcher(envPath, {}, () => {
    queueRestart(".env change");
  });
}

log("Watching dist-electron and .env for Electron restarts");
startElectron();
