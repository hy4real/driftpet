import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const runElectronScenario = async (claudeBin) => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-note-poller-"));
  const dataDir = path.join(tmpRoot, "data");
  const artifactPath = path.join(tmpRoot, "vault", "AI", "Articles", "mock-note.md");
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  const envPath = path.join(tmpRoot, ".env");
  await fs.writeFile(envPath, "", "utf8");

  const updates = [
    {
      update_id: 3001,
      message: {
        message_id: 701,
        chat: { id: 626262 },
        text: "https://example.com/post",
        entities: [
          {
            type: "url",
            offset: 0,
            length: "https://example.com/post".length
          }
        ]
      }
    }
  ];

  const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
process.env.DRIFTPET_DATA_DIR = ${JSON.stringify(dataDir)};
process.env.DRIFTPET_ENV_PATH = ${JSON.stringify(envPath)};
process.env.DRIFTPET_VAULT_DIR = ${JSON.stringify(path.join(tmpRoot, "vault"))};
process.env.DRIFTPET_CLAUDE_BIN = ${JSON.stringify(claudeBin)};
process.env.DRIFTPET_LLM_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = "";
process.env.DRIFTPET_LLM_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.DEEPSEEK_API_KEY = "";
process.env.DRIFTPET_EMBED_PROVIDER = "disabled";
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
      petRemark: card.petRemark
    });
  });

  const db = getDatabase();
  const row = db.prepare(\`
    SELECT
      items.raw_url AS rawUrl,
      items.extraction_stage AS extractionStage,
      items.extracted_text AS extractedText,
      items.extraction_error AS extractionError,
      items.last_error AS lastError,
      cards.title AS cardTitle,
      cards.use_for AS useFor,
      cards.knowledge_tag AS knowledgeTag,
      cards.pet_remark AS petRemark
    FROM items
    LEFT JOIN cards ON cards.item_id = items.id
    ORDER BY items.id DESC
    LIMIT 1
  \`).get();

  console.log(JSON.stringify({ createdCards, row }, null, 2));
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
`;

  const output = await new Promise((resolve, reject) => {
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
        reject(new Error(stderr || stdout || `electron scenario failed with code ${code}`));
      }
    });
  });

  try {
    return {
      artifactPath,
      payload: JSON.parse(output.stdout)
    };
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
};

test("processTelegramUpdates turns tg_url into note-workflow card with artifact path", async () => {
  const mockRoot = await fs.mkdtemp(path.join(os.tmpdir(), "driftpet-claude-mock-"));
  const claudeBin = path.join(mockRoot, "claude");
  const artifactPath = path.join(mockRoot, "mock-note.md");
  await fs.writeFile(artifactPath, "# Mock note\n\nThis came from the mock Claude runner.\n", "utf8");
  await fs.writeFile(
    claudeBin,
    `#!/bin/sh\nprintf 'ARTIFACT: ${artifactPath}\\n'`,
    { mode: 0o755 }
  );

  try {
    const result = await runElectronScenario(claudeBin);
    const created = result.payload.createdCards;
    const row = result.payload.row;

    assert.equal(created.length, 1);
    assert.equal(row.rawUrl, "https://example.com/post");
    assert.equal(row.extractionStage, "note_ingested");
    assert.match(row.extractedText, /ARTIFACT:/);
    assert.match(row.extractedText, new RegExp(artifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(row.extractionError, null);
    assert.equal(row.lastError, null);
    assert.equal(row.cardTitle, path.basename(artifactPath, path.extname(artifactPath)));
    assert.equal(row.knowledgeTag, "article-to-note");
    assert.equal(row.petRemark, "链接我已经替你送进本地仓库了。");
  } finally {
    await fs.rm(mockRoot, { recursive: true, force: true });
  }
});
