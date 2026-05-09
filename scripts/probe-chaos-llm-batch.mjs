#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-chaos-llm-batch-"));
const dataDir = path.join(tmpRoot, "data");

const samples = [
  "主线是把 driftpet 这轮真实调优收口，但我现在又开了文档、数据库、终端和别的 AI 页面。先别重构系统，只把这轮验证做完。当前 tab: https://example.com/a https://example.com/b",
  "看一下 MDN fetch 这页，确认 headers 到了是不是就 resolve，但主线其实是把 driftpet 的 URL 卡片做得别那么像摘要器。先别再开新标签。",
  "I drifted into reading agent-memory threads again. The real deliverable is to tighten driftpet's real-usage behavior tonight, not compare more tools or rewrite the memory system."
];

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
const { ingestChaosReset } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/ingest/ingest.js"));

(async () => {
  runMigrations();
  const cards = [];
  for (const rawText of ${JSON.stringify(samples)}) {
    const card = await ingestChaosReset(rawText, "real");
    cards.push({
      title: card.title,
      useFor: card.useFor,
      knowledgeTag: card.knowledgeTag,
      petRemark: card.petRemark,
      related: card.related
    });
  }
  console.log(JSON.stringify(cards, null, 2));
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
