import test from "node:test";
import assert from "node:assert/strict";
import {
  getTelegramPollerRuntimeState,
  markTelegramPollerConflict,
  markTelegramPollerDisabled,
  markTelegramPollerPollSucceeded,
  markTelegramPollerStarting,
  markTelegramPollerStopped,
  resetTelegramPollerRuntimeState
} from "./poller-runtime.ts";

test("telegram poller runtime tracks lifecycle transitions", () => {
  resetTelegramPollerRuntimeState();
  markTelegramPollerStarting(12);
  markTelegramPollerPollSucceeded(13);
  markTelegramPollerStopped();

  const runtime = getTelegramPollerRuntimeState();
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.active, false);
  assert.equal(runtime.lifecycle, "stopped");
  assert.equal(runtime.lastOffset, 13);
  assert.equal(typeof runtime.lastPollAt, "number");
  assert.equal(typeof runtime.lastSuccessAt, "number");
  assert.equal(runtime.lastError, null);
});

test("telegram poller runtime records disabled and conflict states", () => {
  resetTelegramPollerRuntimeState();
  markTelegramPollerDisabled("token missing");

  let runtime = getTelegramPollerRuntimeState();
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.lifecycle, "disabled");
  assert.equal(runtime.lastError, "token missing");

  markTelegramPollerStarting(21);
  markTelegramPollerConflict("Conflict: another getUpdates request is active.");
  runtime = getTelegramPollerRuntimeState();
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.active, true);
  assert.equal(runtime.lifecycle, "conflict");
  assert.equal(runtime.lastOffset, 21);
  assert.equal(runtime.lastError, "Conflict: another getUpdates request is active.");
});
