#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-chaos-recall-batch-"));
const dataDir = path.join(tmpRoot, "data");

const samples = [
  "主线是把 driftpet 的真实使用调优收口，但我现在又开了文档、数据库、终端和别的 AI 页面。先别重构系统，只把这轮验证做完。",
  "现在不要再刷别的 AI 工具了。回到 driftpet，把最近这批真实 URL 和 chaos 样本的行为结论写出来。",
  "看了一圈 URL probe 和 recall probe 之后，我又想去重做工作流。别岔开，先把 driftpet 这一轮真实使用结论收口。",
  "I drifted into comparing tools and reading notes again. The real job tonight is to lock one concrete driftpet behavior change from actual usage.",
  "我又在看 fetch、prompt、workflow 这些细节，但现在真正该做的是给 driftpet 当前这一轮调优写一个明确结论，然后停手。"
];

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_ENV_PATH = ${JSON.stringify(path.join(tmpRoot, ".env.empty"))};
process.env.DRIFTPET_LLM_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "";
process.env.DRIFTPET_LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.DEEPSEEK_API_KEY = "";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";
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
