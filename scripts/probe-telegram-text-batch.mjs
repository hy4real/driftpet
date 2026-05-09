#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-telegram-text-probe-"));
const dataDir = path.join(tmpRoot, "data");

const updates = [
  {
    label: "zh_ping",
    update_id: 1101,
    message: {
      message_id: 601,
      chat: { id: 525252 },
      text: "哈喽"
    }
  },
  {
    label: "en_ping",
    update_id: 1102,
    message: {
      message_id: 602,
      chat: { id: 525252 },
      text: "hello"
    }
  },
  {
    label: "zh_high_signal",
    update_id: 1103,
    message: {
      message_id: 603,
      chat: { id: 525252 },
      text: "主线不是再看工作流，而是把 driftpet 的高信号文本卡片调得更具体。先找出 title 和 useFor 里最空的一句，改掉它。"
    }
  },
  {
    label: "zh_follow_up",
    update_id: 1104,
    message: {
      message_id: 604,
      chat: { id: 525252 },
      text: "别再扩展到 URL 和 recall 了。先把刚才那张高信号文本卡片改准，至少让 useFor 只指向一个立刻能做的动作。"
    }
  },
  {
    label: "en_high_signal",
    update_id: 1105,
    message: {
      message_id: 605,
      chat: { id: 525252 },
      text: "Do not redesign the whole app tonight. Tighten one driftpet text-card behavior from actual usage and write down the first concrete fix."
    }
  }
];

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
const { runMigrations } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/migrate.js"));
const { processTelegramUpdates } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/telegram/poller.js"));
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const { getAppStatus } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/status/app-status.js"));

(async () => {
  runMigrations();
  const createdCards = [];
  await processTelegramUpdates("", ${JSON.stringify(updates)}, (card) => {
    createdCards.push({
      id: card.id,
      title: card.title,
      useFor: card.useFor,
      knowledgeTag: card.knowledgeTag,
      petRemark: card.petRemark,
      related: card.related
    });
  });

  const db = getDatabase();
  const rows = db.prepare(\`
    SELECT
      items.id,
      items.source,
      items.raw_text AS rawText,
      items.extraction_stage AS extractionStage,
      cards.title AS cardTitle,
      cards.use_for AS useFor,
      cards.knowledge_tag AS knowledgeTag,
      cards.related_card_ids AS related
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    ORDER BY items.id ASC
  \`).all();

  const status = await getAppStatus();
  console.log(JSON.stringify({
    createdCards,
    rows,
    latest: status.storage.latestItem
  }, null, 2));
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
