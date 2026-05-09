import test from "node:test";
import assert from "node:assert/strict";
import { classifyUrlNoteKind } from "./url-classifier.ts";

test("classifyUrlNoteKind marks YouTube as video", () => {
  assert.equal(classifyUrlNoteKind("https://www.youtube.com/watch?v=abc"), "video");
});

test("classifyUrlNoteKind marks Bilibili as video", () => {
  assert.equal(classifyUrlNoteKind("https://www.bilibili.com/video/BV1xx411c7mD"), "video");
});

test("classifyUrlNoteKind marks b23 shortlinks as video", () => {
  assert.equal(classifyUrlNoteKind("https://b23.tv/1H2TWaT"), "video");
});

test("classifyUrlNoteKind marks generic web article as article", () => {
  assert.equal(classifyUrlNoteKind("https://example.com/posts/hello"), "article");
});

test("classifyUrlNoteKind marks invalid URL as unknown", () => {
  assert.equal(classifyUrlNoteKind("not-a-url"), "unknown");
});
