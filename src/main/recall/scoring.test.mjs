import test from "node:test";
import assert from "node:assert/strict";

import {
  isNearDuplicateChaosReset,
  lexicalSimilarity,
  passesRelatedThreshold,
} from "./scoring.ts";

const chaosQuery = {
  source: "manual_chaos",
  title: "Ship the workflow bridge and stop polishing infra",
  summaryForRetrieval: "ship workflow bridge stop polishing infra and move back to product work",
};

const chaosCandidate = {
  cardId: 1,
  itemId: 10,
  title: "Return to product work after workflow setup",
  summaryForRetrieval: "return to product work after workflow setup and stop overpolishing infra",
  createdAt: Date.now(),
  embedding: [0.1, 0.2],
  source: "manual_chaos",
  origin: "real",
  knowledgeTag: "thread reset",
};

test("isNearDuplicateChaosReset rejects near duplicate manual chaos cards", () => {
  const duplicateCandidate = {
    ...chaosCandidate,
    title: "Ship the workflow bridge and stop polishing infra",
    summaryForRetrieval: "ship workflow bridge stop polishing infra and move back to product work",
  };

  const lexical = lexicalSimilarity(chaosQuery.summaryForRetrieval, duplicateCandidate.summaryForRetrieval);
  assert.equal(isNearDuplicateChaosReset(chaosQuery, duplicateCandidate, lexical), true);
});

test("passesRelatedThreshold rejects weak manual chaos matches", () => {
  const entry = {
    candidate: chaosCandidate,
    lexical: 0.28,
    embedding: 0.5,
    finalScore: 0.54,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), false);
});

test("passesRelatedThreshold allows stronger manual chaos matches", () => {
  const entry = {
    candidate: chaosCandidate,
    lexical: 0.41,
    embedding: 0.61,
    finalScore: 0.64,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), true);
});

test("passesRelatedThreshold keeps non-chaos thresholds unchanged", () => {
  const entry = {
    candidate: {
      ...chaosCandidate,
      source: "tg_text",
    },
    lexical: 0.22,
    embedding: 0.4,
    finalScore: 0.46,
  };

  assert.equal(
    passesRelatedThreshold(
      {
        source: "tg_text",
        title: "Read this article",
        summaryForRetrieval: "read this article and decide whether to apply it",
      },
      entry
    ),
    true
  );
});
