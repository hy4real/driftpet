#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-chaos-probe-"));
const dataDir = path.join(tmpRoot, "data");

const samples = [
  "我刚把 workflow bridge 和 hooks 都补好了，但现在不能再继续打磨流程了，要回到 driftpet 产品本身，先把 manual chaos recall 收紧并验证。",
  "别再修工作流细节了。回到 driftpet 产品，优先把 manual chaos 的 related recall 变得更克制，不要硬拉旧卡。",
  "workflow 已经够了，现在主线是 driftpet 产品本身：把 chaos reset 的 related recall 收紧，宁可为空也不要硬凑。",
];

const electronScript = `
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
  const results = [];
  for (const rawText of ${JSON.stringify(samples)}) {
    const card = await ingestChaosReset(rawText, "synthetic");
    results.push({
      id: card.id,
      title: card.title,
      related: card.related,
    });
  }

  const db = getDatabase();
  const stored = db.prepare("SELECT items.source, items.origin, cards.id, cards.title, cards.related_card_ids FROM cards JOIN items ON items.id = cards.item_id ORDER BY cards.id ASC").all();
  console.log(JSON.stringify({ results, stored }, null, 2));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

function runElectronProbe() {
  return new Promise((resolve, reject) => {
    const child = spawn("./node_modules/.bin/electron", ["-e", electronScript], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
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
      } else {
        reject(new Error(stderr || stdout || `electron probe failed with code ${code}`));
      }
    });
  });
}

try {
  const result = await runElectronProbe();
  process.stdout.write(result.stdout);
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }
} finally {
  await fs.rm(tmpRoot, { recursive: true, force: true });
}
