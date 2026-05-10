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
    embedding: 0.63,
    finalScore: 0.66,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), true);
});

test("isNearDuplicateChaosReset rejects chaos cards that heavily overlap on core tokens", () => {
  const overlapCandidate = {
    ...chaosCandidate,
    title: "Ship product work and stop polishing infra",
    summaryForRetrieval: "ship product work stop polishing infra and move back to the main thread",
  };

  const lexical = lexicalSimilarity(chaosQuery.summaryForRetrieval, overlapCandidate.summaryForRetrieval);
  assert.equal(isNearDuplicateChaosReset(chaosQuery, overlapCandidate, lexical), true);
});

test("passesRelatedThreshold accepts strong embedding chaos matches even when lexical overlap is zero", () => {
  const entry = {
    candidate: chaosCandidate,
    lexical: 0,
    embedding: 0.78,
    finalScore: 0.6896,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), true);
});

test("passesRelatedThreshold still rejects strong-embedding chaos matches when final score is too low", () => {
  const entry = {
    candidate: chaosCandidate,
    lexical: 0,
    embedding: 0.72,
    finalScore: 0.5,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), false);
});

test("passesRelatedThreshold still requires lexical floor for mid-strength embedding chaos matches", () => {
  const entry = {
    candidate: chaosCandidate,
    lexical: 0,
    embedding: 0.65,
    finalScore: 0.6,
  };

  assert.equal(passesRelatedThreshold(chaosQuery, entry), false);
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

test("passesRelatedThreshold rejects cross-language chaos matches without lexical support below the stronger floor", () => {
  const zhQuery = {
    source: "manual_chaos",
    title: "整理两数之和的哈希表解法",
    summaryForRetrieval: "整理两数之和的哈希表解法并用 Java 实现",
  };

  const enCandidate = {
    ...chaosCandidate,
    title: "Implement hash-map solutions for LeetCode problems",
    summaryForRetrieval: "implement hash map solutions for leetcode two sum and group anagrams",
  };

  const entry = {
    candidate: enCandidate,
    lexical: 0,
    embedding: 0.5732,
    finalScore: 0.52,
    crossLanguage: true,
  };

  assert.equal(passesRelatedThreshold(zhQuery, entry), false);
});

test("passesRelatedThreshold allows cross-language chaos matches with very strong embedding", () => {
  const zhQuery = {
    source: "manual_chaos",
    title: "整理两数之和的哈希表解法",
    summaryForRetrieval: "整理两数之和的哈希表解法并用 Java 实现",
  };

  const enCandidate = {
    ...chaosCandidate,
    title: "Implement two-sum hash map in Java",
    summaryForRetrieval: "implement two sum hash map in Java and return the matching indices",
  };

  const entry = {
    candidate: enCandidate,
    lexical: 0,
    embedding: 0.63,
    finalScore: 0.57,
    crossLanguage: true,
  };

  assert.equal(passesRelatedThreshold(zhQuery, entry), true);
});

test("passesRelatedThreshold allows cross-language chaos matches with some shared terms", () => {
  const zhQuery = {
    source: "manual_chaos",
    title: "整理 Java HashMap 解法",
    summaryForRetrieval: "整理 Java HashMap 的两数之和解法",
  };

  const enCandidate = {
    ...chaosCandidate,
    title: "Implement Java HashMap solution",
    summaryForRetrieval: "implement Java HashMap solution for two sum",
  };

  const entry = {
    candidate: enCandidate,
    lexical: 0.12,
    embedding: 0.55,
    finalScore: 0.52,
    crossLanguage: true,
  };

  assert.equal(passesRelatedThreshold(zhQuery, entry), true);
});

test("passesRelatedThreshold rejects cross-language chaos matches with weak embedding", () => {
  const zhQuery = {
    source: "manual_chaos",
    title: "写一段关于代码智能体的短论点",
    summaryForRetrieval: "写一段关于代码智能体如何改变持续学习路径的短论点",
  };

  const enCandidate = {
    ...chaosCandidate,
    title: "Implement Group Anagrams using a sorted-string hash map key",
    summaryForRetrieval: "implement group anagrams using sorted string hash map key and return grouped results",
  };

  const entry = {
    candidate: enCandidate,
    lexical: 0,
    embedding: 0.39,
    finalScore: 0.37,
    crossLanguage: true,
  };

  assert.equal(passesRelatedThreshold(zhQuery, entry), false);
});
