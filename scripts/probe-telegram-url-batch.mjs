#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-telegram-url-probe-"));
const dataDir = path.join(tmpRoot, "data");

const updates = [
  {
    label: "plain_url_text",
    update_id: 1001,
    message: {
      message_id: 501,
      chat: { id: 424242 },
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
    label: "text_link_entity",
    update_id: 1002,
    message: {
      message_id: 502,
      chat: { id: 424242 },
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
    label: "caption_url",
    update_id: 1003,
    message: {
      message_id: 503,
      chat: { id: 424242 },
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
    label: "no_content_url",
    update_id: 1004,
    message: {
      message_id: 504,
      chat: { id: 424242 },
      text: "https://httpbin.org/status/204",
      entities: [
        {
          type: "url",
          offset: 0,
          length: "https://httpbin.org/status/204".length
        }
      ]
    }
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
      related: card.related
    });
  });

  const db = getDatabase();
  const rows = db.prepare(\`
    SELECT
      items.id,
      items.tg_message_id AS tgMessageId,
      items.raw_url AS rawUrl,
      items.raw_text AS rawText,
      items.extracted_title AS extractedTitle,
      items.extracted_text AS extractedText,
      items.extraction_stage AS extractionStage,
      items.extraction_error AS extractionError,
      items.last_error AS lastError,
      cards.title AS cardTitle,
      cards.use_for AS useFor,
      cards.knowledge_tag AS knowledgeTag,
      cards.related_card_ids AS related
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    ORDER BY items.id ASC
  \`).all().map((row) => ({
    ...row,
    extractedTextPreview: row.extractedText ? row.extractedText.slice(0, 140) : null
  }));

  const status = await getAppStatus();
  console.log(JSON.stringify({ createdCards, rows, latest: status.storage.latestItem }, null, 2));
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
