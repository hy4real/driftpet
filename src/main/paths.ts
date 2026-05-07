import fs from "node:fs";
import path from "node:path";

const resolveRepoRoot = (): string => {
  const explicit = process.env.DRIFTPET_APP_ROOT;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const cwdPrompts = path.join(process.cwd(), "prompts");
  const cwdMigrations = path.join(process.cwd(), "src/main/db/migrations");
  if (fs.existsSync(cwdPrompts) && fs.existsSync(cwdMigrations)) {
    return process.cwd();
  }

  return path.resolve(__dirname, "../..");
};

export const getAppRoot = (): string => {
  return resolveRepoRoot();
};

export const getDataDir = (): string => {
  const explicit = process.env.DRIFTPET_DATA_DIR;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  return path.join(getAppRoot(), "data");
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
