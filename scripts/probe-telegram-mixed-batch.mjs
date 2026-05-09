#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-telegram-mixed-probe-"));
const dataDir = path.join(tmpRoot, "data");

const updates = [
  {
    label: "zh_high_signal_text",
    update_id: 1201,
    message: {
      message_id: 701,
      chat: { id: 626262 },
      text: "今晚别再重做流程。先把 driftpet 真实使用里最空的一张文本卡修具体，再决定要不要动 recall。"
    }
  },
  {
    label: "mdn_url",
    update_id: 1202,
    message: {
      message_id: 702,
      chat: { id: 626262 },
      text: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
      entities: [
        {
          type: "url",
          offset: 0,
          length: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API".length
        }
      ]
    }
  },
  {
    label: "zh_follow_up_text",
    update_id: 1203,
    message: {
      message_id: 703,
      chat: { id: 626262 },
      text: "URL 先只当参考，不要又把页面读成摘要。先回到刚才那张文本卡，把 useFor 压成一个马上能做的动作。"
    }
  },
  {
    label: "example_url",
    update_id: 1204,
    message: {
      message_id: 704,
      chat: { id: 626262 },
      text: "https://example.com",
      entities: [
        {
          type: "url",
          offset: 0,
          length: "https://example.com".length
        }
      ]
    }
  },
  {
    label: "en_high_signal_text",
    update_id: 1205,
    message: {
      message_id: 705,
      chat: { id: 626262 },
      text: "Use the article only as reference. Tighten the current driftpet text card first, and do not expand into a broader redesign tonight."
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
      items.raw_url AS rawUrl,
      items.raw_text AS rawText,
      items.extracted_title AS extractedTitle,
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
    latest: status.storage.latestItem,
    latestReal: status.storage.latestRealItem
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
