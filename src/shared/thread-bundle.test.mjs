import test from "node:test";
import assert from "node:assert/strict";

import { buildThreadBundle } from "./thread-bundle.ts";

const anchorCard = {
  id: 1,
  itemId: 1,
  title: "Ship thread mode",
  useFor: "Show continuity before adding storage.",
  knowledgeTag: "thread mode",
  summaryForRetrieval: "ship thread mode and show continuity",
  related: [{ cardId: 2, title: "Reuse related cards", reason: "same line" }],
  petRemark: "Anchor card.",
  createdAt: Date.now(),
};

const relatedCard = {
  id: 2,
  itemId: 2,
  title: "Reuse related cards",
  useFor: "Start from existing data signals.",
  knowledgeTag: "thread mode",
  summaryForRetrieval: "reuse related cards and existing data signals",
  related: [],
  petRemark: "Linked directly.",
  createdAt: Date.now() - 1000,
};

const backlinkCard = {
  id: 3,
  itemId: 3,
  title: "Wire thread panel into workbench",
  useFor: "Make the line visible in UI.",
  knowledgeTag: "workbench",
  summaryForRetrieval: "wire thread panel into workbench ui",
  related: [{ cardId: 1, title: anchorCard.title, reason: "depends on anchor" }],
  petRemark: "Backlink card.",
  createdAt: Date.now() - 2000,
};

const genericTagCard = {
  id: 4,
  itemId: 4,
  title: "Fallback note workflow artifact",
  useFor: "Inspect the generated note.",
  knowledgeTag: "note workflow",
  summaryForRetrieval: "inspect the generated note workflow artifact",
  related: [],
  petRemark: "System workflow card.",
  createdAt: Date.now() - 3000,
};

test("buildThreadBundle keeps anchor, related cards, backlinks, and same-tag cards", () => {
  const bundle = buildThreadBundle(anchorCard, [anchorCard, relatedCard, backlinkCard, genericTagCard]);

  assert.ok(bundle, "expected a bundle");
  assert.equal(bundle.anchorCardId, anchorCard.id);
  assert.deepEqual(
    bundle.cards.map((entry) => [entry.card.id, entry.reason]),
    [
      [1, "anchor"],
      [2, "related"],
      [3, "backlink"],
    ]
  );
});

test("buildThreadBundle skips generic knowledge-tag matching", () => {
  const bundle = buildThreadBundle(genericTagCard, [genericTagCard, {
    ...genericTagCard,
    id: 5,
    itemId: 5,
    title: "Another workflow artifact",
  }]);

  assert.ok(bundle, "expected a bundle");
  assert.deepEqual(
    bundle.cards.map((entry) => entry.card.id),
    [4]
  );
});
