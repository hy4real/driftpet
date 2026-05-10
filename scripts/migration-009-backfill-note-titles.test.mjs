import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const runMigrationScenario = async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-migration-009-"));
  const dataDir = path.join(tmpRoot, "data");

  const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
const { getDatabase, closeDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));

runMigrations();

const db = getDatabase();
db.prepare("DELETE FROM schema_migrations WHERE name = ?").run("009_backfill_note_handoff_titles.sql");

db.prepare(\`
  INSERT INTO items (
    id, source, raw_url, raw_text, extracted_title, extracted_text, content_hash, tg_message_id,
    received_at, status, last_error, origin, extraction_stage, extraction_error, artifact_path, processor
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
\`).run(
  1,
  "tg_url",
  "https://b23.tv/Cmz4QJI",
  "https://b23.tv/Cmz4QJI",
  null,
  "ARTIFACT: /portable/vault/AI/Bilibili/【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！.md",
  "hash",
  "chat:msg",
  Date.now(),
  "digested",
  null,
  "real",
  "note_ingested",
  null,
  "/portable/vault/AI/Bilibili/【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！.md",
  "video-to-note"
);

db.prepare(\`
  INSERT INTO cards (
    id, item_id, title, use_for, knowledge_tag, summary_for_retrieval, related_card_ids, pet_remark, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
\`).run(
  1,
  1,
  "笔记已接住：【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！.md",
  "use",
  "video-to-note",
  "summary",
  "[]",
  "remark",
  Date.now()
);

runMigrations();

const row = db.prepare("SELECT title FROM cards WHERE id = 1").get();
const migration = db.prepare("SELECT name FROM schema_migrations WHERE name = '009_backfill_note_handoff_titles.sql'").get();
console.log(JSON.stringify({ title: row.title, migrationApplied: Boolean(migration) }));
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

      reject(new Error(stderr || stdout || `migration scenario failed with code ${code}`));
    });
  });

  try {
    return JSON.parse(output.stdout);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
};

test("009 migration backfills wrapped note handoff titles without relying on absolute vault paths", async () => {
  const result = await runMigrationScenario();
  assert.equal(result.migrationApplied, true);
  assert.equal(result.title, "【闪客】大模型已死？上帝视角拆解三年 LLM 架构演进！");
});
