import test from "node:test";
import assert from "node:assert/strict";

const shouldRestartForPath = (filename) => {
  if (typeof filename !== "string" || filename.length === 0) {
    return false;
  }

  return /\.(?:[cm]?js|json)$/i.test(filename);
};

test("shouldRestartForPath only reacts to built Electron artifacts", () => {
  assert.equal(shouldRestartForPath("electron/main.js"), true);
  assert.equal(shouldRestartForPath("electron/preload.cjs"), true);
  assert.equal(shouldRestartForPath("renderer/index.html"), false);
  assert.equal(shouldRestartForPath("tsconfig.tsbuildinfo"), false);
  assert.equal(shouldRestartForPath(""), false);
});
