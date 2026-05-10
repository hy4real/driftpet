import test from "node:test";
import assert from "node:assert/strict";

import { parseTelegramMessage } from "../src/main/telegram/parse-message.ts";

test("parseTelegramMessage prefers the fuller URL from text when entity URL looks truncated", () => {
  const message = {
    message_id: 501,
    chat: { id: 424242 },
    text: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
    entities: [
      {
        type: "url",
        offset: 0,
        length: "https://developer.mozilla.org/en-US/docs/Web/API/Fetc".length
      }
    ]
  };

  const parsed = parseTelegramMessage(message);
  assert.ok(parsed);
  assert.equal(parsed.source, "tg_url");
  assert.equal(
    parsed.rawUrl,
    "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API"
  );
});

test("parseTelegramMessage keeps text_link entity URLs", () => {
  const message = {
    message_id: 502,
    chat: { id: 424242 },
    text: "MDN Fetch API reference",
    entities: [
      {
        type: "text_link",
        offset: 0,
        length: "MDN Fetch API reference".length,
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API"
      }
    ]
  };

  const parsed = parseTelegramMessage(message);
  assert.ok(parsed);
  assert.equal(parsed.source, "tg_url");
  assert.equal(
    parsed.rawUrl,
    "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API"
  );
});

test("parseTelegramMessage extracts a URL embedded inside surrounding text", () => {
  const message = {
    message_id: 503,
    chat: { id: 424242 },
    text: "帮我看这个视频 https://b23.tv/Cmz4QJI 我觉得值得收一张卡",
    entities: [
      {
        type: "url",
        offset: "帮我看这个视频 ".length,
        length: "https://b23.tv/Cmz4QJI".length
      }
    ]
  };

  const parsed = parseTelegramMessage(message);
  assert.ok(parsed);
  assert.equal(parsed.source, "tg_url");
  assert.equal(parsed.rawText, "帮我看这个视频 https://b23.tv/Cmz4QJI 我觉得值得收一张卡");
  assert.equal(parsed.rawUrl, "https://b23.tv/Cmz4QJI");
});

test("parseTelegramMessage falls back to regex URL detection when entities are missing", () => {
  const message = {
    message_id: 504,
    chat: { id: 424242 },
    text: "这里也有链接 https://www.bilibili.com/video/BV1mxR9BiEm8/?share_source=copy_web"
  };

  const parsed = parseTelegramMessage(message);
  assert.ok(parsed);
  assert.equal(parsed.source, "tg_url");
  assert.equal(
    parsed.rawUrl,
    "https://www.bilibili.com/video/BV1mxR9BiEm8/?share_source=copy_web"
  );
});
