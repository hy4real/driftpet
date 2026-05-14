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
const { ingestChaosReset } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/ingest/ingest.js"));
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));

(async () => {
  runMigrations();
  const text = "Paste-spam: same chaos reset fired three times in seconds.";

  const first = await ingestChaosReset(text, "synthetic");
  const second = await ingestChaosReset(text, "synthetic");

  // Backdate the first item past the 90s window so the next call counts as a fresh moment.
  const db = getDatabase();
  db.prepare("UPDATE items SET received_at = ? WHERE id = ?").run(Date.now() - 120_000, first.itemId);

  const third = await ingestChaosReset(text, "synthetic");

  const cardCount = db.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
  const itemCount = db.prepare("SELECT COUNT(*) AS n FROM items WHERE source = 'manual_chaos'").get().n;
  const storedThreadCacheJson = db.prepare("SELECT thread_cache_json FROM cards WHERE id = ?").get(third.id).thread_cache_json;
  const storedThreadCache = JSON.parse(storedThreadCacheJson);

  console.log(JSON.stringify({
    firstCardId: first.id,
    secondCardId: second.id,
    thirdCardId: third.id,
    firstItemId: first.itemId,
    secondItemId: second.itemId,
    thirdItemId: third.itemId,
    cardCount,
    itemCount,
    thirdThreadCache: third.threadCache,
    storedThreadCache
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
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
  });
});

test("manual_chaos paste-spam collapses inside the 90s window and reopens after it", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-chaos-dedup-"));
  const dataDir = path.join(tmpRoot, "data");
  try {
    const { stdout } = await runProbe(buildElectronScript(dataDir));
    const lastLine = stdout.trim().split("\n").at(-1);
    const result = JSON.parse(lastLine);

    assert.equal(result.secondCardId, result.firstCardId, "second identical paste within window should reuse the first card");
    assert.equal(result.secondItemId, result.firstItemId, "second paste should reuse the same item row, not a new one");
    assert.notEqual(result.thirdCardId, result.firstCardId, "after the window expires, an identical paste should mint a new card");
    assert.notEqual(result.thirdItemId, result.firstItemId, "after the window expires, a new item row should be created");
    assert.equal(result.cardCount, 2, "expected exactly two cards: one collapsed pair plus the post-window fresh moment");
    assert.equal(result.itemCount, 2, "expected exactly two manual_chaos items for the same reason");
    assert.equal(result.thirdThreadCache.chasing, result.storedThreadCache.chasing, "thread cache should round-trip through SQLite");
    assert.match(result.thirdThreadCache.nextMove, /driftpet guard|守住/, "thread cache should preserve a concrete resume move");
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
});
