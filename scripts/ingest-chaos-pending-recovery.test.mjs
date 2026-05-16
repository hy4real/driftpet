import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const buildElectronScript = (dataDir) => `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_LLM_PROVIDER = "disabled";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
const { getRecoverableChaosDraft, ingestChaosReset } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/ingest/ingest.js"));
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));

(async () => {
  runMigrations();
  const text = "Recover my stuck guard thread instead of minting duplicates.";
  const failedText = "Recover this failed manual note into the workbench draft.";
  const db = getDatabase();
  const failed = db.prepare(\`
    INSERT INTO items (
      source,
      origin,
      raw_url,
      raw_text,
      content_hash,
      tg_message_id,
      received_at,
      status,
      last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    "manual_chaos",
    "real",
    null,
    failedText,
    null,
    null,
    Date.now() - 5_000,
    "failed",
    "LLM timed out"
  );

  const recoverableBefore = getRecoverableChaosDraft();

  const inserted = db.prepare(\`
    INSERT INTO items (
      source,
      origin,
      raw_url,
      raw_text,
      content_hash,
      tg_message_id,
      received_at,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  \`).run(
    "manual_chaos",
    "real",
    null,
    text,
    null,
    null,
    Date.now() - 10_000,
    "pending"
  );

  const card = await ingestChaosReset(text, "real");
  const itemRows = db.prepare("SELECT id, status FROM items WHERE source = 'manual_chaos' AND raw_text = ? ORDER BY id ASC").all(text);
  const cardRows = db.prepare("SELECT id, item_id FROM cards ORDER BY id ASC").all();

  console.log(JSON.stringify({
    failedItemId: Number(failed.lastInsertRowid),
    recoverableBefore,
    stuckItemId: Number(inserted.lastInsertRowid),
    cardItemId: card.itemId,
    itemRows,
    cardRows
  }));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

const runProbe = (electronScript) => new Promise((resolve, reject) => {
  const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (code === 0) {
      resolve({ stdout, stderr });
      return;
    }
    reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
  });
});

test("manual_chaos retries recover a pending item instead of inserting a duplicate", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-chaos-pending-"));
  const dataDir = path.join(tmpRoot, "data");

  try {
    const { stdout } = await runProbe(buildElectronScript(dataDir));
    const lastLine = stdout.trim().split("\n").at(-1);
    const result = JSON.parse(lastLine);

    assert.equal(result.recoverableBefore.itemId, result.failedItemId, "should recover the newest failed manual note before retrying");
    assert.equal(result.recoverableBefore.rawText, "Recover this failed manual note into the workbench draft.");
    assert.equal(result.recoverableBefore.status, "failed");
    assert.equal(result.recoverableBefore.lastError, "LLM timed out");
    assert.equal(result.itemRows.length, 1, "should keep a single manual_chaos item row");
    assert.equal(result.cardRows.length, 1, "should create one recovered card");
    assert.equal(result.cardItemId, result.stuckItemId, "recovered card should attach to the original pending item");
    assert.equal(result.itemRows[0].status, "digested", "recovered item should be marked digested");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
