import dotenv from "dotenv";
import path from "node:path";

let envLoaded = false;

export const ensureEnvLoaded = (): void => {
  if (envLoaded) {
    return;
  }

  dotenv.config({
    path: path.join(process.cwd(), ".env"),
    quiet: true
  });

  envLoaded = true;
};
