import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../paths";

let database: Database.Database | null = null;

const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;
let lastCheckpointAt = 0;

export const getDatabase = (): Database.Database => {
  if (database !== null) {
    return database;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  database = new Database(path.join(dataDir, "app.db"));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  lastCheckpointAt = Date.now();

  return database;
};

export const checkpointDatabase = (): void => {
  if (database === null) {
    return;
  }

  const now = Date.now();
  if (now - lastCheckpointAt < WAL_CHECKPOINT_INTERVAL_MS) {
    return;
  }

  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
    lastCheckpointAt = now;
  } catch {
    // Ignore checkpoint failures in normal operation.
  }
};

export const closeDatabase = (): void => {
  if (database === null) {
    return;
  }

  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.close();
  } catch {
    // Best-effort close.
  }

  database = null;
};
