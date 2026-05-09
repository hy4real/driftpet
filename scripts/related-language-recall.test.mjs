import test from "node:test";
import assert from "node:assert/strict";

import relatedModule from "../dist-electron/src/main/recall/related.js";

const { isCrossLanguageTelegramTextRecall } = relatedModule;

test("isCrossLanguageTelegramTextRecall rejects mixed-language tg_text recall", () => {
  assert.equal(
    isCrossLanguageTelegramTextRecall(
      {
        source: "tg_text",
        title: "Tighten one driftpet text-card behavior tonight",
        summaryForRetrieval: "Pick one text-card behavior observed in actual driftpet usage and write the first concrete fix for it."
      },
      {
        cardId: 1,
        itemId: 10,
        title: "把 driftpet 高信号卡片写得更具体",
        summaryForRetrieval: "立即检查最近生成的高信号文本卡片，挑出 title 或 useFor 里最空泛的一句，改成指向具体对象和动作的版本。",
        createdAt: Date.now(),
        embedding: null,
        source: "tg_text",
        origin: "real",
        knowledgeTag: "driftpet 卡片具体化",
        rawUrl: null
      }
    ),
    true
  );
});

test("isCrossLanguageTelegramTextRecall allows same-language tg_text recall", () => {
  assert.equal(
    isCrossLanguageTelegramTextRecall(
      {
        source: "tg_text",
        title: "把 driftpet 高信号卡片写得更具体",
        summaryForRetrieval: "立即检查最近生成的高信号文本卡片，挑出 title 或 useFor 里最空泛的一句，改成指向具体对象和动作的版本。"
      },
      {
        cardId: 2,
        itemId: 11,
        title: "先修准刚才那张高信号文本卡片",
        summaryForRetrieval: "暂停 URL 和 recall 扩展，立刻回到上一张高信号文本卡片。只改它的 useFor，让它指向一个马上能执行的动作。",
        createdAt: Date.now(),
        embedding: null,
        source: "tg_text",
        origin: "real",
        knowledgeTag: "高信号卡片修准",
        rawUrl: null
      }
    ),
    false
  );
});

test("isCrossLanguageTelegramTextRecall ignores non-tg_text recall", () => {
  assert.equal(
    isCrossLanguageTelegramTextRecall(
      {
        source: "tg_url",
        title: "Tighten one driftpet text-card behavior tonight",
        summaryForRetrieval: "Pick one text-card behavior observed in actual driftpet usage and write the first concrete fix for it."
      },
      {
        cardId: 3,
        itemId: 12,
        title: "把 driftpet 高信号卡片写得更具体",
        summaryForRetrieval: "立即检查最近生成的高信号文本卡片，挑出 title 或 useFor 里最空泛的一句，改成指向具体对象和动作的版本。",
        createdAt: Date.now(),
        embedding: null,
        source: "tg_text",
        origin: "real",
        knowledgeTag: "driftpet 卡片具体化",
        rawUrl: null
      }
    ),
    false
  );
});
