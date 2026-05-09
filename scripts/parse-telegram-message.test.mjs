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
