import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const getElectronResourcesPath = (): string | undefined => {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
};

const resolvePackagedAppRoot = (): string | null => {
  const resourcesPath = getElectronResourcesPath();
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

  // Packaged app detection must come before CWD heuristic — when a user
  // launches the .app from Finder while their terminal CWD is the repo,
  // the CWD check would incorrectly win and point at the source tree.
  const resourcesPath = getElectronResourcesPath();
  if (
    typeof resourcesPath === "string" &&
    resourcesPath.length > 0 &&
    fs.existsSync(path.join(resourcesPath, "app.asar"))
  ) {
    return path.join(resourcesPath, "app.asar");
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

export const getCodexHomeDir = (): string => {
  const explicit = process.env.CODEX_HOME;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  return path.join(os.homedir(), ".codex");
};

export const getCodexPetsDir = (): string => {
  return path.join(getCodexHomeDir(), "pets");
};

export const getPetdexHomeDir = (): string => {
  const explicit = process.env.PETDEX_HOME;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  return path.join(os.homedir(), ".petdex");
};

export const getPetdexPetsDir = (): string => {
  return path.join(getPetdexHomeDir(), "pets");
};

export const getPetdexRuntimeDir = (): string => {
  return path.join(getPetdexHomeDir(), "runtime");
};

export const getPromptsDir = (): string => {
  return path.join(getAppRoot(), "prompts");
};

export const getMigrationsDir = (): string => {
  const appRoot = getAppRoot();
  if (isPackagedAppRoot(appRoot)) {
    const packagedSourceDir = path.join(appRoot, "src/main/db/migrations");
    if (fs.existsSync(packagedSourceDir)) {
      return packagedSourceDir;
    }

    return path.join(appRoot, "dist-electron/migrations");
  }
  return path.join(appRoot, "src/main/db/migrations");
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
