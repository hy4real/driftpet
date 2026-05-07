import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "../paths";

let database: Database.Database | null = null;

export const getDatabase = (): Database.Database => {
  if (database !== null) {
    return database;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  database = new Database(path.join(dataDir, "app.db"));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return database;
};
