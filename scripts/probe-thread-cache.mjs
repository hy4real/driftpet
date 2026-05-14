#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-thread-cache-probe-"));
const dataDir = path.join(tmpRoot, "data");

const inputs = [
  {
    label: "zh_manual_with_judgment",
    source: "manual_chaos",
    rawText: "主线是验证 Thread Cache v1 是否真的守住工作记忆。我怀疑问题不是 URL extraction，而是 nextMove 太像摘要。别再扩展到桌面 app 识别，先跑三条真实样本，标出哪一格丢了。"
  },
  {
    label: "zh_telegram_followup",
    source: "tg_text",
    rawText: "别再改 recall 阈值了。先把刚才那张高信号文本卡调准，下一步是只看 threadCache.nextMove 是否能马上执行。"
  },
  {
    label: "en_manual_with_side_thread",
    source: "manual_chaos",
    rawText: "I suspect the weak part is not task capture but preserving the discarded hypothesis. Do not add calendar or app indexing yet. Next step: run the thread-cache review probe and fix the first missing field."
  }
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
const { ingestInputDetailed } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/ingest/ingest.js"));
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));

const parseThreadCache = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

(async () => {
  runMigrations();
  const cards = [];

  for (const input of ${JSON.stringify(inputs)}) {
    const result = await ingestInputDetailed({
      source: input.source,
      origin: "synthetic",
      rawText: input.rawText
    });
    cards.push({
      label: input.label,
      created: result.created,
      title: result.card.title,
      useFor: result.card.useFor,
      knowledgeTag: result.card.knowledgeTag,
      threadCache: result.card.threadCache,
      related: result.card.related
    });
  }

  const db = getDatabase();
  const stored = db.prepare(\`
    SELECT
      items.source,
      items.raw_text AS rawText,
      cards.title,
      cards.use_for AS useFor,
      cards.thread_cache_json AS threadCacheJson
    FROM cards
    INNER JOIN items ON items.id = cards.item_id
    ORDER BY cards.id ASC
  \`).all().map((row) => ({
    ...row,
    threadCache: parseThreadCache(row.threadCacheJson)
  }));

  const failures = [];
  for (const card of cards) {
    const cache = card.threadCache;
    if (cache === null) {
      failures.push(\`\${card.label}: missing threadCache\`);
      continue;
    }
    if (typeof cache.chasing !== "string" || cache.chasing.trim().length === 0) {
      failures.push(\`\${card.label}: missing chasing\`);
    }
    if (typeof cache.nextMove !== "string" || cache.nextMove.trim().length === 0) {
      failures.push(\`\${card.label}: missing nextMove\`);
    }
    if (/with_judgment|with_side_thread/.test(card.label) && cache.workingJudgment === null) {
      failures.push(\`\${card.label}: missing workingJudgment\`);
    }
    if (/with_judgment|followup|with_side_thread/.test(card.label) && cache.ruledOut === null) {
      failures.push(\`\${card.label}: missing ruledOut\`);
    }
  }

  for (const row of stored) {
    if (row.threadCache === null) {
      failures.push(\`stored row "\${row.title}": missing stored thread cache\`);
      continue;
    }
    if (row.threadCache.chasing === undefined || row.threadCache.nextMove === undefined) {
      failures.push(\`stored row "\${row.title}": invalid stored thread cache\`);
    }
  }

  const payload = { ok: failures.length === 0, failures, cards, stored };
  console.log(JSON.stringify(payload, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
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
