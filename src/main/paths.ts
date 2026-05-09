import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const resolvePackagedAppRoot = (): string | null => {
  const resourcesPath = process.resourcesPath;
  if (typeof resourcesPath !== "string" || resourcesPath.length === 0) {
    return null;
  }

  const asarPath = path.join(resourcesPath, "app.asar");
  return fs.existsSync(asarPath) ? asarPath : null;
};

const resolveRepoRoot = (): string => {
  const explicit = process.env.DRIFTPET_APP_ROOT;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const packagedAppRoot = resolvePackagedAppRoot();
  if (packagedAppRoot !== null) {
    return packagedAppRoot;
  }

  const cwdPrompts = path.join(process.cwd(), "prompts");
  const cwdMigrations = path.join(process.cwd(), "src/main/db/migrations");
  if (fs.existsSync(cwdPrompts) && fs.existsSync(cwdMigrations)) {
    return process.cwd();
  }

  return path.resolve(__dirname, "../../..");
};

export const getAppRoot = (): string => {
  return resolveRepoRoot();
};

const isPackagedAppRoot = (root: string): boolean => {
  return path.basename(root) === "app.asar";
};

const resolveElectronUserDataDir = (): string | null => {
  if (process.versions.electron === undefined) {
    return null;
  }

  try {
    const electronModule = require("electron") as {
      app?: {
        getPath: (name: string) => string;
      };
    };

    if (electronModule.app !== undefined) {
      return electronModule.app.getPath("userData");
    }
  } catch {
    // Fall through to a filesystem-safe fallback.
  }

  return null;
};

export const getDataDir = (): string => {
  const explicit = process.env.DRIFTPET_DATA_DIR;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const appRoot = getAppRoot();
  if (isPackagedAppRoot(appRoot)) {
    return resolveElectronUserDataDir() ?? path.join(os.homedir(), ".driftpet");
  }

  return path.join(appRoot, "data");
};

export const getPromptsDir = (): string => {
  return path.join(getAppRoot(), "prompts");
};

export const getMigrationsDir = (): string => {
  return path.join(getAppRoot(), "src/main/db/migrations");
};

export const getRendererEntryPath = (): string => {
  return path.join(getAppRoot(), "dist/renderer/index.html");
};

export const getPreloadEntryPath = (): string => {
  return path.join(getAppRoot(), "dist-electron/electron/preload.js");
};

export const getAssetsDir = (): string => {
  const appRoot = getAppRoot();
  if (isPackagedAppRoot(appRoot)) {
    return path.join(path.dirname(appRoot), "assets");
  }

  return path.join(appRoot, "assets");
};
