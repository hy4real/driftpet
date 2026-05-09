#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();
const targetItemIds = process.argv.slice(2).map((value) => Number(value)).filter((value) => Number.isFinite(value));
const itemIdsArg = targetItemIds.length > 0 ? targetItemIds : [39, 40, 41];

const electronScript = `
const path = require("node:path");
process.env.DRIFTPET_APP_ROOT = ${JSON.stringify(repoRoot)};
const { ensureEnvLoaded } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/env.js"));
ensureEnvLoaded();
const { getDatabase } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/client.js"));
const { listRecallCandidates } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/db/embeddings.js"));
const { findRelatedCards } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/recall/related.js"));
const scoring = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/recall/scoring.js"));
const { canUseEmbeddings, generateEmbedding } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/llm/embeddings.js"));

const TARGET_ITEM_IDS = ${JSON.stringify(itemIdsArg)};

(async () => {
  const db = getDatabase();
  const cards = TARGET_ITEM_IDS.map((itemId) => {
    const row = db.prepare(\`
      SELECT cards.id AS card_id, cards.item_id AS item_id, cards.title AS title, cards.summary_for_retrieval AS summary, items.source AS source, items.raw_url AS raw_url
      FROM cards JOIN items ON items.id = cards.item_id
      WHERE cards.item_id = ?
    \`).get(itemId);
    return row ?? null;
  }).filter((row) => row !== null);

  const report = { embeddingsUsable: canUseEmbeddings(), targets: [] };

  for (const card of cards) {
    const query = {
      source: card.source,
      title: card.title,
      summaryForRetrieval: card.summary,
      rawUrl: card.raw_url,
    };

    const queryEmbedding = canUseEmbeddings()
      ? await generateEmbedding(card.summary).catch(() => null)
      : null;

    const allCandidates = listRecallCandidates(card.item_id, 50);
    const scored = allCandidates.map((candidate) => {
      const lexical = scoring.lexicalSimilarity(card.summary, candidate.summaryForRetrieval);
      const embedding = queryEmbedding !== null && candidate.embedding !== null
        ? scoring.cosineSimilarity(queryEmbedding, candidate.embedding)
        : null;
      const recencyBoost = Math.max(0, 1 - (Date.now() - candidate.createdAt) / (1000 * 60 * 60 * 24 * 30)) * 0.05;
      const finalScore = (embedding !== null ? (embedding * 0.82) + (lexical * 0.18) : lexical) + recencyBoost;
      const entry = { candidate, lexical, embedding, finalScore };

      const eligibleOrigin = candidate.origin === "real";
      const tag = candidate.knowledgeTag !== null ? candidate.knowledgeTag.toLowerCase() : null;
      const lookLikePing = tag === "telegram ping" || candidate.title.toLowerCase().includes("ping") || candidate.summaryForRetrieval.toLowerCase().includes("telegram ping");
      const eligible = eligibleOrigin && (candidate.source !== "tg_text" || lookLikePing === false);
      const nearDup = scoring.isNearDuplicateChaosReset(query, candidate, lexical);
      const passes = eligible && !nearDup && scoring.passesRelatedThreshold(query, entry);

      return {
        candidateCardId: candidate.cardId,
        candidateItemId: candidate.itemId,
        candidateTitle: candidate.title,
        candidateSource: candidate.source,
        candidateOrigin: candidate.origin,
        hasEmbedding: candidate.embedding !== null,
        lexical: Number(lexical.toFixed(4)),
        embedding: embedding === null ? null : Number(embedding.toFixed(4)),
        finalScore: Number(finalScore.toFixed(4)),
        eligibleOrigin,
        eligible,
        nearDuplicate: nearDup,
        passesThreshold: passes,
      };
    });

    const findResult = await findRelatedCards(query, card.item_id);

    report.targets.push({
      cardId: card.card_id,
      itemId: card.item_id,
      title: card.title,
      source: card.source,
      summaryLength: typeof card.summary === "string" ? card.summary.length : 0,
      queryEmbeddingDimensions: queryEmbedding === null ? null : queryEmbedding.length,
      candidateCount: scored.length,
      passingCandidates: scored.filter((entry) => entry.passesThreshold).length,
      topPassingCandidates: scored.filter((entry) => entry.passesThreshold).sort((a, b) => b.finalScore - a.finalScore).slice(0, 5),
      topNonPassing: scored.filter((entry) => entry.eligible && !entry.passesThreshold).sort((a, b) => b.finalScore - a.finalScore).slice(0, 5),
      relatedReturned: findResult.related,
    });
  }

  console.log(JSON.stringify(report, null, 2));
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
