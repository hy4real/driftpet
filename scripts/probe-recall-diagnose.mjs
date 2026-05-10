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
const { detectOutputLanguage } = require(path.join(${JSON.stringify(repoRoot)}, "dist-electron/src/main/llm/language.js"));

const TARGET_ITEM_IDS = ${JSON.stringify(itemIdsArg)};

const buildEmbeddingText = (title, knowledgeTag, summaryForRetrieval) => {
  return \`\${title} | \${knowledgeTag ?? ""} | \${summaryForRetrieval}\`;
};

const normalizeUrlForRecall = (value) => {
  try {
    const parsed = new URL(value);
    let pathname = parsed.pathname.replace(/\\/+$/, "");

    if (parsed.hostname === "developer.mozilla.org") {
      pathname = pathname.replace(/^\\/[a-z]{2}(?:-[A-Z]{2})?\\//, "/");
    }

    return \`\${parsed.hostname}\${pathname}\`.toLowerCase();
  } catch {
    return String(value ?? "").trim().toLowerCase();
  }
};

const isRecallEligible = (candidate) => {
  if (candidate.origin !== "real") {
    return false;
  }

  if (candidate.knowledgeTag !== null && candidate.knowledgeTag.toLowerCase() === "telegram ping") {
    return false;
  }

  const title = candidate.title.toLowerCase();
  const summary = candidate.summaryForRetrieval.toLowerCase();
  const looksLikePing = title.includes("ping") || summary.includes("telegram ping");
  return candidate.source !== "tg_text" || looksLikePing === false;
};

const isSameUrlReference = (query, candidate) => {
  if (query.source !== "tg_url" || candidate.source !== "tg_url") {
    return false;
  }

  if (query.rawUrl === undefined || query.rawUrl === null || candidate.rawUrl === null) {
    return false;
  }

  return normalizeUrlForRecall(query.rawUrl) === normalizeUrlForRecall(candidate.rawUrl);
};

const isCrossLanguageTelegramTextRecall = (query, candidate) => {
  if (query.source !== "tg_text" || candidate.source !== "tg_text") {
    return false;
  }

  const queryLanguage = detectOutputLanguage(query.title, query.summaryForRetrieval);
  const candidateLanguage = detectOutputLanguage(candidate.title, candidate.summaryForRetrieval);
  return queryLanguage !== candidateLanguage;
};

(async () => {
  const db = getDatabase();
  const cards = TARGET_ITEM_IDS.map((itemId) => {
    const row = db.prepare(\`
      SELECT cards.id AS card_id, cards.item_id AS item_id, cards.title AS title, cards.knowledge_tag AS knowledge_tag, cards.summary_for_retrieval AS summary, items.source AS source, items.raw_url AS raw_url
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
      knowledgeTag: card.knowledge_tag,
      summaryForRetrieval: card.summary,
      rawUrl: card.raw_url,
    };

    const queryText = buildEmbeddingText(card.title, card.knowledge_tag, card.summary);
    const queryEmbedding = canUseEmbeddings()
      ? await generateEmbedding(queryText).catch(() => null)
      : null;

    const allCandidates = listRecallCandidates(card.item_id, 50);
    const scored = allCandidates.map((candidate) => {
      const candidateText = buildEmbeddingText(candidate.title, candidate.knowledgeTag, candidate.summaryForRetrieval);
      const lexical = scoring.lexicalSimilarity(queryText, candidateText);
      const embedding = queryEmbedding !== null && candidate.embedding !== null
        ? scoring.cosineSimilarity(queryEmbedding, candidate.embedding)
        : null;
      const recencyBoost = Math.max(0, 1 - (Date.now() - candidate.createdAt) / (1000 * 60 * 60 * 24 * 30)) * 0.05;
      const finalScore = (embedding !== null ? (embedding * 0.82) + (lexical * 0.18) : lexical) + recencyBoost;
      const entry = { candidate, lexical, embedding, finalScore };

      const eligibleOrigin = candidate.origin === "real";
      const eligible = isRecallEligible(candidate);
      const sameUrlReference = isSameUrlReference(query, candidate);
      const crossLanguageTelegramText = isCrossLanguageTelegramTextRecall(query, candidate);
      const nearDup = scoring.isNearDuplicateChaosReset(query, candidate, lexical);
      const crossLanguage = query.source === "manual_chaos"
        && candidate.source === "manual_chaos"
        && detectOutputLanguage(query.title, query.summaryForRetrieval) !== detectOutputLanguage(candidate.title, candidate.summaryForRetrieval);
      const thresholdEntry = { ...entry, crossLanguage };
      const passes = eligible
        && !sameUrlReference
        && !crossLanguageTelegramText
        && !nearDup
        && scoring.passesRelatedThreshold(query, thresholdEntry);

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
        sameUrlReference,
        crossLanguageTelegramText,
        crossLanguage,
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
