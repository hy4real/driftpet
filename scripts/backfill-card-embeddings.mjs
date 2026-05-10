#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const force = args.has("--force");

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
const { ensureEnvLoaded } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/env.js"));
ensureEnvLoaded();
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const { upsertCardEmbedding } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/embeddings.js"));
const { canUseEmbeddings, generateEmbedding, getEmbeddingMissingReason } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/llm/embeddings.js"));
const { getEmbeddingRuntimeConfig } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/llm/config.js"));

const APPLY = ${JSON.stringify(apply)};
const FORCE = ${JSON.stringify(force)};

const buildEmbeddingText = (title, knowledgeTag, summary) => {
  const tag = knowledgeTag ?? "";
  return title + " | " + tag + " | " + summary;
};

(async () => {
  const config = getEmbeddingRuntimeConfig();
  const usable = canUseEmbeddings();

  const db = getDatabase();

  if (FORCE) {
    db.prepare(\`DELETE FROM card_embeddings\`).run();
  }

  const rows = db.prepare(\`
    SELECT
      cards.id AS card_id,
      cards.item_id AS item_id,
      cards.title AS title,
      cards.knowledge_tag AS knowledge_tag,
      cards.summary_for_retrieval AS summary,
      cards.created_at AS created_at,
      items.source AS source,
      items.origin AS origin
    FROM cards
    LEFT JOIN card_embeddings ON card_embeddings.card_id = cards.id
    JOIN items ON items.id = cards.item_id
    WHERE card_embeddings.vector_json IS NULL
    ORDER BY cards.created_at ASC
  \`).all();

  const summary = {
    apply: APPLY,
    force: FORCE,
    embeddingProvider: config.provider,
    embeddingModel: config.model,
    embeddingEndpoint: config.endpoint,
    canUseEmbeddings: usable,
    missingReason: usable ? null : getEmbeddingMissingReason(),
    pendingCount: rows.length,
    pending: rows.map((row) => ({
      cardId: row.card_id,
      itemId: row.item_id,
      title: row.title,
      source: row.source,
      origin: row.origin,
      summaryLength: typeof row.summary === "string" ? row.summary.length : 0,
      createdAt: row.created_at,
    })),
    results: [],
  };

  if (!APPLY) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!usable) {
    summary.error = "Embedding provider not usable; refusing to apply.";
    console.log(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  for (const row of rows) {
    if (typeof row.summary !== "string" || row.summary.length === 0) {
      summary.results.push({ cardId: row.card_id, status: "skipped", reason: "empty summary" });
      continue;
    }

    try {
      const embeddingText = buildEmbeddingText(row.title, row.knowledge_tag, row.summary);
      const vector = await generateEmbedding(embeddingText);
      if (!Array.isArray(vector) || vector.length === 0) {
        summary.results.push({ cardId: row.card_id, status: "failed", reason: "empty vector" });
        continue;
      }

      upsertCardEmbedding(row.card_id, vector);
      summary.results.push({ cardId: row.card_id, status: "ok", dimensions: vector.length });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
      summary.results.push({ cardId: row.card_id, status: "failed", reason: message });
    }
  }

  summary.appliedOk = summary.results.filter((entry) => entry.status === "ok").length;
  summary.appliedFailed = summary.results.filter((entry) => entry.status === "failed").length;
  summary.appliedSkipped = summary.results.filter((entry) => entry.status === "skipped").length;

  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
`;

const child = spawn(path.join(repoRoot, "node_modules/.bin/electron"), ["-e", electronScript], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  },
  stdio: ["ignore", "pipe", "inherit"],
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.on("exit", (code) => {
  process.stdout.write(stdout);
  process.exit(code ?? 1);
});
