import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "./client";
import { getMigrationsDir } from "../paths";

type MigrationNameRow = {
  name: string;
};

const listMigrationFiles = (rootDir: string): Array<{ name: string; fullPath: string }> => {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const byName = new Map<string, { name: string; fullPath: string }>();

  const remember = (name: string, fullPath: string): void => {
    if (!byName.has(name)) {
      byName.set(name, { name, fullPath });
    }
  };

  entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .forEach((entry) => {
      remember(entry.name, path.join(rootDir, entry.name));
    });

  const nestedDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));

  for (const directory of nestedDirs.sort((a, b) => a.localeCompare(b))) {
    fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .forEach((entry) => {
        remember(entry.name, path.join(directory, entry.name));
      });
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const resolveMigrationFiles = (): Array<{ name: string; fullPath: string }> => {
  const preferredDir = getMigrationsDir();
  const fallbackDir = path.join(process.cwd(), "src/main/db/migrations");
  const candidateDirs = [preferredDir, fallbackDir];

  for (const directory of candidateDirs) {
    try {
      const migrationFiles = listMigrationFiles(directory);
      if (migrationFiles.length > 0) {
        return migrationFiles;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(`No migration files found. Tried: ${candidateDirs.join(", ")}`);
};

export const runMigrations = (): void => {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedNames = new Set(
    (db.prepare("SELECT name FROM schema_migrations ORDER BY name ASC").all() as MigrationNameRow[])
      .map((row) => row.name)
  );

  const migrationFiles = resolveMigrationFiles();

  for (const migration of migrationFiles) {
    const fileName = migration.name;
    if (appliedNames.has(fileName)) {
      continue;
    }

    const sql = fs.readFileSync(migration.fullPath, "utf8");
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare(`
        INSERT INTO schema_migrations (name, applied_at)
        VALUES (?, ?)
      `).run(fileName, Date.now());
    });

    applyMigration();
  }
};
