import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

let envLoaded = false;

const resolveEnvPath = (): string => {
  const explicit = process.env.DRIFTPET_ENV_PATH;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  // 1. Check CWD (works in dev mode).
  const cwdPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // 2. Check relative to source (dev mode fallback).
  const sourceRootPath = path.resolve(__dirname, "../../..", ".env");
  if (fs.existsSync(sourceRootPath)) {
    return sourceRootPath;
  }

  // 3. Check user home config (works for packaged app).
  const homePath = path.join(os.homedir(), ".driftpet", ".env");
  if (fs.existsSync(homePath)) {
    return homePath;
  }

  // 4. Return home config path as default even if it doesn't exist.
  // dotenv will silently skip it with quiet: true.
  return homePath;
};

export const ensureEnvLoaded = (): void => {
  if (envLoaded) {
    return;
  }

  dotenv.config({
    path: resolveEnvPath(),
    quiet: true
  });

  envLoaded = true;
};
