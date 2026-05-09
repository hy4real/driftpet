import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const localTempRoot = path.resolve(".tmp");
const settingsEntry = path.resolve("src/main/claude/settings.ts");

const buildSettingsModule = async () => {
  await fs.mkdir(localTempRoot, { recursive: true });
  const tempDir = await fs.mkdtemp(path.join(localTempRoot, "driftpet-claude-settings-"));
  const outfile = path.join(tempDir, "settings.cjs");

  await build({
    entryPoints: [settingsEntry],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile,
    loader: {
      ".ts": "ts",
    },
    external: ["better-sqlite3"],
  });

  const moduleExports = require(outfile);
  return {
    normalizeClaudeDispatchSettings: moduleExports.normalizeClaudeDispatchSettings,
    cleanupBundle: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

test("normalizeClaudeDispatchSettings defaults blanks and only preserves isolated mode", async () => {
  const { normalizeClaudeDispatchSettings, cleanupBundle } = await buildSettingsModule();

  try {
    assert.deepEqual(normalizeClaudeDispatchSettings({
      terminalApp: " iTerm ",
      workingDirectory: " /repo ",
      continuityMode: "isolated",
    }, "/default/repo"), {
      terminalApp: "iTerm",
      workingDirectory: "/repo",
      continuityMode: "isolated",
    });

    assert.deepEqual(normalizeClaudeDispatchSettings({
      terminalApp: "",
      workingDirectory: "",
      continuityMode: "continuous",
    }, "/default/repo"), {
      terminalApp: "Ghostty",
      workingDirectory: "/default/repo",
      continuityMode: "continuous",
    });
  } finally {
    await cleanupBundle();
  }
});
