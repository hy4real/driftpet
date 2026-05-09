#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-url-llm-batch-"));
const dataDir = path.join(tmpRoot, "data");

const updates = [
  {
    label: "mdn_plain_url",
    update_id: 2001,
    message: {
      message_id: 601,
      chat: { id: 515151 },
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
    label: "mdn_text_link",
    update_id: 2002,
    message: {
      message_id: 602,
      chat: { id: 515151 },
      text: "MDN Fetch API reference",
      entities: [
        {
          type: "text_link",
          offset: 0,
          length: "MDN Fetch API reference".length,
          url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API"
        }
      ]
    }
  },
  {
    label: "example_caption_url",
    update_id: 2003,
    message: {
      message_id: 603,
      chat: { id: 515151 },
      caption: "https://example.com",
      caption_entities: [
        {
          type: "url",
          offset: 0,
          length: "https://example.com".length
        }
      ]
    }
  },
  {
    label: "zh_mdn_text_link",
    update_id: 2004,
    message: {
      message_id: 604,
      chat: { id: 515151 },
      text: "看一下 MDN fetch 这页，确认 headers 到了是不是就 resolve",
      entities: [
        {
          type: "text_link",
          offset: 4,
          length: "MDN fetch".length,
          url: "https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API"
        }
      ]
    }
  },
  {
    label: "zh_mdn_plain_url",
    update_id: 2005,
    message: {
      message_id: 605,
      chat: { id: 515151 },
      text: "https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API",
      entities: [
        {
          type: "url",
          offset: 0,
          length: "https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API".length
        }
      ]
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
      items.tg_message_id AS tgMessageId,
      items.raw_url AS rawUrl,
      items.extraction_stage AS extractionStage,
      items.extraction_error AS extractionError,
      items.last_error AS lastError,
      cards.title AS cardTitle,
      cards.use_for AS useFor,
      cards.knowledge_tag AS knowledgeTag,
      cards.pet_remark AS petRemark
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    ORDER BY items.id ASC
  \`).all();

  console.log(JSON.stringify({ createdCards, rows }, null, 2));
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
