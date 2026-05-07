import fs from "node:fs";
import path from "node:path";
import { getDatabase } from "./client";
import { getMigrationsDir } from "../paths";

type MigrationNameRow = {
  name: string;
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

  const migrationsDir = getMigrationsDir();
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const fileName of migrationFiles) {
    if (appliedNames.has(fileName)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), "utf8");
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
