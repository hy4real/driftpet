import test from "node:test";
import assert from "node:assert/strict";

import { rankHistoryCards } from "./rank-history.ts";

const now = Date.now();

const makeCard = (overrides = {}) => ({
  id: 1,
  itemId: 1,
  title: "Card",
  useFor: "Do the thing.",
  knowledgeTag: "thread mode",
  summaryForRetrieval: "card",
  threadCache: null,
  related: [],
  petRemark: "card",
  createdAt: now,
  ...overrides,
});

test("rankHistoryCards prioritizes recently released cards first", () => {
  const older = makeCard({ id: 1, createdAt: now - 1000 });
  const newer = makeCard({ id: 2, createdAt: now });

  const ranked = rankHistoryCards([older, newer], {
    recentlyReleasedCardId: older.id,
    now,
  });

  assert.deepEqual(ranked.map((card) => card.id), [1, 2]);
});

test("rankHistoryCards prioritizes cards related to the current anchor", () => {
  const anchor = makeCard({
    id: 10,
    related: [{ cardId: 3, title: "Related", reason: "same line" }],
  });
  const unrelated = makeCard({ id: 2, createdAt: now });
  const related = makeCard({ id: 3, createdAt: now - 1000 });

  const ranked = rankHistoryCards([unrelated, related], {
    anchorCard: anchor,
    now,
  });

  assert.deepEqual(ranked.map((card) => card.id), [3, 2]);
});

test("rankHistoryCards prefers active waiting and fresh resolved cards over plain recency", () => {
  const plain = makeCard({ id: 1, createdAt: now });
  const resolved = makeCard({
    id: 2,
    createdAt: now - 1000,
    threadCache: {
      chasing: "resolved",
      workingJudgment: null,
      ruledOut: null,
      nextMove: "continue",
      meanwhile: null,
      waitingOn: null,
      waitingResolvedAt: now - 5_000,
      sideThread: null,
      expiresWhen: null,
    },
  });
  const waiting = makeCard({
    id: 3,
    createdAt: now - 2000,
    threadCache: {
      chasing: "waiting",
      workingJudgment: null,
      ruledOut: null,
      nextMove: "do other work",
      meanwhile: "do other work",
      waitingOn: "reply",
      waitingResolvedAt: null,
      sideThread: null,
      expiresWhen: null,
    },
  });

  const ranked = rankHistoryCards([plain, resolved, waiting], { now });

  assert.deepEqual(ranked.map((card) => card.id), [3, 2, 1]);
});

test("rankHistoryCards prefers cards with captured Claude results over plain recency", () => {
  const plain = makeCard({ id: 1, createdAt: now });
  const withResult = makeCard({
    id: 2,
    createdAt: now - 1000,
    latestClaudeDispatch: {
      command: "claude",
      promptPath: "/tmp/prompt.md",
      runner: "claude-test",
      cwd: "/tmp",
      createdAt: now - 1000,
      status: "done",
      resultSummary: "Implemented and verified.",
    },
  });

  const ranked = rankHistoryCards([plain, withResult], { now });

  assert.deepEqual(ranked.map((card) => card.id), [2, 1]);
});

test("rankHistoryCards lets stale unrelated cards sink behind fresher cards", () => {
  const stale = makeCard({
    id: 1,
    createdAt: now - 4 * 24 * 60 * 60 * 1000,
  });
  const fresher = makeCard({
    id: 2,
    createdAt: now - 2 * 24 * 60 * 60 * 1000,
  });

  const ranked = rankHistoryCards([stale, fresher], { now });

  assert.deepEqual(ranked.map((card) => card.id), [2, 1]);
});

test("rankHistoryCards does not sink stale cards that are still related or have fresh signals", () => {
  const anchor = makeCard({
    id: 10,
    related: [{ cardId: 1, title: "Related", reason: "same line" }],
  });
  const staleRelated = makeCard({
    id: 1,
    createdAt: now - 5 * 24 * 60 * 60 * 1000,
  });
  const staleWithResult = makeCard({
    id: 2,
    createdAt: now - 6 * 24 * 60 * 60 * 1000,
    latestClaudeDispatch: {
      command: "claude",
      promptPath: "/tmp/prompt.md",
      runner: "claude-test",
      cwd: "/tmp",
      createdAt: now - 1_000,
      status: "done",
      resultSummary: "Still relevant.",
    },
  });
  const fresherPlain = makeCard({
    id: 3,
    createdAt: now - 2 * 24 * 60 * 60 * 1000,
  });

  const ranked = rankHistoryCards([staleRelated, staleWithResult, fresherPlain], {
    anchorCard: anchor,
    now,
  });

  assert.deepEqual(ranked.map((card) => card.id), [1, 2, 3]);
});
