import test from "node:test";
import assert from "node:assert/strict";

import { decideClipboardAction, isOfferableClipboardText } from "./watcher.ts";

test("isOfferableClipboardText filters out empty, too-short, and too-long blobs", () => {
  assert.equal(isOfferableClipboardText(""), false);
  assert.equal(isOfferableClipboardText("   "), false);
  assert.equal(isOfferableClipboardText("hi"), false, "9 chars or fewer is treated as a glance, not an offer");
  assert.equal(isOfferableClipboardText("a".repeat(2001)), false, "very large blobs likely a doc dump, not a note");
  assert.equal(isOfferableClipboardText("just enough text"), true);
});

test("decideClipboardAction returns no offer when the clipboard is unchanged", () => {
  const result = decideClipboardAction("same text here", "same text here");
  assert.equal(result.offer, null);
  assert.equal(result.lastSeenText, "same text here");
});

test("decideClipboardAction emits an offer when fresh offerable text appears", () => {
  const result = decideClipboardAction("a fresh thing the user just copied", "older content");
  assert.equal(result.offer, "a fresh thing the user just copied");
  assert.equal(result.lastSeenText, "a fresh thing the user just copied", "advance the pointer so the next poll doesn't re-offer");
});

test("decideClipboardAction advances the pointer for fresh-but-low-signal text without offering", () => {
  const result = decideClipboardAction("hi", "older content");
  assert.equal(result.offer, null);
  assert.equal(result.lastSeenText, "hi", "even tiny new clipboard text becomes the new baseline so we stop checking it");
});

test("decideClipboardAction trims whitespace before offering so leading/trailing space doesn't leak", () => {
  const result = decideClipboardAction("   real content with padding   ", "");
  assert.equal(result.offer, "real content with padding");
  assert.equal(result.lastSeenText, "   real content with padding   ", "lastSeen tracks raw text so re-poll equality still holds");
});
