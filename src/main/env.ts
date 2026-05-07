import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

let envLoaded = false;

const resolveEnvPath = (): string => {
  const explicit = process.env.DRIFTPET_ENV_PATH;
  if (explicit !== undefined && explicit.length > 0) {
    return explicit;
  }

  const cwdPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  return path.resolve(__dirname, "../../..", ".env");
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
