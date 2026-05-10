import test from "node:test";
import assert from "node:assert/strict";

const summarize = (value, limit) => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
};

const buildTelegramReportText = (enriched, card, created) => {
  const outcome = enriched.itemStatus === "failed" ? "失败" : "完成";
  const artifactLine = enriched.artifactPath === null ? "无" : enriched.artifactPath;
  const errorLine = enriched.extractionError ?? enriched.lastError;
  const lines = [
    `${created ? "✅" : "↩️"} 已${outcome}`,
    `标题：${card.title}`,
    `卡片：#${card.id}`,
    `处理器：${enriched.processor ?? "unknown"}`,
    `产物：${artifactLine}`
  ];

  if (errorLine !== null && errorLine.trim().length > 0) {
    lines.push(`说明：${summarize(errorLine, 260)}`);
  }

  return lines.join("\n");
};

test("buildTelegramReportText renders success payload with artifact path", () => {
  const text = buildTelegramReportText({
    itemStatus: "digested",
    artifactPath: "/Users/mac/my-obsidian-vault/AI/Bilibili/test.md",
    extractionError: null,
    lastError: null,
    processor: "video-to-note"
  }, {
    id: 75,
    title: "test"
  }, true);

  assert.match(text, /^✅ 已完成/m);
  assert.match(text, /标题：test/);
  assert.match(text, /卡片：#75/);
  assert.match(text, /处理器：video-to-note/);
  assert.match(text, /产物：\/Users\/mac\/my-obsidian-vault\/AI\/Bilibili\/test\.md/);
});

test("buildTelegramReportText renders failure payload with explanation", () => {
  const text = buildTelegramReportText({
    itemStatus: "failed",
    artifactPath: null,
    extractionError: "Claude note workflow timed out after 1000ms.",
    lastError: null,
    processor: "video-to-note"
  }, {
    id: 76,
    title: "笔记接力失败：video-to-note"
  }, false);

  assert.match(text, /^↩️ 已失败/m);
  assert.match(text, /产物：无/);
  assert.match(text, /说明：Claude note workflow timed out after 1000ms\./);
});
