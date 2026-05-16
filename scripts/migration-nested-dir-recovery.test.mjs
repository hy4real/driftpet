import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const runNestedMigrationScenario = async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-migration-nested-"));
  const appRoot = path.join(tmpRoot, "fake-app.asar");
  const dataDir = path.join(tmpRoot, "data");
  const nestedDir = path.join(appRoot, "dist-electron/migrations/migrations");

  await fs.mkdir(nestedDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const sourceMigrationsDir = path.join(repoRoot, "src/main/db/migrations");
  const migrationFiles = await fs.readdir(sourceMigrationsDir);
  for (const fileName of migrationFiles) {
    if (!fileName.endsWith(".sql")) {
      continue;
    }
    await fs.copyFile(
      path.join(sourceMigrationsDir, fileName),
      path.join(nestedDir, fileName)
    );
  }

  const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(appRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
const { getDatabase, closeDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
runMigrations();
const db = getDatabase();
const migration = db.prepare("SELECT name FROM schema_migrations WHERE name = '010_thread_cache_json.sql'").get();
const columns = db.prepare("PRAGMA table_info(cards)").all();
console.log(JSON.stringify({
  migrationApplied: Boolean(migration),
  hasThreadCacheColumn: columns.some((column) => column.name === "thread_cache_json")
}));
closeDatabase();
`;

  const output = await new Promise((resolve, reject) => {
    const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `nested migration scenario failed with code ${code}`));
    });
  });

  try {
    return JSON.parse(output.stdout.trim().split("\n").at(-1));
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
};

test("runMigrations recovers when packaged migrations were copied into a nested directory", async () => {
  const result = await runNestedMigrationScenario();
  assert.equal(result.migrationApplied, true);
  assert.equal(result.hasThreadCacheColumn, true);
});
